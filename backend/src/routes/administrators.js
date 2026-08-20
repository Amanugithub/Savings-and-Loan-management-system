import { Router } from 'express';
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 10;

// All routes below require a valid admin token — you can't manage
// admin accounts unless you're already logged in as one.
router.use(requireAuth);

// GET /api/administrators — list all admins (never returns password_hash)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const admins = db
      .prepare('SELECT id, name, username, status, created_at FROM administrators ORDER BY created_at DESC')
      .all();
    res.json(admins);
  })
);

// POST /api/administrators — create a new admin account
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'name, username, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const id = randomUUID();

    db.prepare(
      `INSERT INTO administrators (id, name, username, password_hash, synced_at)
       VALUES (?, ?, ?, ?, NULL)`
    ).run(id, name, username, password_hash);

    const admin = db
      .prepare('SELECT id, name, username, status, created_at FROM administrators WHERE id = ?')
      .get(id);
    res.status(201).json(admin);
  })
);

// PATCH /api/administrators/:id — e.g. deactivate an admin (status -> 'inactive')
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM administrators WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Administrator not found' });

    const { name, status } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ error: "status must be 'active' or 'inactive'" });
      }
      updates.push('status = ?');
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    updates.push('synced_at = NULL');
    values.push(req.params.id);

    db.prepare(`UPDATE administrators SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db
      .prepare('SELECT id, name, username, status, created_at FROM administrators WHERE id = ?')
      .get(req.params.id);
    res.json(updated);
  })
);

export default router;
