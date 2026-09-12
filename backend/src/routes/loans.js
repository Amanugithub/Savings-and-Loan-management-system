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

    res.json(
      db.prepare(query).all(...params)
    );
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

    res.json(loan);
  })
);

/**
 * POST /api/loans
 *
 * Creates a new loan application.
 *
 * The application starts at:
 *   awaiting_recommendation
 */
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

    if (!VALID_COLLATERAL_TYPES.includes(collateral_type)) {
      return res.status(400).json({
        error: `collateral_type must be one of: ${VALID_COLLATERAL_TYPES.join(', ')}`,
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

    const member = db
      .prepare(
        'SELECT id, status FROM members WHERE id = ?'
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
        (principal / months + Number.EPSILON) * 100
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
         'awaiting_recommendation',
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
      collateral_type
    );

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(id);

    res.status(201).json(loan);
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
           rejected_by = ?,
           rejected_at = datetime('now'),
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

export default router;