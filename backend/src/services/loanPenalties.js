import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';

const PENALTY_RATE = 0.02;

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function periodKey(dueDate) {
  return dueDate.slice(0, 7); // YYYY-MM
}

const overdueInstallmentsStmt = db.prepare(
  `SELECT installment_number, due_date FROM loan_installments
   WHERE loan_id = ? AND due_date <= ? AND status != 'paid'
   ORDER BY installment_number ASC`
);

const paidPrincipalStmt = db.prepare(
  `SELECT COALESCE(SUM(principal_paid), 0) AS total FROM loan_installments WHERE loan_id = ?`
);

const existingPenaltiesStmt = db.prepare(
  `SELECT id, loan_id, penalty_period, calculation_date, basis_amount, rate, amount
   FROM loan_penalties WHERE loan_id = ? ORDER BY penalty_period ASC`
);

const insertPenaltyStmt = db.prepare(
  `INSERT OR IGNORE INTO loan_penalties
     (id, loan_id, penalty_period, calculation_date, basis_amount, rate, amount, synced_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
);

// A payment allocation with bucket = 'interest_penalty' and this penalty_id
// is how much of a given penalty has actually been collected (see #49).
const penaltyAllocatedStmt = db.prepare(
  `SELECT COALESCE(SUM(amount), 0) AS total FROM loan_payment_allocations WHERE penalty_id = ?`
);

/**
 * Lazily materializes any overdue, still-owed penalty periods for one loan
 * and returns its full up-to-date penalty ledger. Safe to call on every
 * read (list/detail) — already-accrued periods are left untouched, and the
 * unique (loan_id, penalty_period) constraint plus INSERT OR IGNORE make a
 * repeat or concurrent call a no-op rather than an error. better-sqlite3
 * transactions run synchronously, so no two accrual calls can interleave
 * within this process either.
 */
export function accrueLoanPenalties(loan, { asOfDate } = {}) {
  if (loan.status !== 'active') return existingPenaltiesStmt.all(loan.id);

  const calculationDate = asOfDate || new Date().toISOString().slice(0, 10);

  const run = db.transaction(() => {
    const overdue = overdueInstallmentsStmt.all(loan.id, calculationDate);
    const penalties = existingPenaltiesStmt.all(loan.id);
    if (overdue.length === 0) return penalties;

    const accrued = new Map(penalties.map((row) => [row.penalty_period, row]));
    const remainingPrincipal = roundMoney(
      loan.principal_amount - paidPrincipalStmt.get(loan.id).total
    );

    for (const installment of overdue) {
      const period = periodKey(installment.due_date);
      if (accrued.has(period)) continue;

      // Unpaid penalties from earlier periods join the basis for this one,
      // so arrears compound the same way overdue principal does.
      let priorArrears = 0;
      for (const [existingPeriod, row] of accrued) {
        if (existingPeriod < period) {
          priorArrears += row.amount - penaltyAllocatedStmt.get(row.id).total;
        }
      }

      const basisAmount = roundMoney(remainingPrincipal + Math.max(0, roundMoney(priorArrears)));
      const amount = roundMoney(basisAmount * PENALTY_RATE);
      const id = randomUUID();

      insertPenaltyStmt.run(id, loan.id, period, calculationDate, basisAmount, PENALTY_RATE, amount);
      accrued.set(period, {
        id,
        loan_id: loan.id,
        penalty_period: period,
        calculation_date: calculationDate,
        basis_amount: basisAmount,
        rate: PENALTY_RATE,
        amount,
      });
    }

    return existingPenaltiesStmt.all(loan.id);
  });

  return run();
}

// Per-penalty outstanding amounts, oldest period first — what the payment
// waterfall (#49) needs to know how much of each penalty is still owed.
export function getPenaltiesWithOutstanding(loanId) {
  return existingPenaltiesStmt.all(loanId).map((penalty) => ({
    ...penalty,
    outstanding: Math.max(0, roundMoney(penalty.amount - penaltyAllocatedStmt.get(penalty.id).total)),
  }));
}

export function getLoanPenaltySummary(loanId) {
  const penalties = existingPenaltiesStmt.all(loanId);
  const totalPenalties = roundMoney(penalties.reduce((sum, row) => sum + row.amount, 0));
  const totalAllocated = penalties.reduce(
    (sum, row) => sum + penaltyAllocatedStmt.get(row.id).total,
    0
  );
  return {
    penalties,
    total_penalties: totalPenalties,
    outstanding_penalty_balance: Math.max(0, roundMoney(totalPenalties - totalAllocated)),
  };
}
