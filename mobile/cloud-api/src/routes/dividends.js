import { Router } from 'express';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();


router.get(
  '/me',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM dividend_history WHERE member_id = $1 ORDER BY fiscal_year DESC',
      [req.member.id]
    );
    res.json(rows);
  })
);

export default router;