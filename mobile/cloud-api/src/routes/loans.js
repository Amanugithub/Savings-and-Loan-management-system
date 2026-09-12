import { Router } from 'express';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();

const VALID_TERMS = [1, 2, 3, 4, 5];
const VALID_LOAN_TYPES = ['regular', 'self_secured'];
const VALID_COLLATERAL_TYPES = ['guarantor', 'property'];
const INTEREST_RATE_BY_TERM = { 1: 8, 2: 8, 3: 10, 4: 11, 5: 13 };
const SHARE_PRICE = 3000;
const MINIMUM_SHARES_FOR_LOAN = 3;

function parseMoney(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { error: `${name} must be a positive number` };
  }

  const cents = Math.round((value + Number.EPSILON) * 100);

  if (Math.abs(value - cents / 100) > 1e-9) {
    return { error: `${name} must have no more than 2 decimal places` };
  }

  return { value: cents / 100 };
}

router.get(
  '/me',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM loans WHERE member_id = $1 ORDER BY created_at DESC',
      [req.member.id]
    );

    res.json(rows);
  })
);

// GET /api/loans/:id
// A member can only view a loan if they are the borrower or guarantor.
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
      return res.status(404).json({ error: 'Loan not found' });
    }

    res.json(rows[0]);
  })
);

// POST /api/loans — apply for a new loan.
router.post(
  '/',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const {
      guarantor_member_id,
      type,
      principal_amount,
      term_years,
      collateral_type,
    } = req.body ?? {};

    const member_id = req.member.id;

    if (!type || principal_amount === undefined || !term_years || !collateral_type) {
      return res.status(400).json({
        error: 'type, principal_amount, term_years, and collateral_type are required',
      });
    }

    if (!VALID_LOAN_TYPES.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${VALID_LOAN_TYPES.join(', ')}`,
      });
    }

    const principalResult = parseMoney(principal_amount, 'principal_amount');

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

    // Self-secured loans must not have a guarantor.
    if (type === 'self_secured' && guarantor_member_id) {
      return res.status(400).json({
        error: 'Self-secured loans cannot have a guarantor',
      });
    }

    if (collateral_type === 'guarantor' && !guarantor_member_id) {
      return res.status(400).json({
        error: 'guarantor_member_id is required when collateral_type is guarantor',
      });
    }

    if (guarantor_member_id === member_id) {
      return res.status(400).json({
        error: 'guarantor_member_id cannot be the same as member_id',
      });
    }

    const { rows: memberRows } = await pool.query(
      'SELECT id, status FROM members WHERE id = $1',
      [member_id]
    );

    const member = memberRows[0];

    if (!member || member.status !== 'active') {
      return res.status(400).json({
        error: 'Loans can only be created for active members',
      });
    }

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

    const shareBalance = Number(shareRows[0].total);
    const minimumShareBalance = SHARE_PRICE * MINIMUM_SHARES_FOR_LOAN;

    if (shareBalance < minimumShareBalance) {
      return res.status(409).json({
        error: `Member must have at least ${MINIMUM_SHARES_FOR_LOAN} shares (${minimumShareBalance.toLocaleString()} ETB) before applying for a loan`,
      });
    }

    if (guarantor_member_id) {
      if (collateral_type !== 'guarantor') {
        return res.status(400).json({
          error: 'guarantor_member_id is only allowed when collateral_type is guarantor',
        });
      }

      const { rows: guarantorRows } = await pool.query(
        'SELECT id, status FROM members WHERE id = $1',
        [guarantor_member_id]
      );

      const guarantor = guarantorRows[0];

      if (!guarantor) {
        return res.status(400).json({
          error: 'guarantor_member_id does not reference an existing member',
        });
      }

      if (guarantor.status !== 'active') {
        return res.status(400).json({
          error: 'The guarantor must be an active member',
        });
      }

      const { rows: savingsRows } = await pool.query(
        `SELECT COALESCE(
          SUM(amount) FILTER (
            WHERE type IN ('savings_deposit', 'opening_savings_balance')
          ),
          0
        ) AS total
         FROM transactions
         WHERE member_id = $1`,
        [guarantor_member_id]
      );

      const guarantorSavings = Number(savingsRows[0].total);
      const requiredGuarantorSavings = principal * 3;

      if (guarantorSavings < requiredGuarantorSavings) {
        return res.status(409).json({
          error: `Guarantor must have savings of at least ${requiredGuarantorSavings.toLocaleString()} ETB for this loan`,
        });
      }

      const { rows: guaranteedLoans } = await pool.query(
        `SELECT id
         FROM loans
         WHERE guarantor_member_id = $1
           AND status IN ('active', 'awaiting_guarantor', 'awaiting_recommendation')`,
        [guarantor_member_id]
      );

      if (guaranteedLoans[0]) {
        return res.status(409).json({
          error: 'Guarantor already has an active or pending guaranteed loan',
        });
      }
    }

    const { rows: activeLoans } = await pool.query(
      `SELECT id
       FROM loans
       WHERE member_id = $1
         AND status IN ('active', 'awaiting_guarantor', 'awaiting_recommendation')`,
      [member_id]
    );

    if (activeLoans[0]) {
      return res.status(409).json({
        error: 'Member already has an active or pending loan',
      });
    }

    const months = term_years * 12;
    const interest_rate = INTEREST_RATE_BY_TERM[term_years];

    const monthly_installment =
      Math.round((principal / months) * 100) / 100;

    const monthly_interest_amount =
      Math.round((principal * interest_rate / 100 / months) * 100) / 100;

    const insurance_amount =
      Math.round(principal * 0.01 * 100) / 100;

    /*
     * Initial loan status:
     *
     * regular + guarantor -> awaiting_guarantor
     * regular + property  -> awaiting_recommendation
     * self_secured        -> awaiting_recommendation
     */
    let initialStatus = 'awaiting_recommendation';

    if (type === 'regular' && collateral_type === 'guarantor') {
      initialStatus = 'awaiting_guarantor';
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO loans
          (member_id, guarantor_member_id, type, principal_amount, term_years,
           interest_rate, monthly_installment, monthly_interest_amount,
           insurance_amount, collateral_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          collateral_type,
          initialStatus,
        ]
      );

      const loan = rows[0];

      // A guarantor-backed loan creates a request notification
      // specifically for the guarantor.
      if (
        type === 'regular' &&
        collateral_type === 'guarantor' &&
        guarantor_member_id
      ) {
        await client.query(
          `INSERT INTO notifications
            (id, member_id, loan_id, title, message, type, is_read)
           VALUES (
             gen_random_uuid(),
             $1,
             $2,
             $3,
             $4,
             'guarantor_request',
             false
           )`,
          [
            guarantor_member_id,
            loan.id,
            'Guarantor consent required',
            'A member has requested you to act as guarantor for a loan. Please review and respond.',
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
        error: 'decision must be either approve or decline',
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find the loan only if the authenticated member is its guarantor.
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

      // A response can only be made while the loan is awaiting consent.
      if (loan.status !== 'awaiting_guarantor') {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error: `This loan is no longer awaiting guarantor response. Current status: ${loan.status}`,
        });
      }

      const nextStatus =
        decision === 'approve'
          ? 'awaiting_recommendation'
          : 'guarantor_declined';

      const { rows: updatedRows } = await client.query(
        `UPDATE loans
         SET status = $1,
             guarantor_responded_at = now(),
             updated_at = now()
         WHERE id = $2
           AND status = 'awaiting_guarantor'
         RETURNING *`,
        [nextStatus, loanId]
      );

      // Protect against repeated/concurrent responses.
      if (!updatedRows[0]) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error: 'This guarantor response has already been recorded',
        });
      }

      const updatedLoan = updatedRows[0];

      const title =
        decision === 'approve'
          ? 'Guarantor approved loan'
          : 'Guarantor declined loan';

      const message =
        decision === 'approve'
          ? 'Your guarantor has approved your loan request. The loan can now proceed to recommendation.'
          : 'Your guarantor has declined your loan request. The loan cannot proceed with this guarantor.';

      // Notify only the borrower.
      await client.query(
        `INSERT INTO notifications
          (id, member_id, loan_id, title, message, type, is_read)
         VALUES (
           gen_random_uuid(),
           $1,
           $2,
           $3,
           $4,
           'loan_status',
           false
         )`,
        [
          loan.member_id,
          loan.id,
          title,
          message,
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