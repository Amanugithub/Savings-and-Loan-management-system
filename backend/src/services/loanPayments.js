import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { accrueLoanPenalties, getPenaltiesWithOutstanding } from './loanPenalties.js';

// Overpayment tolerance for rounding noise between the client-supplied
// amount and the sum of amounts computed here.
const EPSILON = 0.005;

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const installmentsStmt = db.prepare(
  `SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY installment_number ASC`
);

const collectionExpenseOwedStmt = db.prepare(
  `SELECT
     COALESCE((SELECT SUM(amount) FROM expenses WHERE loan_id = ?), 0)
     - COALESCE((SELECT SUM(amount) FROM loan_payment_allocations WHERE loan_id = ? AND bucket = 'collection_expense'), 0)
   AS owed`
);

const updateInstallmentStmt = db.prepare(
  `UPDATE loan_installments
   SET principal_paid = ?, interest_paid = ?, insurance_paid = ?, status = ?,
       updated_at = datetime('now'), synced_at = NULL
   WHERE id = ?`
);

const insertPaymentStmt = db.prepare(
  `INSERT INTO loan_payments (id, loan_id, member_id, amount, payment_date, recorded_by, notes, synced_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
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
    (sum, row) => sum + (row.interest_due - row.interest_paid) + (row.insurance_due - row.insurance_paid),
    0
  );
  const penaltyOutstanding = penalties.reduce((sum, row) => sum + row.outstanding, 0);
  const principal = installments.reduce((sum, row) => sum + (row.principal_due - row.principal_paid), 0);

  return {
    collection_expenses: roundMoney(collectionExpenses),
    interest_insurance_penalties: roundMoney(interestInsurance + penaltyOutstanding),
    principal: roundMoney(principal),
    total: roundMoney(collectionExpenses + interestInsurance + penaltyOutstanding + principal),
  };
}

/**
 * Records a payment against a loan and allocates it across the Article 16
 * waterfall: collection expenses first, then interest/insurance/penalties
 * (oldest installment period first), then principal. The whole thing runs
 * as one atomic transaction — the payment row, every allocation row, and
 * every installment update commit together or none of them do.
 *
 * Returns { overpaid: true, outstanding } without writing anything if
 * `amount` exceeds what's left on the loan — this release does not create
 * unapplied credit, so an overpayment is rejected outright rather than
 * partially applied.
 */
export function recordLoanPayment(loan, { amount, paymentDate, notes, recordedBy }) {
  return db.transaction(() => {
    accrueLoanPenalties(loan);

    const outstanding = getOutstandingBalance(loan);
    if (amount > outstanding.total + EPSILON) {
      return { overpaid: true, outstanding };
    }

    const paymentId = randomUUID();
    insertPaymentStmt.run(paymentId, loan.id, loan.member_id, amount, paymentDate, recordedBy, notes ?? null);

    let remaining = amount;
    const allocations = [];

    const allocate = (bucket, due, installmentId, penaltyId) => {
      const owed = roundMoney(due);
      if (remaining <= 0 || owed <= 0) return 0;
      const applied = roundMoney(Math.min(remaining, owed));
      if (applied <= 0) return 0;

      const id = randomUUID();
      insertAllocationStmt.run(id, paymentId, loan.id, bucket, applied, installmentId ?? null, penaltyId ?? null);
      allocations.push({
        id,
        payment_id: paymentId,
        loan_id: loan.id,
        bucket,
        amount: applied,
        installment_id: installmentId ?? null,
        penalty_id: penaltyId ?? null,
      });
      remaining = roundMoney(remaining - applied);
      return applied;
    };

    // Bucket 1: collection expenses charged to recovering this loan.
    allocate('collection_expense', outstanding.collection_expenses, null, null);

    // Bucket 2: interest, insurance, and penalties — oldest period first.
    const installments = installmentsStmt.all(loan.id);
    const patches = new Map(installments.map((row) => [row.id, { ...row }]));
    const penaltiesByPeriod = new Map(
      getPenaltiesWithOutstanding(loan.id).map((penalty) => [penalty.penalty_period, { ...penalty }])
    );

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
    }

    // Bucket 3: principal, oldest installment first.
    for (const installment of installments) {
      const patch = patches.get(installment.id);
      const appliedPrincipal = allocate(
        'principal',
        patch.principal_due - patch.principal_paid,
        installment.id,
        null
      );
      patch.principal_paid = roundMoney(patch.principal_paid + appliedPrincipal);
    }

    const updatedInstallments = [];
    for (const installment of installments) {
      const patch = patches.get(installment.id);
      const status = installmentStatus(patch);
      updateInstallmentStmt.run(patch.principal_paid, patch.interest_paid, patch.insurance_paid, status, installment.id);
      updatedInstallments.push({ ...patch, status });
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
