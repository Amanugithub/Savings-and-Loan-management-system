import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const VALID_TERMS = [1, 2, 3, 4, 5];
const VALID_LOAN_TYPES = ['regular', 'self_secured'];
const VALID_COLLATERAL_TYPES = ['guarantor', 'property'];

const VALID_STATUSES = [
  'pending',
  'awaiting_guarantor',
  'awaiting_recommendation',
  'guarantor_declined',
  'active',
  'closed',
  'rejected',
];

const INTEREST_RATE_BY_TERM = {
  1: 8,
  2: 8,
  3: 10,
  4: 11,
  5: 13,
};

const LOAN_AMOUNT_LIMIT = 50000;
const ANNUAL_LOAN_DISBURSEMENT_LIMIT = 2000000;

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function createLoanNotification({
  memberId,
  loanId,
  title,
  message,
  type,
}) {
  const id = randomUUID();

  db.prepare(
    `INSERT INTO notifications
      (id, member_id, loan_id, title, message, type, is_read, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'))`
  ).run(
    id,
    memberId,
    loanId,
    title,
    message,
    type
  );

  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
}

// Returns the July-June fiscal year containing the supplied date.
function getFiscalYearRange(dateString) {
  const [year, month] = dateString.split('-').map(Number);

  if (month >= 7) {
    return {
      fiscalYear: year,
      start: `${year}-07-01`,
      end: `${year + 1}-07-01`,
    };
  }

  return {
    fiscalYear: year - 1,
    start: `${year - 1}-07-01`,
    end: `${year}-07-01`,
  };
}

// GET /api/loans
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { member_id, status } = req.query;

    if (Array.isArray(member_id)) {
      return res.status(400).json({
        error: 'member_id must be a single value, not an array',
      });
    }

    if (Array.isArray(status)) {
      return res.status(400).json({
        error: 'status must be a single value, not an array',
      });
    }

    let query = 'SELECT * FROM loans';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }

      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    res.json(db.prepare(query).all(...params));
  })
);

// GET /api/loans/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const loan = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    res.json(loan);
  })
);

// POST /api/loans
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      member_id,
      guarantor_member_id,
      type,
      principal_amount,
      term_years,
      collateral_type,
    } = req.body;

    if (
      !member_id ||
      !type ||
      principal_amount === undefined ||
      !term_years ||
      !collateral_type
    ) {
      return res.status(400).json({
        error:
          'member_id, type, principal_amount, term_years, and collateral_type are required',
      });
    }

    if (!VALID_LOAN_TYPES.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${VALID_LOAN_TYPES.join(', ')}`,
      });
    }

    if (
      typeof principal_amount !== 'number' ||
      !Number.isFinite(principal_amount) ||
      principal_amount <= 0
    ) {
      return res.status(400).json({
        error: 'principal_amount must be a positive number',
      });
    }

    // Monetary values may have no more than two decimal places.
    if (Math.round(principal_amount * 100) !== principal_amount * 100) {
      return res.status(400).json({
        error: 'principal_amount must have no more than 2 decimal places',
      });
    }

    if (!VALID_TERMS.includes(term_years)) {
      return res.status(400).json({
        error: `term_years must be one of: ${VALID_TERMS.join(', ')}`,
      });
    }

    if (!VALID_COLLATERAL_TYPES.includes(collateral_type)) {
      return res.status(400).json({
        error: `collateral_type must be one of: ${VALID_COLLATERAL_TYPES.join(', ')}`,
      });
    }

    // Self-secured loans do not have a guarantor.
    if (type === 'self_secured' && guarantor_member_id) {
      return res.status(400).json({
        error: 'Self-secured loans cannot have a guarantor',
      });
    }

    // Self-secured loans require no collateral type.
    if (type === 'self_secured') {
      return res.status(400).json({
        error: 'Self-secured loans cannot have collateral_type',
      });
    }

    // A guarantor is required only for guarantor-backed loans.
    if (
      collateral_type === 'guarantor' &&
      !guarantor_member_id
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is required when collateral_type is guarantor',
      });
    }

    if (guarantor_member_id === member_id) {
      return res.status(400).json({
        error: 'guarantor_member_id cannot be the same as member_id',
      });
    }

    // A guarantor ID is invalid for property or self-secured loans.
    if (
      guarantor_member_id &&
      (collateral_type === 'property' || type === 'self_secured')
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is only allowed for guarantor collateral',
      });
    }

    const member = db
      .prepare('SELECT * FROM members WHERE id = ?')
      .get(member_id);

    if (!member) {
      return res.status(400).json({
        error: 'member_id does not reference an existing member',
      });
    }

    if (member.status !== 'active') {
      return res.status(400).json({
        error: 'Loans can only be created for active members',
      });
    }

    /*
     * Applicant must have joined at least six calendar months
     * before the application date.
     *
     * We use the server date because this API does not currently
     * accept a separate application date.
     */
    const applicationDate = new Date().toISOString().slice(0, 10);

    if (member.date_joined) {
      const joinedDate = new Date(`${member.date_joined}T00:00:00Z`);
      const appDate = new Date(`${applicationDate}T00:00:00Z`);

      const sixMonthsBefore = new Date(appDate);
      sixMonthsBefore.setUTCMonth(sixMonthsBefore.getUTCMonth() - 6);

      if (joinedDate > sixMonthsBefore) {
        return res.status(400).json({
          error:
            'Member must have been registered for at least six months before applying for a loan',
        });
      }
    }

    /*
     * Applicant must have at least three shares.
     * One share = 3,000 ETB.
     */
    const SHARE_PRICE = 3000;
    const MINIMUM_SHARES = 3;
    const minimumShareBalance = SHARE_PRICE * MINIMUM_SHARES;

    const shareBalanceRow = db
      .prepare(
        `SELECT COALESCE(
          SUM(amount) FILTER (
            WHERE type IN ('share_purchase')
          ),
          0
        ) AS total
         FROM transactions
         WHERE member_id = ?`
      )
      .get(member_id);

    const shareBalance = Number(shareBalanceRow.total || 0);

    if (shareBalance < minimumShareBalance) {
      return res.status(409).json({
        error:
          `Member must have at least ${MINIMUM_SHARES} shares (${minimumShareBalance.toLocaleString()} ETB) before applying for a loan`,
      });
    }

    /*
     * Self-secured loan:
     * principal cannot exceed current savings + shares balance.
     */
    if (type === 'self_secured') {
      const balanceRow = db
        .prepare(
          `SELECT
            COALESCE(SUM(
              CASE
                WHEN type IN ('savings_deposit', 'opening_savings_balance')
                THEN amount
                ELSE 0
              END
            ), 0) AS savings,
            COALESCE(SUM(
              CASE
                WHEN type IN ('share_purchase', 'opening_share_balance')
                THEN amount
                ELSE 0
              END
            ), 0) AS shares
           FROM transactions
           WHERE member_id = ?`
        )
        .get(member_id);

      const savingsBalance = Number(balanceRow.savings || 0);
      const sharesBalance = Number(balanceRow.shares || 0);
      const availableBalance = savingsBalance + sharesBalance;

      if (principal_amount > availableBalance) {
        return res.status(409).json({
          error:
            'Self-secured loan principal cannot exceed the member savings plus shares balance',
        });
      }
    }

    if (guarantor_member_id) {
      if (collateral_type !== 'guarantor') {
        return res.status(400).json({
          error:
            'guarantor_member_id is only allowed when collateral_type is guarantor',
        });
      }

      const guarantor = db
        .prepare('SELECT id, status FROM members WHERE id = ?')
        .get(guarantor_member_id);

      if (!guarantor) {
        return res.status(400).json({
          error:
            'guarantor_member_id does not reference an existing member',
        });
      }

      if (guarantor.status !== 'active') {
        return res.status(400).json({
          error: 'The guarantor must be an active member',
        });
      }

      const savingsRow = db
        .prepare(
          `SELECT COALESCE(
            SUM(amount) FILTER (
              WHERE type IN ('savings_deposit', 'opening_savings_balance')
            ),
            0
          ) AS total
           FROM transactions
           WHERE member_id = ?`
        )
        .get(guarantor_member_id);

      const guarantorSavings = Number(savingsRow.total || 0);
      const requiredGuarantorSavings = principal_amount * 3;

      if (guarantorSavings < requiredGuarantorSavings) {
        return res.status(409).json({
          error:
            `Guarantor must have savings of at least ${requiredGuarantorSavings.toLocaleString()} ETB for this loan`,
        });
      }

      const guaranteedLoan = db
        .prepare(
          `SELECT id
           FROM loans
           WHERE guarantor_member_id = ?
             AND status IN (
               'pending',
               'awaiting_guarantor',
               'awaiting_recommendation',
               'active'
             )`
        )
        .get(guarantor_member_id);

      if (guaranteedLoan) {
        return res.status(409).json({
          error: 'Guarantor already has an active or pending guaranteed loan',
        });
      }
    }

    /*
     * Applicant cannot have another loan in any non-terminal status.
     *
     * Terminal statuses:
     * - guarantor_declined
     * - closed
     * - rejected
     */
    const liveLoan = db
      .prepare(
        `SELECT id
         FROM loans
         WHERE member_id = ?
           AND status NOT IN ('guarantor_declined', 'closed', 'rejected')`
      )
      .get(member_id);

    if (liveLoan) {
      return res.status(409).json({
        error: 'Member already has an active or pending loan',
      });
    }

    /*
     * ---------------------------------------------------------
     * NON-BLOCKING WARNINGS
     * ---------------------------------------------------------
     */

    const warnings = [];

    // Warning 1: loan amount above 50,000 ETB.
    if (principal_amount > LOAN_AMOUNT_LIMIT) {
      warnings.push({
        code: 'LOAN_AMOUNT_ABOVE_GUIDELINE',
        message:
          'Loan amount exceeds the normal 50,000 ETB guideline.',
        observed_amount: principal_amount,
        limit: LOAN_AMOUNT_LIMIT,
      });
    }

    /*
     * Warning 2:
     * Current fiscal year's disbursed loan total + proposed
     * loan exceeds 2,000,000 ETB.
     *
     * Fiscal year = July 1 through June 30.
     *
     * Only actual loan_disbursement transactions are counted.
     * We intentionally do NOT store a running total.
     */
    const fiscalYear = getFiscalYearRange(applicationDate);

    const disbursedRow = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE type = 'loan_disbursement'
           AND date >= ?
           AND date < ?`
      )
      .get(fiscalYear.start, fiscalYear.end);

    const currentFiscalYearDisbursed =
      Number(disbursedRow.total || 0);

    const proposedFiscalYearTotal =
      currentFiscalYearDisbursed + principal_amount;

    if (proposedFiscalYearTotal > ANNUAL_LOAN_DISBURSEMENT_LIMIT) {
      warnings.push({
        code: 'ANNUAL_LOAN_DISBURSEMENT_LIMIT_EXCEEDED',
        message:
          'Current fiscal year loan disbursements plus this loan exceed the 2,000,000 ETB annual guideline.',
        observed_amount: proposedFiscalYearTotal,
        limit: ANNUAL_LOAN_DISBURSEMENT_LIMIT,
      });
    }

    const months = term_years * 12;
    const interest_rate = INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      Math.round((principal_amount / months) * 100) / 100;

    const monthly_interest_amount =
      Math.round(
        ((principal_amount * interest_rate) / 100 / months) * 100
      ) / 100;

    const insurance_amount =
      Math.round(principal_amount * 0.01 * 100) / 100;

    /*
     * Loan creation state:
     *
     * Regular + guarantor -> awaiting_guarantor
     * Regular + property  -> awaiting_recommendation
     *
     * Self-secured handling is expected to use
     * awaiting_recommendation when the frontend supplies
     * the appropriate collateral flow.
     */
    const initialStatus =
      type === 'regular' && collateral_type === 'guarantor'
        ? 'awaiting_guarantor'
        : 'awaiting_recommendation';

    const id = randomUUID();

    const createLoan = db.transaction(() => {
      db.prepare(
        `INSERT INTO loans
          (
            id,
            member_id,
            guarantor_member_id,
            type,
            principal_amount,
            term_years,
            interest_rate,
            monthly_installment,
            monthly_interest_amount,
            insurance_amount,
            collateral_type,
            status,
            synced_at
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(
        id,
        member_id,
        guarantor_member_id ?? null,
        type,
        principal_amount,
        term_years,
        interest_rate,
        monthly_installment,
        monthly_interest_amount,
        insurance_amount,
        collateral_type,
        initialStatus
      );

      // Only guarantor-backed loans create a guarantor request.
      if (
        type === 'regular' &&
        collateral_type === 'guarantor' &&
        guarantor_member_id
      ) {
        createLoanNotification({
          memberId: guarantor_member_id,
          loanId: id,
          title: 'Guarantor consent required',
          message:
            'A member has listed you as a guarantor for a loan. Please review and respond to the guarantor request.',
          type: 'guarantor_request',
        });
      }
    });

    createLoan();

    const loan = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(id);

    // Successful creation always returns data + warnings.
    return res.status(201).json({
      data: loan,
      warnings,
    });
  })
);

// PATCH /api/loans/:id/guarantor-response
//
// Office API:
// - requires administrator authentication
// - any authenticated administrator may record the response
//
// approve -> awaiting_recommendation
// decline -> guarantor_declined
router.patch(
  '/:id/guarantor-response',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { decision } = req.body ?? {};

    if (!['approve', 'decline'].includes(decision)) {
      return res.status(400).json({
        error: 'decision must be either approve or decline',
      });
    }

    const loan = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    if (loan.status !== 'awaiting_guarantor') {
      return res.status(409).json({
        error:
          `Guarantor response cannot be recorded while loan status is '${loan.status}'`,
      });
    }

    if (!loan.guarantor_member_id) {
      return res.status(409).json({
        error: 'This loan does not have a guarantor',
      });
    }

    const nextStatus =
      decision === 'approve'
        ? 'awaiting_recommendation'
        : 'guarantor_declined';

    const borrowerMessage =
      decision === 'approve'
        ? 'Your guarantor has approved the loan. The loan is now awaiting recommendation.'
        : 'Your guarantor has declined the loan request.';

    const updateLoanAndNotify = db.transaction(() => {
      db.prepare(
        `UPDATE loans
         SET
           status = ?,
           guarantor_responded_at = datetime('now'),
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?
           AND status = 'awaiting_guarantor'`
      ).run(nextStatus, loan.id);

      createLoanNotification({
        memberId: loan.member_id,
        loanId: loan.id,
        title: 'Guarantor response',
        message: borrowerMessage,
        type: 'loan_status',
      });
    });

    updateLoanAndNotify();

    const updated = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(loan.id);

    res.json(updated);
  })
);

const ALLOWED_TRANSITIONS = {
  pending: ['active', 'rejected'],
  awaiting_recommendation: ['active', 'rejected'],
  active: ['closed'],
};

router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, disbursement_date } = req.body;

    const loan = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    const allowedNext = ALLOWED_TRANSITIONS[loan.status] || [];

    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `Cannot move loan from '${loan.status}' to '${status}'. Allowed: ${
          allowedNext.join(', ') || 'none'
        }`,
      });
    }

    if (status === 'active') {
      const member = db
        .prepare('SELECT status FROM members WHERE id = ?')
        .get(loan.member_id);

      if (!member || member.status !== 'active') {
        return res.status(409).json({
          error: 'Loans can only be activated for active members',
        });
      }

      if (loan.guarantor_member_id) {
        const guarantor = db
          .prepare('SELECT status FROM members WHERE id = ?')
          .get(loan.guarantor_member_id);

        if (!guarantor || guarantor.status !== 'active') {
          return res.status(409).json({
            error: 'The guarantor must be an active member',
          });
        }
      }

      const activeLoan = db
        .prepare(
          "SELECT id FROM loans WHERE member_id = ? AND status = 'active' AND id <> ?"
        )
        .get(loan.member_id, req.params.id);

      if (activeLoan) {
        return res.status(409).json({
          error: 'Member already has an active loan',
        });
      }

      const disbursementDate =
        typeof disbursement_date === 'string' &&
        disbursement_date.trim()
          ? disbursement_date.trim()
          : new Date().toISOString().slice(0, 10);

      if (
        disbursement_date !== undefined &&
        typeof disbursement_date !== 'string'
      ) {
        return res.status(400).json({
          error:
            'disbursement_date must be a string in YYYY-MM-DD format',
        });
      }

      if (!isValidISODate(disbursementDate)) {
        return res.status(400).json({
          error:
            'disbursement_date must be a valid date in YYYY-MM-DD format',
        });
      }

      db.prepare(
        `UPDATE loans
         SET
           status = 'active',
           disbursement_date = ?,
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?`
      ).run(disbursementDate, req.params.id);
    } else {
      db.prepare(
        `UPDATE loans
         SET
           status = ?,
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?`
      ).run(status, req.params.id);
    }

    const updated = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(req.params.id);

    res.json(updated);
  })
);

export default router;