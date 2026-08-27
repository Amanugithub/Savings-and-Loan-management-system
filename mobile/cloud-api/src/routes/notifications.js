import { Router } from 'express';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();

// GET /api/notifications/me — the authenticated member's own
// notifications, newest first. ?unread=true filters to unread only.
router.get(
  '/me',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const conditions = ['member_id = $1'];
    const params = [req.member.id];
    if (req.query.unread === 'true') {
      conditions.push('is_read = false');
    }

    const { rows } = await pool.query(
      `SELECT * FROM notifications WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );
    res.json(rows);
  })
);

// PATCH /api/notifications/:id/read — mark one of the member's own
// notifications as read. Scoped by member_id in the WHERE clause so
// a member can't mark (or even confirm the existence of) someone
// else's notification.
router.patch(
  '/:id/read',
  requireMemberAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE notifications
       SET is_read = true, updated_at = now()
       WHERE id = $1 AND member_id = $2
       RETURNING *`,
      [req.params.id, req.member.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
    res.json(rows[0]);
  })
);

export default router;