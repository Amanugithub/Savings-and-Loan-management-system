import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, CHAIR_LEVEL, INTAKE_LEVEL } from '../middleware/roles.js';

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

const INTEREST_RATE_BY_TERM = {
  1: 8,
  2: 8,
  3: 10,
  4: 11,
  5: 13,
};

const SHARE_PRICE = 3000;
const MINIMUM_SHARES_FOR_LOAN = 3;

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

function getShareBalance(memberId) {
  return db
    .prepare(
      `
        SELECT ROUND(
          COALESCE(SUM(amount), 0),
          2
        ) AS total
        FROM transactions
        WHERE member_id = ?
          AND type IN (
            'share_purchase',
            'opening_share_balance'
          )
      `
    )
    .get(memberId).total;
}

function getSavingsBalance(memberId) {
  return db
    .prepare(
      `
        SELECT ROUND(
          COALESCE(SUM(amount), 0),
          2
        ) AS total
        FROM transactions
        WHERE member_id = ?
          AND type IN (
            'savings_deposit',
            'opening_savings_balance'
          )
      `
    )
    .get(memberId).total;
}

function getMinimumShareBalance() {
  return SHARE_PRICE * MINIMUM_SHARES_FOR_LOAN;
}

function validateActiveMember(memberId, errorMessage) {
  const member = db
    .prepare(
      'SELECT id, status FROM members WHERE id = ?'
    )
    .get(memberId);

  if (!member) {
    return {
      error: 'Member not found',
    };
  }

  if (member.status !== 'active') {
    return {
      error: errorMessage,
    };
  }

  return {
    member,
  };
}

/*
 * GET /api/loans
 *
 * Any authenticated administrator can read loans.
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

    res.json(loans);
  })
);

/*
 * GET /api/loans/:id
 *
 * Any authenticated administrator can read a loan.
 */
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

/*
 * POST /api/loans
 *
 * Allowed:
 * - cashier
 * - general_manager
 *
 * Creates a loan application.
 *
 * Workflow:
 *
 * regular + guarantor
 *   -> awaiting_guarantor
 *
 * regular + property
 *   -> awaiting_recommendation
 *
 * self_secured
 *   -> awaiting_recommendation
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

    if (
      !member_id ||
      !type ||
      principal_amount === undefined ||
      !term_years
    ) {
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

    /*
     * Regular loans must use either guarantor or property collateral.
     * Self-secured loans may have NULL collateral_type.
     */
    if (
      type === 'regular' &&
      !VALID_COLLATERAL_TYPES.includes(collateral_type)
    ) {
      return res.status(400).json({
        error:
          "Regular loans require collateral_type to be 'guarantor' or 'property'",
      });
    }

    if (
      collateral_type !== undefined &&
      collateral_type !== null &&
      !VALID_COLLATERAL_TYPES.includes(collateral_type)
    ) {
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
      collateral_type !== 'guarantor' &&
      guarantor_member_id
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is only allowed when collateral_type is guarantor',
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

    if (
      collateral_type === 'property' &&
      !collateral_document_ref
    ) {
      return res.status(400).json({
        error:
          'collateral_document_ref is required for property collateral',
      });
    }

    if (
      collateral_type === 'property' &&
      !collateral_certifying_authority
    ) {
      return res.status(400).json({
        error:
          'collateral_certifying_authority is required for property collateral',
      });
    }

    const memberResult = validateActiveMember(
      member_id,
      'Loans can only be created for active members'
    );

    if (memberResult.error) {
      return res.status(400).json({
        error: memberResult.error,
      });
    }

    /*
     * Loan eligibility requires at least three shares.
     */
    const shareBalance = getShareBalance(member_id);
    const minimumShareBalance = getMinimumShareBalance();

    if (shareBalance < minimumShareBalance) {
      return res.status(409).json({
        error:
          `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares ` +
          `(${minimumShareBalance.toLocaleString()} ETB) before applying for a loan`,
      });
    }

    /*
     * Validate guarantor when guarantor collateral is used.
     *
     * We intentionally do NOT make the guarantor's response happen here.
     * The application waits in awaiting_guarantor.
     */
    if (collateral_type === 'guarantor') {
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
          error: 'The guarantor must be an active member',
        });
      }

      const guarantorSavings =
        getSavingsBalance(guarantor_member_id);

      const requiredGuarantorSavings = principal * 3;

      if (guarantorSavings < requiredGuarantorSavings) {
        return res.status(409).json({
          error:
            `Guarantor must have savings of at least ` +
            `${requiredGuarantorSavings.toLocaleString()} ETB for this loan`,
        });
      }

      /*
       * The unique index also protects this at DB level,
       * but checking here gives the user a useful error.
       */
      const guarantorLiveLoan = db
        .prepare(
          `
            SELECT id
            FROM loans
            WHERE guarantor_member_id = ?
              AND status IN (
                'awaiting_guarantor',
                'awaiting_recommendation',
                'awaiting_committee_approval',
                'approved',
                'active'
              )
          `
        )
        .get(guarantor_member_id);

      if (guarantorLiveLoan) {
        return res.status(409).json({
          error:
            'The guarantor is already guaranteeing another live loan',
        });
      }
    }

    /*
     * A member can have only one live loan.
     */
    const liveLoan = db
      .prepare(
        `
          SELECT id
          FROM loans
          WHERE member_id = ?
            AND status IN (
              'awaiting_guarantor',
              'awaiting_recommendation',
              'awaiting_committee_approval',
              'approved',
              'active'
            )
        `
      )
      .get(member_id);

    if (liveLoan) {
      return res.status(409).json({
        error:
          'Member already has a live loan application or loan',
      });
    }

    const months = term_years * 12;

    const interest_rate =
      INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      Math.round((principal / months) * 100) / 100;

    const monthly_interest_amount =
      Math.round(
        (principal * interest_rate / 100 / months) * 100
      ) / 100;

    const insurance_amount =
      Math.round(principal * 0.01 * 100) / 100;

    /*
     * Determine the initial workflow state.
     */
    let initialStatus;

    if (collateral_type === 'guarantor') {
      initialStatus = 'awaiting_guarantor';
    } else {
      initialStatus = 'awaiting_recommendation';
    }

    const id = randomUUID();

    db.prepare(
      `
        INSERT INTO loans (
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
          collateral_document_ref,
          collateral_certifying_authority,
          synced_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `
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
      initialStatus,
      collateral_document_ref ?? null,
      collateral_certifying_authority ?? null
    );

    const loan = db
      .prepare('SELECT * FROM loans WHERE id = ?')
      .get(id);

    res.status(201).json(loan);
  })
);

/*
 * PATCH /api/loans/:id/status
 *
 * This endpoint is intentionally kept for API compatibility.
 *
 * The allowed action depends on the requested status:
 *
 * awaiting_recommendation
 * recommendation_declined
 *   -> chairperson / vice_chairperson
 *
 * awaiting_committee_approval
 * rejected
 *   -> loan_committee
 *
 * active
 *   -> cashier
 *
 * closed
 *   -> not assigned by Issue 2 yet
 *
 * No generic administrator can arbitrarily change loan status.
 */
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

    /*
     * Determine which role owns the requested transition.
     */
    const role = req.admin?.role;

    const chairTransitions = [
      'awaiting_committee_approval',
      'recommendation_declined',
    ];

    const committeeTransitions = [
      'approved',
      'rejected',
    ];

    const cashierTransitions = [
      'active',
    ];

    /*
     * Recommendation action.
     *
     * awaiting_recommendation -> awaiting_committee_approval
     * awaiting_recommendation -> recommendation_declined
     */
    if (chairTransitions.includes(status)) {
      if (!CHAIR_LEVEL.includes(role)) {
        return res.status(403).json({
          error: 'FORBIDDEN_ROLE',
          message:
            'You do not have permission to perform this action',
        });
      }

      if (
        loan.status !== 'awaiting_recommendation'
      ) {
        return res.status(400).json({
          error:
            `Cannot move loan from '${loan.status}' to '${status}'`,
        });
      }

      if (
        status === 'awaiting_committee_approval'
      ) {
        db.prepare(
          `
            UPDATE loans
            SET
              status = 'awaiting_committee_approval',
              recommended_by = ?,
              recommended_at = datetime('now'),
              updated_at = datetime('now'),
              synced_at = NULL
            WHERE id = ?
          `
        ).run(req.admin.id, req.params.id);
      }

      if (
        status === 'recommendation_declined'
      ) {
        db.prepare(
          `
            UPDATE loans
            SET
              status = 'recommendation_declined',
              declined_by = ?,
              declined_at = datetime('now'),
              updated_at = datetime('now'),
              synced_at = NULL
            WHERE id = ?
          `
        ).run(req.admin.id, req.params.id);
      }
    }

    /*
     * Committee action.
     *
     * awaiting_committee_approval -> approved
     * awaiting_committee_approval -> rejected
     */
    else if (committeeTransitions.includes(status)) {
      if (role !== 'loan_committee') {
        return res.status(403).json({
          error: 'FORBIDDEN_ROLE',
          message:
            'You do not have permission to perform this action',
        });
      }

      if (
        loan.status !== 'awaiting_committee_approval'
      ) {
        return res.status(400).json({
          error:
            `Cannot move loan from '${loan.status}' to '${status}'`,
        });
      }

      if (status === 'approved') {
        db.prepare(
          `
            UPDATE loans
            SET
              status = 'approved',
              approved_by = ?,
              approved_at = datetime('now'),
              updated_at = datetime('now'),
              synced_at = NULL
            WHERE id = ?
          `
        ).run(req.admin.id, req.params.id);
      }

      if (status === 'rejected') {
        db.prepare(
          `
            UPDATE loans
            SET
              status = 'rejected',
              declined_by = ?,
              declined_at = datetime('now'),
              updated_at = datetime('now'),
              synced_at = NULL
            WHERE id = ?
          `
        ).run(req.admin.id, req.params.id);
      }
    }

    /*
     * Disbursement.
     *
     * approved -> active
     *
     * Only cashier can disburse.
     */
    else if (cashierTransitions.includes(status)) {
      if (role !== 'cashier') {
        return res.status(403).json({
          error: 'FORBIDDEN_ROLE',
          message:
            'You do not have permission to perform this action',
        });
      }

      if (loan.status !== 'approved') {
        return res.status(400).json({
          error:
            `Cannot move loan from '${loan.status}' to 'active'`,
        });
      }

      const member = db
        .prepare(
          'SELECT status FROM members WHERE id = ?'
        )
        .get(loan.member_id);

      if (!member || member.status !== 'active') {
        return res.status(409).json({
          error:
            'Loans can only be activated for active members',
        });
      }

      const shareBalance = getShareBalance(
        loan.member_id
      );

      const minimumShareBalance =
        getMinimumShareBalance();

      if (shareBalance < minimumShareBalance) {
        return res.status(409).json({
          error:
            `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares ` +
            `(${minimumShareBalance.toLocaleString()} ETB) ` +
            `before a loan can be activated`,
        });
      }

      /*
       * Revalidate guarantor conditions at disbursement.
       * The financial conditions may have changed after approval.
       */
      if (loan.guarantor_member_id) {
        const guarantor = db
          .prepare(
            'SELECT status FROM members WHERE id = ?'
          )
          .get(loan.guarantor_member_id);

        if (
          !guarantor ||
          guarantor.status !== 'active'
        ) {
          return res.status(409).json({
            error:
              'The guarantor must be an active member',
          });
        }

        const guarantorSavings =
          getSavingsBalance(
            loan.guarantor_member_id
          );

        const requiredGuarantorSavings =
          loan.principal_amount * 3;

        if (
          guarantorSavings <
          requiredGuarantorSavings
        ) {
          return res.status(409).json({
            error:
              `Guarantor must have savings of at least ` +
              `${requiredGuarantorSavings.toLocaleString()} ETB ` +
              `before this loan can be activated`,
          });
        }
      }

      const liveLoan = db
        .prepare(
          `
            SELECT id
            FROM loans
            WHERE member_id = ?
              AND status IN (
                'awaiting_guarantor',
                'awaiting_recommendation',
                'awaiting_committee_approval',
                'approved',
                'active'
              )
              AND id <> ?
          `
        )
        .get(
          loan.member_id,
          req.params.id
        );

      if (liveLoan) {
        return res.status(409).json({
          error:
            'Member already has another live loan',
        });
      }

      const disbursementDate =
        typeof disbursement_date === 'string' &&
        disbursement_date.trim()
          ? disbursement_date.trim()
          : new Date()
              .toISOString()
              .slice(0, 10);

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
        `
          UPDATE loans
          SET
            status = 'active',
            disbursement_date = ?,
            disbursed_by = ?,
            updated_at = datetime('now'),
            synced_at = NULL
          WHERE id = ?
        `
      ).run(
        disbursementDate,
        req.admin.id,
        req.params.id
      );
    }

    /*
     * Closing is deliberately not assigned to a role here.
     *
     * Issue 2 does not define which administrator role is
     * responsible for closing a loan.
     */
    else if (status === 'closed') {
      return res.status(400).json({
        error:
          'Loan closure role is not defined by the current role matrix',
      });
    }

    else {
      return res.status(400).json({
        error:
          `Invalid loan status transition target: '${status}'`,
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

export default router;