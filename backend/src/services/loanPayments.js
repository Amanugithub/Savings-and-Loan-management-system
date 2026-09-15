import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { accrueLoanPenalties, getPenaltiesWithOutstanding } from './loanPenalties.js';

// Overpayment tolerance for rounding noise between the client-supplied
// amount and the sum of amounts computed here.
const EPSILON = 0.005;
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money'];
export const ALLOCATION_MODES = ['carry_forward', 'cash_rounding_current'];
export const MAX_CASH_ROUNDING_EXCESS = 5;

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const installmentsStmt = db.prepare(
  `SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY installment_number ASC`
);

const collectionExpenseOwedStmt = db.prepare(
  `SELECT
     COALESCE((SELECT SUM(amount) FROM expenses WHERE loan_id = ? AND category = 'collection_expense'), 0)
     - COALESCE((SELECT SUM(amount) FROM loan_payment_allocations WHERE loan_id = ? AND bucket = 'collection_expense'), 0)
   AS owed`
);

const updateInstallmentStmt = db.prepare(
  `UPDATE loan_installments
   SET principal_due = ?, interest_due = ?, insurance_due = ?,
       principal_paid = ?, interest_paid = ?, insurance_paid = ?, status = ?,
       updated_at = datetime('now'), synced_at = NULL
   WHERE id = ?`
);

const insertPaymentStmt = db.prepare(
  `INSERT INTO loan_payments (id, loan_id, member_id, amount, payment_date, payment_method, recorded_by, idempotency_key, notes, synced_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
);

const insertAllocationStmt = db.prepare(
  `INSERT INTO loan_payment_allocations (id, payment_id, loan_id, bucket, amount, installment_id, penalty_id, synced_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
);

function installmentStatus(installment) {
  const fullyPaid =
    installment.principal_paid >= installment.principal_due &&
    installment.interest_paid >= installment.interest_due &&
    installment.insurance_paid >= installment.insurance_due;
  if (fullyPaid) return 'paid';
  const anyPaid = installment.principal_paid > 0 || installment.interest_paid > 0 || installment.insurance_paid > 0;
  return anyPaid ? 'partially_paid' : 'unpaid';
}

/**
 * What a loan still owes right now, broken into the same three waterfall
 * buckets a payment is allocated into (Article 16): collection expenses,
 * interest+insurance+penalties, and principal. Does not accrue penalties
 * itself — call accrueLoanPenalties(loan) first if the caller needs an
 * up-to-date figure.
 */
export function getOutstandingBalance(loan) {
  const installments = installmentsStmt.all(loan.id);
  const penalties = getPenaltiesWithOutstanding(loan.id);

  const collectionExpenses = Math.max(0, collectionExpenseOwedStmt.get(loan.id, loan.id).owed);
  const interestInsurance = installments.reduce(
    (sum, row) => sum
      + Math.max(0, row.interest_due - row.interest_paid)
      + Math.max(0, row.insurance_due - row.insurance_paid),
    0
  );
  const penaltyOutstanding = penalties.reduce((sum, row) => sum + row.outstanding, 0);
  const principal = installments.reduce((sum, row) => sum + Math.max(0, row.principal_due - row.principal_paid), 0);

  return {
    collection_expenses: roundMoney(collectionExpenses),
    interest_insurance_penalties: roundMoney(interestInsurance + penaltyOutstanding),
    principal: roundMoney(principal),
    total: roundMoney(collectionExpenses + interestInsurance + penaltyOutstanding + principal),
  };
}

function createPaymentPlan(loan, amount, {
  paymentMethod = 'cash',
  allocationMode = 'carry_forward',
} = {}) {
  const outstanding = getOutstandingBalance(loan);
  const installments = installmentsStmt.all(loan.id);
  const penaltiesByPeriod = new Map(
    getPenaltiesWithOutstanding(loan.id).map((penalty) => [penalty.penalty_period, { ...penalty }])
  );
  const nextInstallment = installments.find((installment) => {
    const penalty = penaltiesByPeriod.get(installment.due_date.slice(0, 7));
    return installment.principal_due > installment.principal_paid
      || installment.interest_due > installment.interest_paid
      || installment.insurance_due > installment.insurance_paid
      || penalty?.outstanding > 0;
  });
  const nextPenalty = nextInstallment
    ? penaltiesByPeriod.get(nextInstallment.due_date.slice(0, 7))
    : null;
  const nextInstallmentDue = nextInstallment
    ? roundMoney(
        Math.max(0, nextInstallment.principal_due - nextInstallment.principal_paid)
        + Math.max(0, nextInstallment.interest_due - nextInstallment.interest_paid)
        + Math.max(0, nextInstallment.insurance_due - nextInstallment.insurance_paid)
        + (nextPenalty?.outstanding ?? 0)
      )
    : 0;
  const amountAvailableForInstallment = Math.max(0, roundMoney(amount - outstanding.collection_expenses));
  const excessOverInstallment = nextInstallment
    ? Math.max(0, roundMoney(amountAvailableForInstallment - nextInstallmentDue))
    : 0;

  const isCashRoundingMode = allocationMode === 'cash_rounding_current';
  const canAcceptSmallRoundingOverpayment = isCashRoundingMode
    && paymentMethod === 'cash'
    && excessOverInstallment <= MAX_CASH_ROUNDING_EXCESS + EPSILON;

  if (amount > outstanding.total + EPSILON && !canAcceptSmallRoundingOverpayment) {
    return {
      overpaid: true,
      outstanding,
      allocations: [],
      installments,
      remaining: amount,
      payment_method: paymentMethod,
      allocation_mode: allocationMode,
      next_installment: nextInstallment
        ? {
            installment_number: nextInstallment.installment_number,
            due_date: nextInstallment.due_date,
            principal_remaining: roundMoney(nextInstallment.principal_due - nextInstallment.principal_paid),
            interest_remaining: roundMoney(nextInstallment.interest_due - nextInstallment.interest_paid),
            insurance_remaining: roundMoney(nextInstallment.insurance_due - nextInstallment.insurance_paid),
            penalty_remaining: roundMoney(nextPenalty?.outstanding ?? 0),
            total_remaining: nextInstallmentDue,
          }
        : null,
      amount_for_installment: amountAvailableForInstallment,
      shortfall: nextInstallment
        ? Math.max(0, roundMoney(nextInstallmentDue - amountAvailableForInstallment))
        : 0,
      excess_over_installment: excessOverInstallment,
    };
  }

  if (isCashRoundingMode && paymentMethod !== 'cash') {
    return {
      invalid_allocation_mode: true,
      error: 'cash_rounding_current is only available for cash payments',
      outstanding,
      allocations: [],
      installments,
      remaining: amount,
      payment_method: paymentMethod,
      allocation_mode: allocationMode,
    };
  }

  if (isCashRoundingMode && excessOverInstallment > MAX_CASH_ROUNDING_EXCESS + EPSILON) {
    return {
      invalid_allocation_mode: true,
      error: `Cash rounding can cover at most ${MAX_CASH_ROUNDING_EXCESS.toFixed(2)} ETB above the current installment`,
      outstanding,
      allocations: [],
      installments,
      remaining: amount,
      payment_method: paymentMethod,
      allocation_mode: allocationMode,
      excess_over_installment: excessOverInstallment,
    };
  }

  let remaining = amount;
  const allocations = [];
  const patches = new Map(installments.map((row) => [row.id, { ...row }]));
  let cashRoundingAdjustment = 0;

  // A cash rounding adjustment is recorded against the current installment,
  // while the final installment's principal is reduced by the same amount.
  // This keeps the loan balance and eventual payoff amount correct without
  // silently moving the receipt into a future month. If the current
  // installment is the final one, the small excess is accepted as a rounding
  // overpayment and the loan can close normally.
  if (isCashRoundingMode && excessOverInstallment > EPSILON) {
    cashRoundingAdjustment = excessOverInstallment;
    const finalInstallment = installments[installments.length - 1];
    if (nextInstallment && finalInstallment && nextInstallment.id !== finalInstallment.id) {
      const finalPatch = patches.get(finalInstallment.id);
      const reducible = Math.min(
        cashRoundingAdjustment,
        Math.max(0, roundMoney(finalPatch.principal_due - finalPatch.principal_paid))
      );
      finalPatch.principal_due = roundMoney(finalPatch.principal_due - reducible);
    }
  }

  const allocate = (bucket, due, installmentId, penaltyId) => {
    const owed = roundMoney(due);
    if (remaining <= 0 || owed <= 0) return 0;
    const applied = roundMoney(Math.min(remaining, owed));
    if (applied <= 0) return 0;

    const installment = installmentId
      ? installments.find((row) => row.id === installmentId)
      : null;
    allocations.push({
      bucket,
      amount: applied,
      installment_id: installmentId ?? null,
      installment_number: installment?.installment_number ?? null,
      due_date: installment?.due_date ?? null,
      penalty_id: penaltyId ?? null,
    });
    remaining = roundMoney(remaining - applied);
    return applied;
  };

  allocate('collection_expense', outstanding.collection_expenses, null, null);

  for (const installment of installments) {
    const patch = patches.get(installment.id);

    const appliedInterest = allocate(
      'interest_penalty',
      patch.interest_due - patch.interest_paid,
      installment.id,
      null
    );
    patch.interest_paid = roundMoney(patch.interest_paid + appliedInterest);

    const appliedInsurance = allocate(
      'interest_penalty',
      patch.insurance_due - patch.insurance_paid,
      installment.id,
      null
    );
    patch.insurance_paid = roundMoney(patch.insurance_paid + appliedInsurance);

    const period = installment.due_date.slice(0, 7);
    const penalty = penaltiesByPeriod.get(period);
    if (penalty) {
      const appliedPenalty = allocate('interest_penalty', penalty.outstanding, null, penalty.id);
      penalty.outstanding = roundMoney(penalty.outstanding - appliedPenalty);
    }

    const appliedPrincipal = allocate(
      'principal',
      patch.principal_due - patch.principal_paid,
      installment.id,
      null
    );
    patch.principal_paid = roundMoney(patch.principal_paid + appliedPrincipal);

    if (isCashRoundingMode && nextInstallment?.id === installment.id) {
      if (cashRoundingAdjustment > EPSILON) {
        allocate('cash_rounding_adjustment', cashRoundingAdjustment, installment.id, null);
      }
      break;
    }
  }

  const updatedInstallments = installments.map((installment) => {
    const patch = patches.get(installment.id);
    return { ...patch, status: installmentStatus(patch) };
  });

  return {
    overpaid: false,
    payment_method: paymentMethod,
    allocation_mode: allocationMode,
    outstanding,
    allocations,
    installments: updatedInstallments,
    remaining,
    cash_rounding_adjustment: cashRoundingAdjustment,
    next_installment: nextInstallment
      ? {
          installment_number: nextInstallment.installment_number,
          due_date: nextInstallment.due_date,
          principal_remaining: roundMoney(nextInstallment.principal_due - nextInstallment.principal_paid),
          interest_remaining: roundMoney(nextInstallment.interest_due - nextInstallment.interest_paid),
          insurance_remaining: roundMoney(nextInstallment.insurance_due - nextInstallment.insurance_paid),
          penalty_remaining: roundMoney(nextPenalty?.outstanding ?? 0),
          total_remaining: nextInstallmentDue,
        }
      : null,
    amount_for_installment: amountAvailableForInstallment,
    shortfall: nextInstallment
      ? Math.max(0, roundMoney(nextInstallmentDue - amountAvailableForInstallment))
      : 0,
    excess_over_installment: excessOverInstallment,
  };
}

export function previewLoanPayment(loan, { amount, paymentMethod = 'cash', allocationMode = 'carry_forward' }) {
  return db.transaction(() => {
    accrueLoanPenalties(loan);
    return createPaymentPlan(loan, amount, { paymentMethod, allocationMode });
  })();
}

/**
 * Records a payment against a loan and allocates it across the Article 16
 * waterfall: collection expenses first, then interest/insurance/penalties,
 * then principal for each oldest installment
 * before moving to the next installment. This keeps a normal monthly payment
 * attached to one monthly installment instead of paying interest across the
 * entire schedule before any principal. The whole thing runs as one atomic
 * transaction — the payment row, every allocation row, and every installment
 * update commit together or none of them do.
 *
 * Returns { overpaid: true, outstanding } without writing anything if
 * `amount` exceeds what's left on the loan. The only exception is an
 * explicitly selected cash rounding adjustment of at most 5 ETB above the
 * current installment.
 */
export function recordLoanPayment(loan, {
  amount,
  paymentDate,
  paymentMethod = 'cash',
  allocationMode = 'carry_forward',
  notes,
  recordedBy,
  idempotencyKey,
}) {
  return db.transaction(() => {
    const existing = db.prepare(
      'SELECT * FROM loan_payments WHERE loan_id = ? AND idempotency_key = ?'
    ).get(loan.id, idempotencyKey);
    if (existing) {
      const allocations = db.prepare(
        `SELECT a.*, i.installment_number, i.due_date
         FROM loan_payment_allocations a
         LEFT JOIN loan_installments i ON i.id = a.installment_id
         WHERE a.payment_id = ?
         ORDER BY a.created_at ASC`
      ).all(existing.id);
      const installments = installmentsStmt.all(loan.id);
      const currentLoan = db.prepare('SELECT status FROM loans WHERE id = ?').get(loan.id);
      return {
        overpaid: false,
        idempotent: true,
        payment: existing,
        allocations,
        installments,
        outstanding_balance: getOutstandingBalance(loan),
        loan_status: currentLoan?.status ?? loan.status,
      };
    }

    accrueLoanPenalties(loan);

    const plan = createPaymentPlan(loan, amount, { paymentMethod, allocationMode });
    if (plan.invalid_allocation_mode) return plan;
    if (plan.overpaid) return plan;

    const paymentId = randomUUID();
    insertPaymentStmt.run(
      paymentId,
      loan.id,
      loan.member_id,
      amount,
      paymentDate,
      paymentMethod,
      recordedBy,
      idempotencyKey,
      notes ?? null
    );

    if (plan.remaining > EPSILON) {
      throw new Error('PAYMENT_ALLOCATION_MISMATCH');
    }

    const allocations = plan.allocations.map((allocation) => {
      const id = randomUUID();
      insertAllocationStmt.run(
        id,
        paymentId,
        loan.id,
        allocation.bucket,
        allocation.amount,
        allocation.installment_id,
        allocation.penalty_id,
      );
      return {
        id,
        payment_id: paymentId,
        loan_id: loan.id,
        ...allocation,
      };
    });

    const updatedInstallments = [];
    for (const installment of plan.installments) {
      updateInstallmentStmt.run(
        installment.principal_due,
        installment.interest_due,
        installment.insurance_due,
        installment.principal_paid,
        installment.interest_paid,
        installment.insurance_paid,
        installment.status,
        installment.id
      );
      updatedInstallments.push(installment);
    }

    const outstandingBalance = getOutstandingBalance(loan);
    let loanStatus = loan.status;
    if (outstandingBalance.total <= EPSILON) {
      const closed = db.prepare(
        `UPDATE loans
         SET status = 'closed', updated_at = datetime('now'), synced_at = NULL
         WHERE id = ? AND status = 'active'`
      ).run(loan.id);
      if (closed.changes === 1) loanStatus = 'closed';
    }

    const payment = db.prepare('SELECT * FROM loan_payments WHERE id = ?').get(paymentId);

    return {
      overpaid: false,
      payment,
      allocations,
      installments: updatedInstallments,
      outstanding_balance: outstandingBalance,
      loan_status: loanStatus,
    };
  })();
}
