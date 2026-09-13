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

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

/*
 * Round monetary values to two decimal places.
 */
function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/*
 * Add months while keeping the date valid.
 *
 * Example:
 * 2026-01-31 + 1 month -> 2026-02-28
 * 2028-01-31 + 1 month -> 2028-02-29
 */
function addMonthsClamped(dateString, monthsToAdd) {
  const [year, month, day] = dateString.split('-').map(Number);

  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear =
    year + Math.floor(targetMonthIndex / 12);
  const targetMonth =
    targetMonthIndex % 12;

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();

  const targetDay = Math.min(day, lastDayOfTargetMonth);

  return [
    targetYear,
    String(targetMonth + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-');
}

/*
 * Generate the complete persisted installment schedule.
 *
 * The monthly values stored on the loan are used as the basis.
 * Any rounding remainder is assigned to the final installment.
 */
function generateLoanInstallments(loan) {
  const months = loan.term_years * 12;

  const principalTotal = roundMoney(
    Number(loan.monthly_installment) * months
  );

  const interestTotal = roundMoney(
    Number(loan.monthly_interest_amount) * months
  );

  const insuranceTotal = roundMoney(
    Number(loan.insurance_amount)
  );

  const monthlyPrincipal = roundMoney(
    Number(loan.monthly_installment)
  );

  const monthlyInterest = roundMoney(
    Number(loan.monthly_interest_amount)
  );

  const monthlyInsurance = roundMoney(
    insuranceTotal / months
  );

  const installments = [];

  let principalAssigned = 0;
  let interestAssigned = 0;
  let insuranceAssigned = 0;

  for (let number = 1; number <= months; number += 1) {
    const isFinal = number === months;

    const principalDue = isFinal
      ? roundMoney(principalTotal - principalAssigned)
      : monthlyPrincipal;

    const interestDue = isFinal
      ? roundMoney(interestTotal - interestAssigned)
      : monthlyInterest;

    const insuranceDue = isFinal
      ? roundMoney(insuranceTotal - insuranceAssigned)
      : monthlyInsurance;

    principalAssigned = roundMoney(
      principalAssigned + principalDue
    );

    interestAssigned = roundMoney(
      interestAssigned + interestDue
    );

    insuranceAssigned = roundMoney(
      insuranceAssigned + insuranceDue
    );

    installments.push({
      id: randomUUID(),
      loan_id: loan.id,
      installment_number: number,
      due_date: addMonthsClamped(
        loan.disbursement_date,
        number
      ),
      principal_due: principalDue,
      interest_due: interestDue,
      insurance_due: insuranceDue,
    });
  }

  return installments;
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
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'))`
  ).run(
    id,
    memberId,
    loanId,
    title,
    message,
    type
  );

  return db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(id);
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

// GET /api/loans/:id/installments
//
// Returns the persisted installment schedule for a loan,
// including paid amounts and remaining amounts.
router.get(
  '/:id/installments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const loan = db
      .prepare('SELECT id FROM loans WHERE id = ?')
      .get(req.params.id);

    if (!loan) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    const installments = db
      .prepare(
        `SELECT
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
          created_at,
          updated_at,
          synced_at,
          ROUND(
            principal_due - principal_paid,
            2
          ) AS principal_remaining,
          ROUND(
            interest_due - interest_paid,
            2
          ) AS interest_remaining,
          ROUND(
            insurance_due - insurance_paid,
            2
          ) AS insurance_remaining
         FROM loan_installments
         WHERE loan_id = ?
         ORDER BY installment_number ASC`
      )
      .all(req.params.id);

    res.json({
      data: installments,
    });
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
    }

    const activeLoan = db
      .prepare(
        "SELECT id FROM loans WHERE member_id = ? AND status = 'active'"
      )
      .get(member_id);

    if (activeLoan) {
      return res.status(409).json({
        error: 'Member already has an active loan',
      });
    }

    const months = term_years * 12;
    const interest_rate =
      INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      principal_amount / months;

    const monthly_interest_amount =
      (principal_amount * interest_rate) / 100 / months;

    const insurance_amount =
      principal_amount * 0.01;

    const id = randomUUID();

    /*
     * Loan creation state:
     *
     * Regular + guarantor -> awaiting_guarantor
     * Regular + property  -> awaiting_recommendation
     * Self-secured       -> awaiting_recommendation
     */
    const initialStatus =
      type === 'regular' &&
      collateral_type === 'guarantor'
        ? 'awaiting_guarantor'
        : 'awaiting_recommendation';

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
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
      .get(id);

    res.status(201).json(loan);
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

    /*
     * This endpoint only works while the loan is waiting
     * for guarantor consent.
     *
     * Because we require this exact status, repeated responses
     * cannot change the loan again.
     */
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
      ).run(
        nextStatus,
        loan.id
      );

      /*
       * The notification is for the borrower only.
       * It references the loan.
       */
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
      .prepare(
        'SELECT * FROM loans WHERE id = ?'
      )
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
    const { status, disbursement_date } =
      req.body;

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
      ALLOWED_TRANSITIONS[loan.status] || [];

    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error:
          `Cannot move loan from '${loan.status}' to '${status}'. Allowed: ${
            allowedNext.join(', ') || 'none'
          }`,
      });
    }

    if (status === 'active') {
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
      }

      const activeLoan = db
        .prepare(
          "SELECT id FROM loans WHERE member_id = ? AND status = 'active' AND id <> ?"
        )
        .get(
          loan.member_id,
          req.params.id
        );

      if (activeLoan) {
        return res.status(409).json({
          error:
            'Member already has an active loan',
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

      /*
       * Activation and installment generation happen
       * inside the SAME SQLite transaction.
       *
       * If schedule generation fails, loan activation
       * is rolled back as well.
       */
      try {
        const activateLoan =
          db.transaction(() => {
            /*
             * Prevent duplicate schedule generation.
             */
            const existingInstallments =
              db
                .prepare(
                  `SELECT id
                   FROM loan_installments
                   WHERE loan_id = ?
                   LIMIT 1`
                )
                .get(loan.id);

            if (existingInstallments) {
              const error = new Error(
                'Loan installment schedule has already been generated'
              );
              error.status = 409;
              throw error;
            }

            /*
             * Activate the loan.
             */
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
              req.params.id
            );

            const activatedLoan = db
              .prepare(
                'SELECT * FROM loans WHERE id = ?'
              )
              .get(req.params.id);

            /*
             * Generate exactly term_years × 12
             * installment rows.
             */
            const installments =
              generateLoanInstallments(
                activatedLoan
              );

            const insertInstallment =
              db.prepare(
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
                  synced_at,
                  created_at,
                  updated_at
                )
                VALUES (
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  0,
                  0,
                  0,
                  'unpaid',
                  NULL,
                  datetime('now'),
                  datetime('now')
                )`
              );

            for (
              const installment
              of installments
            ) {
              insertInstallment.run(
                installment.id,
                installment.loan_id,
                installment.installment_number,
                installment.due_date,
                installment.principal_due,
                installment.interest_due,
                installment.insurance_due
              );
            }
          });

        activateLoan();
      } catch (error) {
        if (
          error?.status === 409
        ) {
          return res.status(409).json({
            error: error.message,
          });
        }

        throw error;
      }
    } else {
      db.prepare(
        `UPDATE loans
         SET
           status = ?,
           updated_at = datetime('now'),
           synced_at = NULL
         WHERE id = ?`
      ).run(
        status,
        req.params.id
      );
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