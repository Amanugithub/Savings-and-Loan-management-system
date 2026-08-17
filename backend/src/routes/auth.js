import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

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

export default router;
