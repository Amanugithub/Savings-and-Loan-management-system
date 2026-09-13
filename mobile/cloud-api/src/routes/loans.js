import { Router } from 'express';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();

const VALID_TERMS = [1, 2, 3, 4, 5];
const VALID_LOAN_TYPES = ['regular', 'self_secured'];
const VALID_COLLATERAL_TYPES = ['guarantor', 'property'];

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
    return { error: `${name} must be a positive number` };
  }

  const cents = Math.round((value + Number.EPSILON) * 100);

  if (Math.abs(value - cents / 100) > 1e-9) {
    return {
      error: `${name} must have no more than 2 decimal places`,
    };
  }

  return { value: cents / 100 };
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

// Adds exactly 6 calendar months.
// Example:
// 2026-01-31 -> 2026-07-31
// 2024-08-31 -> 2025-02-28
function addSixMonths(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);

  const targetMonth = month + 6;
  const targetYear = year + Math.floor((targetMonth - 1) / 12);
  const normalizedMonth = ((targetMonth - 1) % 12) + 1;

  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonth, 0)
  ).getUTCDate();

  const targetDay = Math.min(day, lastDayOfTargetMonth);

  return `${targetYear}-${String(normalizedMonth).padStart(2, '0')}-${String(
    targetDay
  ).padStart(2, '0')}`;
}

function getApplicationDate(value) {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString().slice(0, 10);
  }

  if (!isValidISODate(value)) {
    return null;
  }

  return value;
}

// GET /api/loans/me
router.get(
  '/me',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT *
       FROM loans
       WHERE member_id = $1
       ORDER BY created_at DESC`,
      [req.member.id]
    );

    res.json(rows);
  })
);

// GET /api/loans/:id
// A member can view a loan only if they are the borrower
// or the guarantor.
router.get(
  '/:id',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT *
       FROM loans
       WHERE id = $1
         AND (member_id = $2 OR guarantor_member_id = $2)`,
      [req.params.id, req.member.id]
    );

    if (!rows[0]) {
      return res.status(404).json({
        error: 'Loan not found',
      });
    }

    res.json(rows[0]);
  })
);

// POST /api/loans
router.post(
  '/',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const {
      type,
      principal_amount,
      term_years,
      collateral_type,
      guarantor_member_id,
      application_date,
      collateral_document_ref,
      collateral_certifying_authority,
    } = req.body ?? {};

    const member_id = req.member.id;

    /*
     * ---------------------------------------------------------
     * 1. Required fields
     * ---------------------------------------------------------
     *
     * Self-secured loans intentionally do NOT require
     * collateral_type or guarantor_member_id.
     */
    if (
      !type ||
      principal_amount === undefined ||
      !term_years
    ) {
      return res.status(400).json({
        error:
          'type, principal_amount, and term_years are required',
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
     * ---------------------------------------------------------
     * 2. Self-secured loan rules
     * ---------------------------------------------------------
     */
    if (type === 'self_secured') {
      if (collateral_type) {
        return res.status(400).json({
          error: 'Self-secured loans cannot have collateral_type',
        });
      }

      if (guarantor_member_id) {
        return res.status(400).json({
          error: 'Self-secured loans cannot have a guarantor',
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * 3. Regular loan collateral rules
     * ---------------------------------------------------------
     */
    if (type === 'regular') {
      if (!collateral_type) {
        return res.status(400).json({
          error:
            'collateral_type is required for regular loans',
        });
      }

      if (!VALID_COLLATERAL_TYPES.includes(collateral_type)) {
        return res.status(400).json({
          error: `collateral_type must be one of: ${VALID_COLLATERAL_TYPES.join(
            ', '
          )}`,
        });
      }
    }

    /*
     * A guarantor ID is invalid for property loans and
     * self-secured loans.
     */
    if (
      guarantor_member_id &&
      (type === 'self_secured' ||
        collateral_type === 'property')
    ) {
      return res.status(400).json({
        error:
          'guarantor_member_id is only allowed when collateral_type is guarantor',
      });
    }

    /*
     * ---------------------------------------------------------
     * 4. Application date
     * ---------------------------------------------------------
     */
    const applicationDate = getApplicationDate(application_date);

    if (!applicationDate) {
      return res.status(400).json({
        error:
          'application_date must be a valid date in YYYY-MM-DD format',
      });
    }

    /*
     * ---------------------------------------------------------
     * 5. Applicant must exist and be active
     * ---------------------------------------------------------
     */
    const { rows: memberRows } = await pool.query(
      `SELECT id, status, date_joined
       FROM members
       WHERE id = $1`,
      [member_id]
    );

    const member = memberRows[0];

    if (!member) {
      return res.status(400).json({
        error: 'Member not found',
      });
    }

    if (member.status !== 'active') {
      return res.status(400).json({
        error: 'Loans can only be created for active members',
      });
    }

    /*
     * ---------------------------------------------------------
     * 6. Six-month membership requirement
     * ---------------------------------------------------------
     *
     * Exactly six calendar months is allowed.
     * One day before the six-month boundary is rejected.
     */
    if (!member.date_joined) {
      return res.status(400).json({
        error: 'Member date_joined is required for loan eligibility',
      });
    }

    const joinedDate =
      typeof member.date_joined === 'string'
        ? member.date_joined.slice(0, 10)
        : member.date_joined.toISOString().slice(0, 10);

    if (!isValidISODate(joinedDate)) {
      return res.status(400).json({
        error: 'Member date_joined is invalid',
      });
    }

    const minimumLoanDate = addSixMonths(joinedDate);

    if (applicationDate < minimumLoanDate) {
      return res.status(409).json({
        error:
          'Member must have been registered for at least six months before applying for a loan',
      });
    }

    /*
     * ---------------------------------------------------------
     * 7. Minimum three shares
     * ---------------------------------------------------------
     */
    const { rows: shareRows } = await pool.query(
      `SELECT COALESCE(
        SUM(amount) FILTER (
          WHERE type IN ('share_purchase', 'opening_share_balance')
        ),
        0
      ) AS total
       FROM transactions
       WHERE member_id = $1`,
      [member_id]
    );

    const shareBalance = Number(shareRows[0].total || 0);
    const minimumShareBalance =
      SHARE_PRICE * MINIMUM_SHARES_FOR_LOAN;

    if (shareBalance < minimumShareBalance) {
      return res.status(409).json({
        error: `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares (${minimumShareBalance.toLocaleString()} ETB) before applying for a loan`,
      });
    }

    /*
     * ---------------------------------------------------------
     * 8. Applicant cannot have another live loan
     * ---------------------------------------------------------
     */
    const { rows: existingLoans } = await pool.query(
      `SELECT id
       FROM loans
       WHERE member_id = $1
         AND status IN (
           'pending',
           'awaiting_guarantor',
           'awaiting_recommendation',
           'active'
         )
       LIMIT 1`,
      [member_id]
    );

    if (existingLoans[0]) {
      return res.status(409).json({
        error:
          'Member already has an active or pending loan',
      });
    }

    /*
     * ---------------------------------------------------------
     * 9. Self-secured balance rule
     * ---------------------------------------------------------
     *
     * principal <= current savings + shares
     */
    if (type === 'self_secured') {
      const { rows: balanceRows } = await pool.query(
        `SELECT
          COALESCE(
            SUM(amount) FILTER (
              WHERE type IN (
                'savings_deposit',
                'opening_savings_balance'
              )
            ),
            0
          ) AS savings,
          COALESCE(
            SUM(amount) FILTER (
              WHERE type IN (
                'share_purchase',
                'opening_share_balance'
              )
            ),
            0
          ) AS shares
         FROM transactions
         WHERE member_id = $1`,
        [member_id]
      );

      const savingsBalance = Number(
        balanceRows[0].savings || 0
      );

      const sharesBalance = Number(
        balanceRows[0].shares || 0
      );

      const securedBalance =
        savingsBalance + sharesBalance;

      if (principal > securedBalance) {
        return res.status(409).json({
          error: `Self-secured loan principal cannot exceed current savings plus shares balance (${securedBalance.toLocaleString()} ETB)`,
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * 10. Guarantor rules
     * ---------------------------------------------------------
     */
    if (collateral_type === 'guarantor') {
      if (!guarantor_member_id) {
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

      const { rows: guarantorRows } = await pool.query(
        `SELECT id, status
         FROM members
         WHERE id = $1`,
        [guarantor_member_id]
      );

      const guarantor = guarantorRows[0];

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

      /*
       * Guarantor savings >= 3 × principal
       */
      const { rows: savingsRows } = await pool.query(
        `SELECT COALESCE(
          SUM(amount) FILTER (
            WHERE type IN (
              'savings_deposit',
              'opening_savings_balance'
            )
          ),
          0
        ) AS total
         FROM transactions
         WHERE member_id = $1`,
        [guarantor_member_id]
      );

      const guarantorSavings = Number(
        savingsRows[0].total || 0
      );

      const requiredGuarantorSavings =
        principal * 3;

      if (guarantorSavings < requiredGuarantorSavings) {
        return res.status(409).json({
          error: `Guarantor must have savings of at least ${requiredGuarantorSavings.toLocaleString()} ETB for this loan`,
        });
      }

      /*
       * No other live guaranteed loan.
       */
      const { rows: guaranteedLoans } = await pool.query(
        `SELECT id
         FROM loans
         WHERE guarantor_member_id = $1
           AND status IN (
             'pending',
             'awaiting_guarantor',
             'awaiting_recommendation',
             'active'
           )
         LIMIT 1`,
        [guarantor_member_id]
      );

      if (guaranteedLoans[0]) {
        return res.status(409).json({
          error:
            'Guarantor already has an active or pending guaranteed loan',
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * 11. Property collateral
     * ---------------------------------------------------------
     *
     * These fields are stored only when the database supports
     * them. They are required before committee approval.
     *
     * IMPORTANT:
     * Your current PostgreSQL schema does not contain these
     * columns yet, so do not send them to INSERT until those
     * columns are added to the schema.
     */
    if (
      type === 'regular' &&
      collateral_type === 'property'
    ) {
      if (
        !collateral_document_ref ||
        !collateral_certifying_authority
      ) {
        return res.status(400).json({
          error:
            'collateral_document_ref and collateral_certifying_authority are required for property collateral',
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * 12. Calculate loan values
     * ---------------------------------------------------------
     */
    const months = term_years * 12;

    const interest_rate =
      INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      Math.round((principal / months) * 100) / 100;

    const monthly_interest_amount =
      Math.round(
        (principal * interest_rate) /
          100 /
          months *
          100
      ) / 100;

    const insurance_amount =
      Math.round(principal * 0.01 * 100) / 100;

    /*
     * ---------------------------------------------------------
     * 13. Initial status
     * ---------------------------------------------------------
     */
    let initialStatus = 'awaiting_recommendation';

    if (
      type === 'regular' &&
      collateral_type === 'guarantor'
    ) {
      initialStatus = 'awaiting_guarantor';
    }

    /*
     * ---------------------------------------------------------
     * 14. Insert loan + guarantor notification atomically
     * ---------------------------------------------------------
     */
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO loans
          (
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
            status
          )
         VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10, $11
         )
         RETURNING *`,
        [
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
        ]
      );

      const loan = rows[0];

      /*
       * Guarantor request notification.
       */
      if (
        type === 'regular' &&
        collateral_type === 'guarantor' &&
        guarantor_member_id
      ) {
        await client.query(
          `INSERT INTO notifications
            (
              member_id,
              loan_id,
              title,
              message,
              type,
              is_read
            )
           VALUES ($1, $2, $3, $4, $5, false)`,
          [
            guarantor_member_id,
            loan.id,
            'Guarantor consent required',
            'A member has listed you as a guarantor for a loan. Please review and respond to the guarantor request.',
            'guarantor_request',
          ]
        );
      }

      await client.query('COMMIT');

      res.status(201).json(loan);
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }
  })
);

// PATCH /api/loans/:id/guarantor-response
//
// Only the authenticated guarantor can respond.
//
// approve -> awaiting_recommendation
// decline -> guarantor_declined
router.patch(
  '/:id/guarantor-response',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { decision } = req.body ?? {};

    const memberId = req.member.id;
    const loanId = req.params.id;

    if (!['approve', 'decline'].includes(decision)) {
      return res.status(400).json({
        error:
          'decision must be either approve or decline',
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: loanRows } = await client.query(
        `SELECT *
         FROM loans
         WHERE id = $1
           AND guarantor_member_id = $2
         FOR UPDATE`,
        [loanId, memberId]
      );

      const loan = loanRows[0];

      if (!loan) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          error: 'Loan not found',
        });
      }

      if (loan.status !== 'awaiting_guarantor') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error:
            `Guarantor response cannot be recorded while loan status is '${loan.status}'`,
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

      const { rows: updatedRows } = await client.query(
        `UPDATE loans
         SET
           status = $1,
           guarantor_responded_at = now(),
           updated_at = now()
         WHERE id = $2
           AND status = 'awaiting_guarantor'
         RETURNING *`,
        [nextStatus, loanId]
      );

      if (!updatedRows[0]) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error:
            'This guarantor response has already been recorded',
        });
      }

      const updatedLoan = updatedRows[0];

      await client.query(
        `INSERT INTO notifications
          (
            member_id,
            loan_id,
            title,
            message,
            type,
            is_read
          )
         VALUES ($1, $2, $3, $4, 'loan_status', false)`,
        [
          loan.member_id,
          loan.id,
          'Guarantor response',
          borrowerMessage,
        ]
      );

      await client.query('COMMIT');

      res.json(updatedLoan);
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }
  })
);

export default router;