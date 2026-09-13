import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const VALID_TERMS = [1, 2, 3, 4, 5];

const VALID_LOAN_TYPES = [
  'regular',
  'self_secured',
];

const VALID_COLLATERAL_TYPES = [
  'guarantor',
  'property',
];

const VALID_STATUSES = [
  'pending',
  'awaiting_guarantor',
  'awaiting_recommendation',
  'guarantor_declined',
  'active',
  'closed',
  'rejected',
];

const NON_TERMINAL_LOAN_STATUSES = [
  'pending',
  'awaiting_guarantor',
  'awaiting_recommendation',
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
const MINIMUM_SHARE_BALANCE = SHARE_PRICE * MINIMUM_SHARES_FOR_LOAN;

/*
 * ---------------------------------------------------------
 * Helper functions
 * ---------------------------------------------------------
 */

/**
 * Validate YYYY-MM-DD without relying on local timezone.
 */
function isValidISODate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  if (month < 1 || month > 12) {
    return false;
  }

  const daysInMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  return day >= 1 && day <= daysInMonth;
}

/**
 * Return today's date as YYYY-MM-DD.
 */
function getServerDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add calendar months to an ISO date.
 *
 * Example:
 * 2024-02-29 + 6 months = 2024-08-29
 *
 * If the target month does not contain the original day,
 * the date is clamped to the last day of the target month.
 */
function addCalendarMonths(isoDate, months) {
  const [year, month, day] = isoDate
    .split('-')
    .map(Number);

  const targetMonthIndex = month - 1 + months;

  const targetYear =
    year + Math.floor(targetMonthIndex / 12);

  const targetMonth =
    ((targetMonthIndex % 12) + 12) % 12;

  const targetMonthNumber = targetMonth + 1;

  const daysInTargetMonth = new Date(
    Date.UTC(
      targetYear,
      targetMonthNumber,
      0
    )
  ).getUTCDate();

  const targetDay = Math.min(
    day,
    daysInTargetMonth
  );

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonthNumber).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-');
}

/**
 * Check whether the member has completed six calendar months
 * of membership as of the application date.
 *
 * Eligible when:
 *
 * application_date >= date_joined + 6 calendar months
 */
function hasCompletedSixMonths(dateJoined, applicationDate) {
  const eligibilityDate = addCalendarMonths(
    dateJoined,
    6
  );

  return applicationDate >= eligibilityDate;
}

/**
 * Validate money.
 *
 * All monetary values:
 * - must be numbers
 * - must be finite
 * - must be greater than zero
 * - may contain at most two decimal places
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

  const rounded =
    Math.round((value + Number.EPSILON) * 100) / 100;

  if (Math.abs(value - rounded) > 1e-9) {
    return {
      error:
        `${name} must have no more than 2 decimal places`,
    };
  }

  return {
    value: rounded,
  };
}

/**
 * Create a notification inside the current SQLite transaction.
 */
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
      (
        id,
        member_id,
        loan_id,
        title,
        message,
        type,
        is_read,
        synced_at,
        updated_at
      )
     VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        0,
        NULL,
        datetime('now')
     )`
  ).run(
    id,
    memberId,
    loanId,
    title,
    message,
    type
  );

  return db
    .prepare(
      'SELECT * FROM notifications WHERE id = ?'
    )
    .get(id);
}

/*
 * ---------------------------------------------------------
 * GET /api/loans
 * ---------------------------------------------------------
 */

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      member_id,
      status,
    } = req.query;

    if (Array.isArray(member_id)) {
      return res.status(400).json({
        error:
          'member_id must be a single value, not an array',
      });
    }

    if (Array.isArray(status)) {
      return res.status(400).json({
        error:
          'status must be a single value, not an array',
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
          error:
            `status must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }

      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query +=
        ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    res.json(
      db.prepare(query).all(...params)
    );
  })
);

/*
 * ---------------------------------------------------------
 * GET /api/loans/:id
 * ---------------------------------------------------------
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

/*
 * ---------------------------------------------------------
 * POST /api/loans
 * ---------------------------------------------------------
 *
 * Loan eligibility rules:
 *
 * 1. Applicant must be active.
 * 2. Applicant must have at least 3 shares.
 * 3. Applicant must have been a member for at least
 *    six calendar months.
 * 4. Applicant cannot have another non-terminal loan.
 * 5. Guarantor collateral:
 *      - active guarantor
 *      - different member
 *      - savings >= 3 x principal
 *      - no other live guaranteed loan
 * 6. Property collateral:
 *      - collateral_document_ref required
 *      - collateral_certifying_authority required
 * 7. Self-secured:
 *      - no collateral type
 *      - no guarantor
 *      - principal <= savings + shares
 * 8. Guarantor ID invalid for property/self-secured.
 * 9. Money has max 2 decimals.
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
      collateral_document_ref,
      collateral_certifying_authority,
      application_date,
    } = req.body ?? {};

    /*
     * -----------------------------------------------------
     * Basic validation
     * -----------------------------------------------------
     */

    if (!member_id) {
      return res.status(400).json({
        error:
          'member_id is required',
      });
    }

    if (!type) {
      return res.status(400).json({
        error:
          'type is required',
      });
    }

    if (principal_amount === undefined) {
      return res.status(400).json({
        error:
          'principal_amount is required',
      });
    }

    if (!term_years) {
      return res.status(400).json({
        error:
          'term_years is required',
      });
    }

    /*
     * Self-secured loans intentionally do NOT require
     * collateral_type.
     *
     * Regular loans DO require collateral_type.
     */
    if (
      type !== 'self_secured' &&
      !collateral_type
    ) {
      return res.status(400).json({
        error:
          'collateral_type is required for regular loans',
      });
    }

    if (!VALID_LOAN_TYPES.includes(type)) {
      return res.status(400).json({
        error:
          `type must be one of: ${VALID_LOAN_TYPES.join(', ')}`,
      });
    }

    /*
     * -----------------------------------------------------
     * Principal amount
     * -----------------------------------------------------
     */

    const principalResult = parseMoney(
      principal_amount,
      'principal_amount'
    );

    if (principalResult.error) {
      return res.status(400).json({
        error: principalResult.error,
      });
    }

    const principal =
      principalResult.value;

    /*
     * -----------------------------------------------------
     * Term validation
     * -----------------------------------------------------
     */

    if (!VALID_TERMS.includes(term_years)) {
      return res.status(400).json({
        error:
          `term_years must be one of: ${VALID_TERMS.join(', ')}`,
      });
    }

    /*
     * -----------------------------------------------------
     * Application date
     * -----------------------------------------------------
     *
     * If supplied, it must be YYYY-MM-DD.
     * Otherwise server date is used.
     */

    const applicationDate =
      application_date ??
      getServerDate();

    if (!isValidISODate(applicationDate)) {
      return res.status(400).json({
        error:
          'application_date must be a valid date in YYYY-MM-DD format',
      });
    }

    /*
     * -----------------------------------------------------
     * Self-secured validation
     * -----------------------------------------------------
     */

    if (type === 'self_secured') {
      if (collateral_type) {
        return res.status(400).json({
          error:
            'Self-secured loans cannot have collateral_type',
        });
      }

      if (guarantor_member_id) {
        return res.status(400).json({
          error:
            'Self-secured loans cannot have a guarantor',
        });
      }
    }

    /*
     * -----------------------------------------------------
     * Regular loan collateral validation
     * -----------------------------------------------------
     */

    if (type === 'regular') {
      if (
        !VALID_COLLATERAL_TYPES.includes(
          collateral_type
        )
      ) {
        return res.status(400).json({
          error:
            `collateral_type must be one of: ${VALID_COLLATERAL_TYPES.join(', ')}`,
        });
      }
    }

    /*
     * A guarantor ID is ONLY valid for guarantor collateral.
     */

    if (
      guarantor_member_id &&
      (
        type === 'self_secured' ||
        collateral_type !== 'guarantor'
      )
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is only allowed when collateral_type is guarantor',
      });
    }

    /*
     * -----------------------------------------------------
     * Property collateral requirements
     * -----------------------------------------------------
     */

    if (
      type === 'regular' &&
      collateral_type === 'property'
    ) {
      if (
        typeof collateral_document_ref !== 'string' ||
        !collateral_document_ref.trim()
      ) {
        return res.status(400).json({
          error:
            'collateral_document_ref is required for property collateral',
        });
      }

      if (
        typeof collateral_certifying_authority !== 'string' ||
        !collateral_certifying_authority.trim()
      ) {
        return res.status(400).json({
          error:
            'collateral_certifying_authority is required for property collateral',
        });
      }
    }

    /*
     * -----------------------------------------------------
     * Guarantor requirement
     * -----------------------------------------------------
     */

    if (
      type === 'regular' &&
      collateral_type === 'guarantor' &&
      !guarantor_member_id
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is required when collateral_type is guarantor',
      });
    }

    /*
     * -----------------------------------------------------
     * Applicant lookup
     * -----------------------------------------------------
     */

    const member = db
      .prepare(
        `SELECT
          id,
          status,
          date_joined
         FROM members
         WHERE id = ?`
      )
      .get(member_id);

    if (!member) {
      return res.status(400).json({
        error:
          'member_id does not reference an existing member',
      });
    }

    /*
     * Rule 1:
     * Applicant must be active.
     */

    if (member.status !== 'active') {
      return res.status(400).json({
        error:
          'Loans can only be created for active members',
      });
    }

    /*
     * Validate member's date_joined.
     */

    if (!isValidISODate(member.date_joined)) {
      return res.status(400).json({
        error:
          'Member date_joined is invalid',
      });
    }

    /*
     * Rule 3:
     * Applicant must have completed six calendar months.
     *
     * Exact boundary:
     *
     * date_joined = 2024-02-29
     * eligible from = 2024-08-29
     *
     * 2024-08-28 -> blocked
     * 2024-08-29 -> allowed
     */

    if (
      !hasCompletedSixMonths(
        member.date_joined,
        applicationDate
      )
    ) {
      const eligibilityDate =
        addCalendarMonths(
          member.date_joined,
          6
        );

      return res.status(409).json({
        error:
          `Member must have been registered for at least six calendar months before applying for a loan. Eligible from ${eligibilityDate}.`,
      });
    }

    /*
     * -----------------------------------------------------
     * Rule 2:
     * Applicant must have at least 3 shares.
     * -----------------------------------------------------
     */

    const shareRow = db
      .prepare(
        `SELECT COALESCE(
          SUM(amount),
          0
        ) AS total
         FROM transactions
         WHERE member_id = ?
           AND type = 'share_purchase'`
      )
      .get(member_id);

    const shareBalance =
      Number(shareRow?.total ?? 0);

    if (
      shareBalance < MINIMUM_SHARE_BALANCE
    ) {
      return res.status(409).json({
        error:
          `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares (${MINIMUM_SHARE_BALANCE.toLocaleString()} ETB) before applying for a loan`,
      });
    }

    /*
     * -----------------------------------------------------
     * Current savings balance
     * -----------------------------------------------------
     */

    const savingsRow = db
      .prepare(
        `SELECT COALESCE(
          SUM(amount),
          0
        ) AS total
         FROM transactions
         WHERE member_id = ?
           AND type = 'savings_deposit'`
      )
      .get(member_id);

    const savingsBalance =
      Number(savingsRow?.total ?? 0);

    /*
     * -----------------------------------------------------
     * Rule 4:
     * Applicant cannot have another loan in ANY
     * non-terminal status.
     *
     * Terminal statuses:
     * - closed
     * - rejected
     *
     * Non-terminal:
     * - pending
     * - awaiting_guarantor
     * - awaiting_recommendation
     * - guarantor_declined
     * - active
     *
     * Note:
     * guarantor_declined is treated as non-terminal here
     * according to the stated rule that only terminal statuses
     * should permit a new loan.
     * -----------------------------------------------------
     */

    const existingLoan = db
      .prepare(
        `SELECT id, status
         FROM loans
         WHERE member_id = ?
           AND status IN (${NON_TERMINAL_LOAN_STATUSES
             .map(() => '?')
             .join(', ')})`
      )
      .get(
        member_id,
        ...NON_TERMINAL_LOAN_STATUSES
      );

    if (existingLoan) {
      return res.status(409).json({
        error:
          'Member already has a non-terminal loan',
      });
    }

    /*
     * -----------------------------------------------------
     * Rule 7:
     * Self-secured principal cannot exceed
     * current savings + shares balance.
     * -----------------------------------------------------
     */

    if (type === 'self_secured') {
      const availableAmount =
        savingsBalance + shareBalance;

      if (principal > availableAmount) {
        return res.status(409).json({
          error:
            `Self-secured loan principal cannot exceed the member's current savings plus shares balance (${availableAmount.toLocaleString()} ETB)`,
        });
      }
    }

    /*
     * -----------------------------------------------------
     * Guarantor validation
     * -----------------------------------------------------
     */

    if (guarantor_member_id) {
      /*
       * Cannot guarantee own loan.
       */

      if (
        guarantor_member_id === member_id
      ) {
        return res.status(400).json({
          error:
            'guarantor_member_id cannot be the same as member_id',
        });
      }

      /*
       * Rule 5:
       * Guarantor must exist and be active.
       */

      const guarantor = db
        .prepare(
          `SELECT
            id,
            status
           FROM members
           WHERE id = ?`
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

      /*
       * Guarantor savings.
       */

      const guarantorSavingsRow =
        db
          .prepare(
            `SELECT COALESCE(
              SUM(amount),
              0
            ) AS total
             FROM transactions
             WHERE member_id = ?
               AND type = 'savings_deposit'`
          )
          .get(
            guarantor_member_id
          );

      const guarantorSavings =
        Number(
          guarantorSavingsRow?.total ?? 0
        );

      /*
       * Guarantor must have savings >= 3 x principal.
       */

      const requiredGuarantorSavings =
        principal * 3;

      if (
        guarantorSavings <
        requiredGuarantorSavings
      ) {
        return res.status(409).json({
          error:
            `Guarantor must have savings of at least ${requiredGuarantorSavings.toLocaleString()} ETB for this loan`,
        });
      }

      /*
       * Guarantor cannot already be guaranteeing
       * another live loan.
       */

      const guaranteedLoan = db
        .prepare(
          `SELECT id, status
           FROM loans
           WHERE guarantor_member_id = ?
             AND status IN (${NON_TERMINAL_LOAN_STATUSES
               .map(() => '?')
               .join(', ')})`
        )
        .get(
          guarantor_member_id,
          ...NON_TERMINAL_LOAN_STATUSES
        );

      if (guaranteedLoan) {
        return res.status(409).json({
          error:
            'Guarantor already has an active or pending guaranteed loan',
        });
      }
    }

    /*
     * -----------------------------------------------------
     * Calculate loan values
     * -----------------------------------------------------
     */

    const months =
      term_years * 12;

    const interest_rate =
      INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      Math.round(
        (principal / months) * 100
      ) / 100;

    const monthly_interest_amount =
      Math.round(
        (
          (principal * interest_rate) /
          100 /
          months
        ) * 100
      ) / 100;

    const insurance_amount =
      Math.round(
        principal * 0.01 * 100
      ) / 100;

    /*
     * -----------------------------------------------------
     * Determine initial status
     * -----------------------------------------------------
     *
     * Regular + guarantor:
     *   awaiting_guarantor
     *
     * Regular + property:
     *   awaiting_recommendation
     *
     * Self-secured:
     *   awaiting_recommendation
     */

    let initialStatus =
      'awaiting_recommendation';

    if (
      type === 'regular' &&
      collateral_type === 'guarantor'
    ) {
      initialStatus =
        'awaiting_guarantor';
    }

    /*
     * -----------------------------------------------------
     * Create loan + notification atomically.
     * -----------------------------------------------------
     */

    const id = randomUUID();

    const createLoan =
      db.transaction(() => {
        /*
         * IMPORTANT:
         *
         * collateral_document_ref and
         * collateral_certifying_authority must exist
         * in the SQLite loans table for these values
         * to be stored.
         *
         * If your final schema already contains them,
         * keep these columns in the INSERT.
         */

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
          collateral_document_ref?.trim() ?? null,
          collateral_certifying_authority?.trim() ?? null,
          initialStatus
        );

        /*
         * Only regular + guarantor loans create a
         * guarantor request notification.
         */

        if (
          type === 'regular' &&
          collateral_type === 'guarantor' &&
          guarantor_member_id
        ) {
          createLoanNotification({
            memberId:
              guarantor_member_id,

            loanId: id,

            title:
              'Guarantor consent required',

            message:
              'A member has listed you as a guarantor for a loan. Please review and respond to the guarantor request.',

            type:
              'guarantor_request',
          });
        }
      });

    createLoan();

    /*
     * Return the newly-created loan.
     */

    const loan = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(id);

    res.status(201).json(loan);
  })
);

/*
 * ---------------------------------------------------------
 * PATCH /api/loans/:id/guarantor-response
 * ---------------------------------------------------------
 *
 * Office API:
 * - administrator authentication
 * - approve / decline
 *
 * approve:
 *   awaiting_guarantor -> awaiting_recommendation
 *
 * decline:
 *   awaiting_guarantor -> guarantor_declined
 */

router.patch(
  '/:id/guarantor-response',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      decision,
    } = req.body ?? {};

    if (
      !['approve', 'decline'].includes(
        decision
      )
    ) {
      return res.status(400).json({
        error:
          'decision must be either approve or decline',
      });
    }

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

    if (
      loan.status !==
      'awaiting_guarantor'
    ) {
      return res.status(409).json({
        error:
          `Guarantor response cannot be recorded while loan status is '${loan.status}'`,
      });
    }

    if (!loan.guarantor_member_id) {
      return res.status(409).json({
        error:
          'This loan does not have a guarantor',
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

    const updateLoanAndNotify =
      db.transaction(() => {
        db.prepare(
          `UPDATE loans
           SET
             status = ?,
             guarantor_responded_at = datetime('now'),
             updated_at = datetime('now'),
             synced_at = NULL
           WHERE id = ?
             AND status = 'awaiting_guarantor'`
        ).run(
          nextStatus,
          loan.id
        );

        /*
         * Notify the borrower.
         */

        createLoanNotification({
          memberId:
            loan.member_id,

          loanId:
            loan.id,

          title:
            'Guarantor response',

          message:
            borrowerMessage,

          type:
            'loan_status',
        });
      });

    updateLoanAndNotify();

    const updated = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(loan.id);

    res.json(updated);
  })
);

/*
 * ---------------------------------------------------------
 * Loan status transitions
 * ---------------------------------------------------------
 */

const ALLOWED_TRANSITIONS = {
  pending: [
    'active',
    'rejected',
  ],

  awaiting_guarantor: [
    'rejected',
  ],

  awaiting_recommendation: [
    'active',
    'rejected',
  ],

  active: [
    'closed',
  ],

  guarantor_declined: [],

  closed: [],

  rejected: [],
};

/*
 * ---------------------------------------------------------
 * PATCH /api/loans/:id/status
 * ---------------------------------------------------------
 */

router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      status,
      disbursement_date,
    } = req.body ?? {};

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

    const allowedNext =
      ALLOWED_TRANSITIONS[
        loan.status
      ] || [];

    if (
      !allowedNext.includes(status)
    ) {
      return res.status(400).json({
        error:
          `Cannot move loan from '${loan.status}' to '${status}'. Allowed: ${
            allowedNext.join(', ') || 'none'
          }`,
      });
    }

    /*
     * -----------------------------------------------------
     * Activating a loan
     * -----------------------------------------------------
     */

    if (status === 'active') {
      /*
       * Applicant must still be active.
       */

      const member = db
        .prepare(
          `SELECT
            id,
            status
           FROM members
           WHERE id = ?`
        )
        .get(loan.member_id);

      if (
        !member ||
        member.status !== 'active'
      ) {
        return res.status(409).json({
          error:
            'Loans can only be activated for active members',
        });
      }

      /*
       * Guarantor must still be active.
       */

      if (
        loan.guarantor_member_id
      ) {
        const guarantor = db
          .prepare(
            `SELECT
              id,
              status
             FROM members
             WHERE id = ?`
          )
          .get(
            loan.guarantor_member_id
          );

        if (
          !guarantor ||
          guarantor.status !== 'active'
        ) {
          return res.status(409).json({
            error:
              'The guarantor must be an active member',
          });
        }
      }

      /*
       * No other active loan for applicant.
       */

      const activeLoan = db
        .prepare(
          `SELECT id
           FROM loans
           WHERE member_id = ?
             AND status = 'active'
             AND id <> ?`
        )
        .get(
          loan.member_id,
          loan.id
        );

      if (activeLoan) {
        return res.status(409).json({
          error:
            'Member already has an active loan',
        });
      }

      /*
       * Disbursement date.
       */

      const disbursementDate =
        typeof disbursement_date ===
          'string' &&
        disbursement_date.trim()
          ? disbursement_date.trim()
          : getServerDate();

      if (
        disbursement_date !==
          undefined &&
        typeof disbursement_date !==
          'string'
      ) {
        return res.status(400).json({
          error:
            'disbursement_date must be a string in YYYY-MM-DD format',
        });
      }

      if (
        !isValidISODate(
          disbursementDate
        )
      ) {
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
      ).run(
        disbursementDate,
        loan.id
      );
    } else {
      /*
       * Normal status update.
       */

      db.prepare(
        `UPDATE loans
         SET
           status = ?,
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?`
      ).run(
        status,
        loan.id
      );
    }

    const updated = db
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(loan.id);

    res.json(updated);
  })
);

export default router;