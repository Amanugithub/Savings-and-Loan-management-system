import { Router } from 'express';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();

// GET /api/members/me — the authenticated member's own profile.
// Deliberately excludes password_hash; every query below filters by
// req.member.id, never by a client-supplied id, so a member can only
// ever read their own row.
router.get(
  '/me',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, gender, address, age, heir_info, id_card_number,
              phone_number, date_joined, status, created_at
       FROM members WHERE id = $1`,
      [req.member.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Member not found' });
    res.json(rows[0]);
  })
);

// GET /api/members/me/summary — cumulative savings and shares balance,
// the two numbers the dashboard's home screen needs first.
router.get(
  '/me/summary',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type IN ('savings_deposit', 'opening_savings_balance')), 0) AS total_savings,
         COALESCE(SUM(amount) FILTER (WHERE type IN ('share_purchase', 'opening_share_balance')), 0) AS total_shares,
         dividend.latest_dividend,
         loan.status AS loan_status
       FROM transactions
       LEFT JOIN LATERAL (
         SELECT to_jsonb(d) AS latest_dividend
         FROM dividend_history d
         WHERE d.member_id = $1
         ORDER BY d.fiscal_year DESC, d.date_calculated DESC
         LIMIT 1
       ) dividend ON true
       LEFT JOIN LATERAL (
         SELECT l.status
         FROM loans l
         WHERE l.member_id = $1
         ORDER BY l.created_at DESC
         LIMIT 1
       ) loan ON true
       WHERE transactions.member_id = $1
       GROUP BY dividend.latest_dividend, loan.status`,
      [req.member.id]
    );
    res.json(rows[0]);
  })
);

export default router;
