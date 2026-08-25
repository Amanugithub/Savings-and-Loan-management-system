import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 10;

// POST /api/auth/login — the only public admin-related route.
// Everything else under /api/administrators requires the token this returns.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const admin = db.prepare('SELECT * FROM administrators WHERE username = ?').get(username);

    // Same error for "no such user" and "wrong password" — don't reveal
    // which one it was, that tells an attacker whether a username exists.
    const invalidCreds = () => res.status(401).json({ error: 'Invalid username or password' });

    if (!admin) return invalidCreds();
    if (admin.status !== 'active') return res.status(403).json({ error: 'Account is inactive' });

    const passwordMatches = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatches) return invalidCreds();

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      admin: { id: admin.id, name: admin.name, username: admin.username },
    });
  })
);

// PATCH /api/auth/password — change the currently authenticated admin's password.
router.patch(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body ?? {};

    if (typeof current_password !== 'string' || typeof new_password !== 'string') {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'new_password must be at least 8 characters' });
    }
    if (current_password === new_password) {
      return res.status(400).json({ error: 'new_password must be different from current_password' });
    }

    const admin = db.prepare('SELECT * FROM administrators WHERE id = ?').get(req.admin.id);
    if (!admin) return res.status(404).json({ error: 'Administrator not found' });

    const passwordMatches = await bcrypt.compare(current_password, admin.password_hash);
    if (!passwordMatches) return res.status(401).json({ error: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    db.prepare(
      `UPDATE administrators
       SET password_hash = ?, updated_at = datetime('now'), synced_at = NULL
       WHERE id = ?`
    ).run(passwordHash, req.admin.id);

    res.json({ message: 'Password changed successfully' });
  })
);

export default router;
