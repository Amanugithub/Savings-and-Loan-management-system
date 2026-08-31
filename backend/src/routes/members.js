import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 10;
const MEMBER_COLUMNS = `id, name, gender, address, age, heir_info, id_card_number,
  phone_number, date_joined, status, created_at, updated_at`;
router.use(requireAuth);

// GET /api/members — list all members in stable ID-card order.
// ID-card numbers are stored as text, so cast numeric values to keep 2 before 10.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const members = db
      .prepare(`SELECT ${MEMBER_COLUMNS} FROM members
        ORDER BY
          CASE WHEN id_card_number IS NULL OR TRIM(id_card_number) = '' THEN 1 ELSE 0 END,
          CAST(id_card_number AS INTEGER),
          id_card_number COLLATE NOCASE,
          name COLLATE NOCASE,
          id`)
      .all();
    res.json(members);
  })
);

// GET /api/members/:id — single member
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const member = db.prepare(`
      SELECT ${MEMBER_COLUMNS},
        ROUND(COALESCE((SELECT SUM(amount) FROM transactions
          WHERE member_id = members.id
            AND type IN ('savings_deposit', 'opening_savings_balance')), 0), 2) AS total_savings,
        ROUND(COALESCE((SELECT SUM(amount) FROM transactions
          WHERE member_id = members.id
            AND type IN ('share_purchase', 'opening_share_balance')), 0), 2) AS total_shares
      FROM members
      WHERE id = ?
    `).get(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });
    res.json(member);
  })
);

// POST /api/members — register a new member
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      name,
      gender,
      address,
      age,
      heir_info,
      id_card_number,
      phone_number,
      date_joined,
    } = req.body;

    if (!name || !gender || !phone_number) {
      return res.status(400).json({ error: 'name, gender, and phone_number are required' });
    }

    const id = randomUUID();

    db.prepare(
      `INSERT INTO members
        (id, name, gender, address, age, heir_info, id_card_number, phone_number, date_joined, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), NULL)`
    ).run(id, name, gender, address ?? null, age ?? null, heir_info ?? null, id_card_number ?? null, phone_number, date_joined ?? null);

    const member = db.prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ?`).get(id);
    res.status(201).json(member);
  })
);

// PATCH /api/members/:id/password — admin reset/set a member password.
// The plaintext password is never stored or returned.
router.patch(
  '/:id/password',
  asyncHandler(async (req, res) => {
    const { new_password } = req.body ?? {};

    if (typeof new_password !== 'string' || new_password.length < 8) {
      return res.status(400).json({ error: 'new_password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM members WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    const passwordHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    db.prepare(
      `UPDATE members
       SET password_hash = ?, updated_at = datetime('now'), synced_at = NULL
       WHERE id = ?`
    ).run(passwordHash, req.params.id);

    const updated = db.prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ?`).get(req.params.id);
    res.json({ message: 'Member password updated successfully', member: updated });
  })
);

// PATCH /api/members/:id — edit member details (password has a dedicated endpoint)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT id FROM members WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Member not found' });

    const fields = ['name', 'gender', 'address', 'age', 'heir_info', 'id_card_number', 'phone_number', 'status'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    updates.push('synced_at = NULL'); // any edit re-queues the row for sync

    values.push(req.params.id);

    db.prepare(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare(`SELECT ${MEMBER_COLUMNS} FROM members WHERE id = ?`).get(req.params.id);
    res.json(updated);
  })
);

export default router;
