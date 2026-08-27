import { Router } from 'express';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();

const VALID_TYPES = [
  'savings_deposit', 'share_purchase', 'penalty_payment',
  'registration_fee', 'card_fee', 'loan_disbursement',
  'loan_installment', 'loan_interest', 'loan_insurance',
  'member_exit_payout', 'bank_interest_income',
];

// GET /api/transactions/me — the authenticated member's own
// transaction history. Supports ?type= filtering and simple
// limit/offset pagination since this list can get long over years
// of membership.
router.get(
  '/me',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { type, limit = '50', offset = '0' } = req.query;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const conditions = ['member_id = $1'];
    const params = [req.member.id];
    if (type) {
      conditions.push(`type = $${params.length + 1}`);
      params.push(type);
    }

    params.push(parsedLimit, parsedOffset);

    const { rows } = await pool.query(
      `SELECT * FROM transactions
       WHERE ${conditions.join(' AND ')}
       ORDER BY date DESC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  })
);

export default router;