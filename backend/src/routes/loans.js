import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, INTAKE_LEVEL } from '../middleware/roles.js';
import { accrueLoanPenalties, getLoanPenaltySummary } from '../services/loanPenalties.js';
import { recordLoanPayment } from '../services/loanPayments.js';

const router = Router();

const VALID_TERMS = [1, 2, 3, 4, 5];
const VALID_LOAN_TYPES = ['regular', 'self_secured'];
const VALID_COLLATERAL_TYPES = ['guarantor', 'property'];

const VALID_STATUSES = [
  'awaiting_guarantor',
  'guarantor_declined',
  'awaiting_recommendation',
  'recommendation_declined',
  'awaiting_committee_approval',
  'rejected',
  'approved',
  'active',
  'closed',
];

const LIVE_LOAN_STATUSES = [
  'awaiting_guarantor',
  'awaiting_recommendation',
  'awaiting_committee_approval',
  'approved',
  'active',
];

const INTEREST_RATE_BY_TERM = {
  1: 8,
  2: 8,
  3: 10,
  4: 11,
  5: 13,
};

const SHARE_PRICE = 3000;
const MINIMUM_SHARES_FOR_LOAN = 3;
const LOAN_AMOUNT_WARNING_LIMIT = 50000;
const ANNUAL_DISBURSEMENT_WARNING_LIMIT = 2000000;

/**
 * Parse and validate money values.
 */
function parseMoney(value, name) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return {
      error: `${name} must be a positive number`,
    };
  }

  const cents = Math.round((value + Number.EPSILON) * 100);

  if (Math.abs(value - cents / 100) > 1e-9) {
    return {
      error: `${name} must have no more than 2 decimal places`,
    };
  }

  return {
    value: cents / 100,
  };
}

/**
 * Validate YYYY-MM-DD.
 */
function isValidISODate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  const daysInMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth
  );
}

function createLoanNotification({ memberId, loanId, title, message, type }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO notifications
      (id, member_id, loan_id, title, message, type, is_read, synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'))`
  ).run(id, memberId, loanId, title, message, type);
}

function getFiscalYearRange(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  return month >= 7
    ? { start: `${year}-07-01`, end: `${year + 1}-07-01` }
    : { start: `${year - 1}-07-01`, end: `${year}-07-01` };
}

function sixMonthsBefore(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 6);
  return date.toISOString().slice(0, 10);
}

/**
 * Get the currently active administrator from the database.
 *
 * We intentionally do not trust a role stored in the JWT.
 * The current administrator record is checked from SQLite so
 * role changes take effect immediately.
 */
function getActingAdministrator(req) {
  if (!req.admin?.id) {
    return null;
  }

  return db
    .prepare(
      `SELECT id, username, role, status
       FROM administrators
       WHERE id = ?`
    )
    .get(req.admin.id);
}

/**
 * Check whether the authenticated administrator has one
 * of the required roles.
 */
function requireLoanRole(req, res, allowedRoles) {
  const administrator = getActingAdministrator(req);

  if (!administrator) {
    res.status(401).json({
      error: 'Administrator account not found',
    });

    return null;
  }

  if (administrator.status !== 'active') {
    res.status(403).json({
      error: 'Administrator account is inactive',
    });

    return null;
  }

  if (!allowedRoles.includes(administrator.role)) {
    res.status(403).json({
      error: 'You do not have permission to perform this loan action',
    });

    return null;
  }

  return administrator;
}

/**
 * Add months to a YYYY-MM-DD date while keeping the result
 * as a valid calendar date.
 *
 * Example:
 * 2026-01-31 + 1 month -> 2026-02-28
 */
function addMonthsToDate(dateString, monthsToAdd) {
  const [year, month, day] = dateString.split('-').map(Number);

  const targetMonthIndex = month - 1 + monthsToAdd;

  const targetYear =
    year + Math.floor(targetMonthIndex / 12);

  const targetMonth =
    ((targetMonthIndex % 12) + 12) % 12;

  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetYear,
      targetMonth + 1,
      0
    )
  ).getUTCDate();

  const targetDay = Math.min(
    day,
    lastDayOfTargetMonth
  );

  return [
    targetYear,
    String(targetMonth + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-');
}

/**
 * Generate the loan repayment schedule.
 *
 * The schedule is generated inside the same SQLite transaction
 * as the loan disbursement.
 *
 * Therefore:
 *   loan becomes active + schedule created
 *
 * or:
 *   neither change happens.
 */
function generateInstallmentSchedule(loan, disbursementDate) {
  const months = loan.term_years * 12;

  const insertInstallment = db.prepare(
    `INSERT INTO loan_installments (
       id,
       loan_id,
       installment_number,
       due_date,
       principal_due,
       interest_due,
       insurance_due,
       principal_paid,
       interest_paid,
       insurance_paid,
       status,
       synced_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'unpaid', NULL)`
  );

  const monthlyPrincipal =
    Math.round(
      (loan.principal_amount / months + Number.EPSILON) * 100
    ) / 100;

  const monthlyInterest =
    Math.round(
      (loan.monthly_interest_amount + Number.EPSILON) * 100
    ) / 100;

  /*
   * insurance_amount is the total insurance amount for the loan.
   * Spread it across the installments and adjust the final
   * installment for rounding.
   */
  const monthlyInsurance =
    Math.round(
      (loan.insurance_amount / months + Number.EPSILON) * 100
    ) / 100;

  let principalScheduled = 0;
  let insuranceScheduled = 0;

  for (let installmentNumber = 1; installmentNumber <= months; installmentNumber += 1) {
    const isLastInstallment =
      installmentNumber === months;

    const principalDue = isLastInstallment
      ? Math.round(
          (loan.principal_amount - principalScheduled + Number.EPSILON) * 100
        ) / 100
      : monthlyPrincipal;

    const insuranceDue = isLastInstallment
      ? Math.round(
          (loan.insurance_amount - insuranceScheduled + Number.EPSILON) * 100
        ) / 100
      : monthlyInsurance;

    const interestDue = monthlyInterest;

    const dueDate = addMonthsToDate(
      disbursementDate,
      installmentNumber
    );

    insertInstallment.run(
      randomUUID(),
      loan.id,
      installmentNumber,
      dueDate,
      principalDue,
      interestDue,
      insuranceDue
    );

    principalScheduled += principalDue;
    insuranceScheduled += insuranceDue;
  }
}

/**
 * GET /api/loans
 *
 * List loans with optional member/status filters.
 */
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
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY created_at DESC';

    const loans = db.prepare(query).all(...params);
    const loansWithPenalties = loans.map((loan) => {
      accrueLoanPenalties(loan);
      return { ...loan, total_penalties: getLoanPenaltySummary(loan.id).total_penalties };
    });

    res.json(loansWithPenalties);
  })
);

/**
 * GET /api/loans/:id
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    accrueLoanPenalties(loan);
    const schedule = db
      .prepare('SELECT * FROM loan_installments WHERE loan_id = ? ORDER BY installment_number ASC')
      .all(loan.id);
    const { penalties, total_penalties, outstanding_penalty_balance } = getLoanPenaltySummary(loan.id);

    res.json({ ...loan, schedule, penalties, total_penalties, outstanding_penalty_balance });
  })
);

/**
 * POST /api/loans
 *
 * Creates a new loan application.
 *
 * Guarantor-backed applications start at awaiting_guarantor. Property and
 * self-secured applications start at awaiting_recommendation.
 */
router.post(
  '/',
  requireAuth,
  requireRole(...INTAKE_LEVEL),
  asyncHandler(async (req, res) => {
    const {
      member_id,
      guarantor_member_id,
      type,
      principal_amount,
      term_years,
      collateral_type,
      collateral_document_ref,
      collateral_certifying_authority,
    } = req.body;

    if (!member_id || !type || principal_amount === undefined || !term_years) {
      return res.status(400).json({
        error:
          'member_id, type, principal_amount, and term_years are required',
      });
    }

    if (!VALID_LOAN_TYPES.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${VALID_LOAN_TYPES.join(', ')}`,
      });
    }

    const principalResult = parseMoney(
      principal_amount,
      'principal_amount'
    );

    if (principalResult.error) {
      return res.status(400).json({
        error: principalResult.error,
      });
    }

    const principal = principalResult.value;

    if (!VALID_TERMS.includes(term_years)) {
      return res.status(400).json({
        error: `term_years must be one of: ${VALID_TERMS.join(', ')}`,
      });
    }

    if (type === 'regular' && !VALID_COLLATERAL_TYPES.includes(collateral_type)) {
      return res.status(400).json({
        error: `collateral_type is required for regular loans and must be one of: ${VALID_COLLATERAL_TYPES.join(', ')}`,
      });
    }

    if (type === 'self_secured' && (collateral_type != null || guarantor_member_id)) {
      return res.status(400).json({
        error: 'self_secured loans cannot specify collateral_type or guarantor_member_id',
      });
    }

    if (
      collateral_type === 'guarantor' &&
      !guarantor_member_id
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is required when collateral_type is guarantor',
      });
    }

    if (
      guarantor_member_id &&
      guarantor_member_id === member_id
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id cannot be the same as member_id',
      });
    }

    const applicationDate = new Date().toISOString().slice(0, 10);
    const member = db
      .prepare(
        'SELECT id, status, date_joined FROM members WHERE id = ?'
      )
      .get(member_id);

    if (!member) {
      return res.status(400).json({
        error:
          'member_id does not reference an existing member',
      });
    }

    if (member.status !== 'active') {
      return res.status(400).json({
        error:
          'Loans can only be created for active members',
      });
    }

    if (!member.date_joined || member.date_joined > sixMonthsBefore(applicationDate)) {
      return res.status(409).json({
        error: 'Member must have been active for at least six months before applying for a loan',
      });
    }

    /*
     * A borrower must have at least 3 shares before applying.
     */
    const shareBalance = db
      .prepare(
        `SELECT ROUND(
           COALESCE(SUM(amount), 0),
           2
         ) AS total
         FROM transactions
         WHERE member_id = ?
           AND type IN (
             'share_purchase',
             'opening_share_balance'
           )`
      )
      .get(member_id).total;

    const minimumShareBalance =
      SHARE_PRICE * MINIMUM_SHARES_FOR_LOAN;

    if (shareBalance < minimumShareBalance) {
      return res.status(409).json({
        error:
          `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares ` +
          `(${minimumShareBalance.toLocaleString()} ETB) before applying for a loan`,
      });
    }

    /*
     * Validate guarantor when guarantor collateral is used.
     */
    if (guarantor_member_id) {
      if (collateral_type !== 'guarantor') {
        return res.status(400).json({
          error:
            'guarantor_member_id is only allowed when collateral_type is guarantor',
        });
      }

      const guarantor = db
        .prepare(
          'SELECT id, status FROM members WHERE id = ?'
        )
        .get(guarantor_member_id);

      if (!guarantor) {
        return res.status(400).json({
          error:
            'guarantor_member_id does not reference an existing member',
        });
      }

      if (guarantor.status !== 'active') {
        return res.status(400).json({
          error:
            'The guarantor must be an active member',
        });
      }

      const guarantorSavings = db
        .prepare(
          `SELECT ROUND(
             COALESCE(SUM(amount), 0),
             2
           ) AS total
           FROM transactions
           WHERE member_id = ?
             AND type IN (
               'savings_deposit',
               'opening_savings_balance'
             )`
        )
        .get(guarantor_member_id).total;

      const requiredGuarantorSavings =
        principal * 3;

      if (guarantorSavings < requiredGuarantorSavings) {
        return res.status(409).json({
          error:
            `Guarantor must have savings of at least ` +
            `${requiredGuarantorSavings.toLocaleString()} ETB for this loan`,
        });
      }

      const guaranteedLoan = db.prepare(
        `SELECT id FROM loans
         WHERE guarantor_member_id = ?
           AND status IN ('awaiting_guarantor', 'awaiting_recommendation',
                          'awaiting_committee_approval', 'approved', 'active')`
      ).get(guarantor_member_id);
      if (guaranteedLoan) {
        return res.status(409).json({
          error: 'Guarantor already has a live guaranteed loan',
        });
      }
    }

    /*
     * The unique live-loan index should also protect this,
     * but keeping the application-level check gives a useful
     * error message.
     */
    const liveLoan = db
      .prepare(
        `SELECT id
         FROM loans
         WHERE member_id = ?
           AND status IN (
             'awaiting_guarantor',
             'awaiting_recommendation',
             'awaiting_committee_approval',
             'approved',
             'active'
           )`
      )
      .get(member_id);

    if (liveLoan) {
      return res.status(409).json({
        error:
          'Member already has a live loan',
      });
    }

    const months = term_years * 12;

    const interest_rate =
      INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      Math.round(
        (
          principal / months +
          principal * interest_rate / 100 / months +
          principal * 0.01 / months +
          Number.EPSILON
        ) * 100
      ) / 100;

    const monthly_interest_amount =
      Math.round(
        (
          principal *
          interest_rate /
          100 /
          months +
          Number.EPSILON
        ) * 100
      ) / 100;

    const insurance_amount =
      Math.round(
        (principal * 0.01 + Number.EPSILON) * 100
      ) / 100;

    const id = randomUUID();
    const warnings = [];
    if (principal > LOAN_AMOUNT_WARNING_LIMIT) {
      warnings.push({
        code: 'LOAN_AMOUNT_ABOVE_GUIDELINE',
        message: 'Loan amount exceeds the normal 50,000 ETB guideline.',
        observed_amount: principal,
        limit: LOAN_AMOUNT_WARNING_LIMIT,
      });
    }
    const fiscalYear = getFiscalYearRange(applicationDate);
    const disbursed = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE type = 'loan_disbursement' AND date >= ? AND date < ?`
    ).get(fiscalYear.start, fiscalYear.end);
    const proposedAnnualTotal = Number(disbursed.total || 0) + principal;
    if (proposedAnnualTotal > ANNUAL_DISBURSEMENT_WARNING_LIMIT) {
      warnings.push({
        code: 'ANNUAL_LOAN_DISBURSEMENT_LIMIT_EXCEEDED',
        message: 'Current fiscal year disbursements plus this loan exceed the 2,000,000 ETB guideline.',
        observed_amount: proposedAnnualTotal,
        limit: ANNUAL_DISBURSEMENT_WARNING_LIMIT,
      });
    }
    const initialStatus = collateral_type === 'guarantor'
      ? 'awaiting_guarantor'
      : 'awaiting_recommendation';

    db.prepare(
      `INSERT INTO loans (
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
         collateral_document_ref,
         collateral_certifying_authority,
         status,
         synced_at
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         NULL
       )`
    ).run(
      id,
      member_id,
      guarantor_member_id ?? null,
      type,
      principal,
      term_years,
      interest_rate,
      monthly_installment,
      monthly_interest_amount,
      insurance_amount,
      collateral_type ?? null,
      collateral_document_ref ?? null,
      collateral_certifying_authority ?? null,
      initialStatus
    );

    if (collateral_type === 'guarantor' && guarantor_member_id) {
      createLoanNotification({
        memberId: guarantor_member_id,
        loanId: id,
        title: 'Guarantor consent required',
        message: 'A member has listed you as a guarantor for a loan. Please review and respond.',
        type: 'guarantor_request',
      });
    }

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(id);

    res.status(201).json({ data: loan, warnings });
  })
);

/**
 * PATCH /api/loans/:id/guarantor-response
 * Office administrators may record consent; mobile member consent is exposed
 * by the cloud API. The conditional update makes retries idempotent-safe.
 */
router.patch(
  '/:id/guarantor-response',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!getActingAdministrator(req)) {
      return res.status(403).json({ error: 'FORBIDDEN_ROLE', message: 'Administrator authentication required' });
    }
    const { decision } = req.body ?? {};
    if (!['approve', 'decline'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be either approve or decline' });
    }
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    if (loan.status !== 'awaiting_guarantor' || !loan.guarantor_member_id) {
      return res.status(409).json({ error: 'Loan is not awaiting guarantor consent' });
    }
    const nextStatus = decision === 'approve' ? 'awaiting_recommendation' : 'guarantor_declined';
    const update = db.transaction(() => {
      const result = db.prepare(
        `UPDATE loans SET status = ?, guarantor_responded_at = datetime('now'),
         updated_at = datetime('now'), synced_at = NULL
         WHERE id = ? AND status = 'awaiting_guarantor'`
      ).run(nextStatus, loan.id);
      if (result.changes !== 1) return false;
      createLoanNotification({
        memberId: loan.member_id,
        loanId: loan.id,
        title: 'Guarantor response',
        message: decision === 'approve'
          ? 'Your guarantor approved the loan; it is awaiting recommendation.'
          : 'Your guarantor declined the loan request.',
        type: 'loan_status',
      });
      return true;
    });
    if (!update()) return res.status(409).json({ error: 'Loan consent has already been recorded' });
    res.json(db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id));
  })
);

/**
 * PATCH /api/loans/:id/recommend
 *
 * Chair level only.
 *
 * awaiting_recommendation
 *          ↓
 * awaiting_committee_approval
 */
router.patch(
  '/:id/recommend',
  requireAuth,
  asyncHandler(async (req, res) => {
    const administrator = requireLoanRole(
      req,
      res,
      ['chairperson', 'vice_chairperson']
    );

    if (!administrator) return;

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    if (loan.status !== 'awaiting_recommendation') {
      return res.status(400).json({
        error:
          `Cannot recommend loan from '${loan.status}'. ` +
          `Loan must be 'awaiting_recommendation'.`,
      });
    }

    const result = db
      .prepare(
        `UPDATE loans
         SET
           status = 'awaiting_committee_approval',
           recommended_by = ?,
           recommended_at = datetime('now'),
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?
           AND status = 'awaiting_recommendation'`
      )
      .run(
        administrator.id,
        req.params.id
      );

    if (result.changes !== 1) {
      return res.status(400).json({
        error:
          'Loan could not be recommended because its status has already changed',
      });
    }

    const updated = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    res.json(updated);
  })
);

/**
 * PATCH /api/loans/:id/decline-recommendation
 *
 * Chair level only.
 *
 * awaiting_recommendation
 *          ↓
 * recommendation_declined
 */
router.patch(
  '/:id/decline-recommendation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const administrator = requireLoanRole(
      req,
      res,
      ['chairperson', 'vice_chairperson']
    );

    if (!administrator) return;

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    if (loan.status !== 'awaiting_recommendation') {
      return res.status(400).json({
        error:
          `Cannot decline recommendation from '${loan.status}'. ` +
          `Loan must be 'awaiting_recommendation'.`,
      });
    }

    const result = db
      .prepare(
        `UPDATE loans
         SET
           status = 'recommendation_declined',
           declined_by = ?,
           declined_at = datetime('now'),
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?
           AND status = 'awaiting_recommendation'`
      )
      .run(
        administrator.id,
        req.params.id
      );

    if (result.changes !== 1) {
      return res.status(400).json({
        error:
          'Loan recommendation could not be declined because its status has already changed',
      });
    }

    const updated = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    res.json(updated);
  })
);

/**
 * PATCH /api/loans/:id/committee-approve
 *
 * Loan committee only.
 *
 * awaiting_committee_approval
 *          ↓
 * approved
 */
router.patch(
  '/:id/committee-approve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const administrator = requireLoanRole(
      req,
      res,
      ['loan_committee']
    );

    if (!administrator) return;

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    if (loan.status !== 'awaiting_committee_approval') {
      return res.status(400).json({
        error:
          `Cannot approve loan from '${loan.status}'. ` +
          `Loan must be 'awaiting_committee_approval'.`,
      });
    }

    if (loan.collateral_type === 'property' &&
        (!loan.collateral_document_ref || !loan.collateral_certifying_authority)) {
      return res.status(409).json({
        error: 'Property collateral must include a document reference and certifying authority before committee approval',
      });
    }

    const result = db
      .prepare(
        `UPDATE loans
         SET
           status = 'approved',
           approved_by = ?,
           approved_at = datetime('now'),
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?
           AND status = 'awaiting_committee_approval'`
      )
      .run(
        administrator.id,
        req.params.id
      );

    if (result.changes !== 1) {
      return res.status(400).json({
        error:
          'Loan could not be approved because its status has already changed',
      });
    }

    const updated = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    res.json(updated);
  })
);

/**
 * PATCH /api/loans/:id/committee-reject
 *
 * Loan committee only.
 *
 * awaiting_committee_approval
 *          ↓
 * rejected
 */
router.patch(
  '/:id/committee-reject',
  requireAuth,
  asyncHandler(async (req, res) => {
    const administrator = requireLoanRole(
      req,
      res,
      ['loan_committee']
    );

    if (!administrator) return;

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    if (loan.status !== 'awaiting_committee_approval') {
      return res.status(400).json({
        error:
          `Cannot reject loan from '${loan.status}'. ` +
          `Loan must be 'awaiting_committee_approval'.`,
      });
    }

    /*
     * declined_by / declined_at identify the administrator
     * and timestamp for this negative committee decision.
     */
    const result = db
      .prepare(
        `UPDATE loans
         SET
           status = 'rejected',
           declined_by = ?,
           declined_at = datetime('now'),
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?
           AND status = 'awaiting_committee_approval'`
      )
      .run(
        administrator.id,
        req.params.id
      );

    if (result.changes !== 1) {
      return res.status(400).json({
        error:
          'Loan could not be rejected because its status has already changed',
      });
    }

    const updated = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    res.json(updated);
  })
);

/**
 * PATCH /api/loans/:id/disburse
 *
 * Cashier only.
 *
 * approved
 *    ↓
 * active
 *
 * This operation is atomic:
 *
 *   1. Validate everything
 *   2. Change loan to active
 *   3. Create installment schedule
 *
 * If schedule creation fails, the loan update is rolled back.
 */
router.patch(
  '/:id/disburse',
  requireAuth,
  asyncHandler(async (req, res) => {
    const administrator = requireLoanRole(
      req,
      res,
      ['cashier']
    );

    if (!administrator) return;

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    if (loan.status !== 'approved') {
      return res.status(400).json({
        error:
          `Cannot disburse loan from '${loan.status}'. ` +
          `Loan must be 'approved'.`,
      });
    }

    /*
     * Validate member.
     */
    const member = db
      .prepare(
        'SELECT status FROM members WHERE id = ?'
      )
      .get(loan.member_id);

    if (!member || member.status !== 'active') {
      return res.status(409).json({
        error:
          'Loans can only be disbursed to active members',
      });
    }

    /*
     * Retain the existing 3-share requirement.
     */
    const shareBalance = db
      .prepare(
        `SELECT ROUND(
           COALESCE(SUM(amount), 0),
           2
         ) AS total
         FROM transactions
         WHERE member_id = ?
           AND type IN (
             'share_purchase',
             'opening_share_balance'
           )`
      )
      .get(loan.member_id).total;

    const minimumShareBalance =
      SHARE_PRICE * MINIMUM_SHARES_FOR_LOAN;

    if (shareBalance < minimumShareBalance) {
      return res.status(409).json({
        error:
          `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares ` +
          `(${minimumShareBalance.toLocaleString()} ETB) before loan disbursement`,
      });
    }

    /*
     * Retain guarantor validation.
     */
    if (loan.guarantor_member_id) {
      const guarantor = db
        .prepare(
          'SELECT status FROM members WHERE id = ?'
        )
        .get(loan.guarantor_member_id);

      if (!guarantor || guarantor.status !== 'active') {
        return res.status(409).json({
          error:
            'The guarantor must be an active member',
        });
      }

      const guarantorSavings = db
        .prepare(
          `SELECT ROUND(
             COALESCE(SUM(amount), 0),
             2
           ) AS total
           FROM transactions
           WHERE member_id = ?
             AND type IN (
               'savings_deposit',
               'opening_savings_balance'
             )`
        )
        .get(loan.guarantor_member_id).total;

      const requiredGuarantorSavings =
        loan.principal_amount * 3;

      if (guarantorSavings < requiredGuarantorSavings) {
        return res.status(409).json({
          error:
            `Guarantor must have savings of at least ` +
            `${requiredGuarantorSavings.toLocaleString()} ETB before loan disbursement`,
        });
      }
    }

    /*
     * No borrower can have another live loan.
     */
    const existingLiveLoan = db
      .prepare(
        `SELECT id
         FROM loans
         WHERE member_id = ?
           AND status IN (
             'awaiting_guarantor',
             'awaiting_recommendation',
             'awaiting_committee_approval',
             'approved',
             'active'
           )
           AND id <> ?`
      )
      .get(
        loan.member_id,
        loan.id
      );

    if (existingLiveLoan) {
      return res.status(409).json({
        error:
          'Member already has another live loan',
      });
    }

    /*
     * Determine disbursement date.
     *
     * If omitted, use today.
     */
    const {
      disbursement_date,
    } = req.body;

    const disbursementDate =
      (
        typeof disbursement_date === 'string' &&
        disbursement_date.trim()
      )
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

    /*
     * Protect against an inconsistent database where an
     * installment schedule already exists.
     *
     * A correctly functioning workflow should never reach
     * this point for an approved loan, but this check gives
     * us an additional safety barrier.
     */
    const existingInstallments = db
      .prepare(
        `SELECT id
         FROM loan_installments
         WHERE loan_id = ?
         LIMIT 1`
      )
      .get(loan.id);

    if (existingInstallments) {
      return res.status(409).json({
        error:
          'Installment schedule already exists for this loan',
      });
    }

    /*
     * Everything after this point is one atomic transaction.
     */
    const disburseLoan = db.transaction(() => {
      /*
       * Conditional status transition.
       *
       * This is important for duplicate/concurrent requests:
       *
       * approved -> active
       *
       * can happen only once.
       */
      const updateResult = db
        .prepare(
          `UPDATE loans
           SET
             status = 'active',
             disbursement_date = ?,
             disbursed_by = ?,
             updated_at = datetime('now'),
             synced_at = NULL
           WHERE id = ?
             AND status = 'approved'`
        )
        .run(
          disbursementDate,
          administrator.id,
          loan.id
        );

      if (updateResult.changes !== 1) {
        throw new Error(
          'LOAN_STATUS_CHANGED'
        );
      }

      /*
       * Reload the loan after updating it so the schedule
       * generator works with the final persisted values.
       */
      const updatedLoan = db
        .prepare(
          'SELECT * FROM loans WHERE id = ?'
        )
        .get(loan.id);

      /*
       * Generate exactly one repayment schedule.
       */
      generateInstallmentSchedule(
        updatedLoan,
        disbursementDate
      );

      return updatedLoan;
    });

    let updatedLoan;

    try {
      updatedLoan = disburseLoan();
    } catch (error) {
      if (error.message === 'LOAN_STATUS_CHANGED') {
        return res.status(400).json({
          error:
            'Loan could not be disbursed because its status has already changed',
        });
      }

      throw error;
    }

    const installments = db
      .prepare(
        `SELECT *
         FROM loan_installments
         WHERE loan_id = ?
         ORDER BY installment_number ASC`
      )
      .all(updatedLoan.id);

    res.json({
      loan: updatedLoan,
      installments,
    });
  })
);

/**
 * POST /api/loans/:id/payments
 *
 * Cashier only.
 *
 * Records a receipt-based payment against an active loan and allocates it
 * through the Article 16 waterfall: collection expenses first, then each
 * oldest installment's interest + insurance + penalties and principal before
 * moving to the next installment. Penalty accrual (#48) runs first so the
 * amount being collected reflects the loan's current standing. Overpayment
 * is rejected outright — this release does not create unapplied credit.
 */
router.post(
  '/:id/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const administrator = requireLoanRole(req, res, ['cashier']);
    if (!administrator) return;

    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    const { amount, date, notes, idempotency_key: bodyIdempotencyKey } = req.body ?? {};
    const idempotencyKey = req.get('Idempotency-Key') || bodyIdempotencyKey;
    if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '' || idempotencyKey.length > 128) {
      return res.status(400).json({
        error: 'Idempotency-Key header or idempotency_key body field is required and must be at most 128 characters',
      });
    }

    const existingPayment = db.prepare(
      'SELECT id FROM loan_payments WHERE loan_id = ? AND idempotency_key = ?'
    ).get(loan.id, idempotencyKey);
    if (!existingPayment && loan.status !== 'active') {
      return res.status(400).json({
        error: `Cannot record a payment for a loan with status '${loan.status}'. Loan must be 'active'.`,
      });
    }

    const amountResult = parseMoney(amount, 'amount');
    if (amountResult.error) {
      return res.status(400).json({ error: amountResult.error });
    }

    const paymentDate = (typeof date === 'string' && date.trim()) ? date.trim() : new Date().toISOString().slice(0, 10);
    if (date !== undefined && typeof date !== 'string') {
      return res.status(400).json({ error: 'date must be a string in YYYY-MM-DD format' });
    }
    if (!isValidISODate(paymentDate)) {
      return res.status(400).json({ error: 'date must be a valid date in YYYY-MM-DD format' });
    }

    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string' || notes.length > 255) {
        return res.status(400).json({ error: 'notes must be a string of at most 255 characters' });
      }
    }

    const result = recordLoanPayment(loan, {
      amount: amountResult.value,
      paymentDate,
      notes,
      recordedBy: administrator.id,
      idempotencyKey,
    });

    if (result.overpaid) {
      return res.status(409).json({
        error: 'Payment exceeds the loan\'s outstanding balance',
        outstanding_balance: result.outstanding.total,
      });
    }

    res.status(result.idempotent ? 200 : 201).json({
      payment: result.payment,
      allocations: result.allocations,
      installments: result.installments,
      outstanding_balance: result.outstanding_balance.total,
      loan_status: result.loan_status,
    });
  })
);

export default router;
