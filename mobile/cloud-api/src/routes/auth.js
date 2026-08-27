import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import pool from '../config/postgres.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireMemberAuth } from '../middleware/memberAuth.js';

const router = Router();
const SALT_ROUNDS = 10;

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { phone_number, password } = req.body;

    if (!phone_number || !password) {
      return res.status(400).json({ error: 'phone_number and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM members WHERE phone_number = $1',
      [phone_number]
    );
    const member = rows[0];

    const invalidCreds = () => res.status(401).json({ error: 'Invalid phone number or password' });

    if (!member) return invalidCreds();
    if (member.status !== 'active') return res.status(403).json({ error: 'Account is inactive' });
    if (!member.password_hash) {
      // Registered in person but hasn't had a password set yet.
      return res.status(403).json({ error: 'Account has no password set — visit the office to set one' });
    }

    const passwordMatches = await bcrypt.compare(password, member.password_hash);
    if (!passwordMatches) return invalidCreds();

    const token = jwt.sign(
      { id: member.id, phone_number: member.phone_number, role: 'member' },
      process.env.MEMBER_JWT_SECRET,
      { expiresIn: '30d' } 
    );

    res.json({
      token,
      member: { id: member.id, name: member.name, phone_number: member.phone_number },
    });
  })
);


router.patch(
  '/password',
  requireMemberAuth,
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

    const { rows } = await pool.query('SELECT * FROM members WHERE id = $1', [req.member.id]);
    const member = rows[0];
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const passwordMatches = await bcrypt.compare(current_password, member.password_hash);
    if (!passwordMatches) return res.status(401).json({ error: 'Current password is incorrect' });

    const passwordHash = await bcrypt.hash(new_password, SALT_ROUNDS);
    await pool.query(
      'UPDATE members SET password_hash = $1, updated_at = now() WHERE id = $2',
      [passwordHash, req.member.id]
    );

    res.json({ message: 'Password changed successfully' });
  })
);

export default router;