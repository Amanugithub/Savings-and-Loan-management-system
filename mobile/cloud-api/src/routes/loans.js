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

// GET /api/loans/:id — a single loan, but ONLY if it belongs to the
// authenticated member (or they're the guarantor on it)
router.get(
  '/:id',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM loans WHERE id = $1 AND (member_id = $2 OR guarantor_member_id = $2)',
      [req.params.id, req.member.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Loan not found' });
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
      return res.status(400).json({ error: `type must be one of: ${VALID_LOAN_TYPES.join(', ')}` });
    }
    const principalResult = parseMoney(principal_amount, 'principal_amount');
    if (principalResult.error) {
      return res.status(400).json({ error: principalResult.error });
    }
    const principal = principalResult.value;
    if (!VALID_TERMS.includes(term_years)) {
      return res.status(400).json({ error: `term_years must be one of: ${VALID_TERMS.join(', ')}` });
    }
    if (!VALID_COLLATERAL_TYPES.includes(collateral_type)) {
      return res.status(400).json({ error: `collateral_type must be one of: ${VALID_COLLATERAL_TYPES.join(', ')}` });
    }
    if (collateral_type === 'guarantor' && !guarantor_member_id) {
      return res.status(400).json({ error: 'guarantor_member_id is required when collateral_type is guarantor' });
    }
    if (guarantor_member_id === member_id) {
      return res.status(400).json({ error: 'guarantor_member_id cannot be the same as member_id' });
    }

    const { rows: memberRows } = await pool.query(
      'SELECT id, status FROM members WHERE id = $1',
      [member_id]
    );
    const member = memberRows[0];
    if (!member || member.status !== 'active') {
      return res.status(400).json({ error: 'Loans can only be created for active members' });
    }

    const { rows: shareRows } = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type IN ('share_purchase', 'opening_share_balance')), 0) AS total
       FROM transactions WHERE member_id = $1`,
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
        return res.status(400).json({ error: 'guarantor_member_id does not reference an existing member' });
      }
      if (guarantor.status !== 'active') {
        return res.status(400).json({ error: 'The guarantor must be an active member' });
      }

      const { rows: savingsRows } = await pool.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE type IN ('savings_deposit', 'opening_savings_balance')), 0) AS total
         FROM transactions WHERE member_id = $1`,
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
        "SELECT id FROM loans WHERE guarantor_member_id = $1 AND status = 'active'",
        [guarantor_member_id]
      );
      if (guaranteedLoans[0]) {
        return res.status(409).json({ error: 'Guarantor already has an active guaranteed loan' });
      }
    }

    const { rows: activeLoans } = await pool.query(
      "SELECT id FROM loans WHERE member_id = $1 AND status = 'active'",
      [member_id]
    );
    if (activeLoans[0]) {
      return res.status(409).json({ error: 'Member already has an active loan' });
    }

    const months = term_years * 12;
    const interest_rate = INTEREST_RATE_BY_TERM[term_years];
    const monthly_installment = Math.round((principal / months) * 100) / 100;
    const monthly_interest_amount = Math.round((principal * interest_rate / 100 / months) * 100) / 100;
    const insurance_amount = Math.round(principal * 0.01 * 100) / 100;

    const { rows } = await pool.query(
      `INSERT INTO loans
        (member_id, guarantor_member_id, type, principal_amount, term_years,
         interest_rate, monthly_installment, monthly_interest_amount, insurance_amount,
         collateral_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
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
      ]
    );

    res.status(201).json(rows[0]);
  })
);

export default router;
