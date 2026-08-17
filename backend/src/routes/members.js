import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/members — list all members
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const members = db
      .prepare('SELECT * FROM members ORDER BY created_at DESC')
      .all();
    res.json(members);
  })
);

// GET /api/members/:id — single member
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
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

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    res.status(201).json(member);
  })
);

// PATCH /api/members/:id — edit member details (not password — that's a separate auth flow)
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
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

    const updated = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    res.json(updated);
  })
);

export default router;
