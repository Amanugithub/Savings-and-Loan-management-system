import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const VALID_TYPES = ['payment_due', 'meeting', 'news', 'loan_status'];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_TITLE_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 500;

router.use(requireAuth);

// GET /api/notifications — list, filtered by member_id / type / is_read
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { member_id, type, is_read } = req.query;
    const parsedLimit = Number(req.query.limit ?? DEFAULT_PAGE_SIZE);
    const parsedOffset = Number(req.query.offset ?? 0);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PAGE_SIZE) {
      return res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_PAGE_SIZE}` });
    }
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

    let query = 'SELECT * FROM notifications';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }
    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      conditions.push('type = ?');
      params.push(type);
    }
    if (is_read !== undefined) {
      if (!['0', '1'].includes(is_read)) {
        return res.status(400).json({ error: 'is_read must be 0 or 1' });
      }
      conditions.push('is_read = ?');
      params.push(Number(is_read));
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(parsedLimit, parsedOffset);

    res.json({
      data: db.prepare(query).all(...params),
      pagination: {
        limit: parsedLimit,
        offset: parsedOffset,
      },
    });
  })
);

// GET /api/notifications/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  })
);

function validateNotificationBody(body = {}) {
  const { title, message, type, loan_id } = body;

  if (typeof title !== 'string' || typeof message !== 'string' || typeof type !== 'string') {
    return 'title, message, and type are required';
  }
  if (!title.trim() || !message.trim()) {
    return 'title and message cannot be empty';
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `title must be at most ${MAX_TITLE_LENGTH} characters`;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `message must be at most ${MAX_MESSAGE_LENGTH} characters`;
  }
  if (!VALID_TYPES.includes(type)) {
    return `type must be one of: ${VALID_TYPES.join(', ')}`;
  }
  if (loan_id) {
    const loan = db.prepare('SELECT id FROM loans WHERE id = ?').get(loan_id);
    if (!loan) return 'loan_id does not reference an existing loan';
  }
  return null;
}

// POST /api/notifications — single recipient
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { member_id, loan_id, title, message, type } = req.body ?? {};

    if (!member_id) {
      return res.status(400).json({ error: 'member_id is required' });
    }
    const validationError = validateNotificationBody(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const member = db.prepare('SELECT id FROM members WHERE id = ?').get(member_id);
    if (!member) return res.status(400).json({ error: 'member_id does not reference an existing member' });

    if (loan_id) {
      const memberLoan = db
        .prepare('SELECT id FROM loans WHERE id = ? AND member_id = ?')
        .get(loan_id, member_id);
      if (!memberLoan) {
        return res.status(400).json({ error: 'loan_id does not belong to member_id' });
      }
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO notifications
        (id, member_id, loan_id, title, message, type, is_read, synced_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'))`
    ).run(id, member_id, loan_id ?? null, title, message, type);

    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    res.status(201).json(notification);
  })
);

// POST /api/notifications/broadcast — one row per ACTIVE member, per the
// schema's design (e.g. a meeting notice to 400 members becomes 400
// rows). Exited members are deliberately excluded — no reason to notify
// someone who's already left the cooperative.
router.post(
  '/broadcast',
  asyncHandler(async (req, res) => {
    const validationError = validateNotificationBody(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { loan_id, title, message, type } = req.body ?? {};
    if (loan_id) {
      return res.status(400).json({ error: 'loan_id cannot be used with broadcast notifications' });
    }
    const activeMembers = db.prepare("SELECT id FROM members WHERE status = 'active'").all();

    const insert = db.prepare(
      `INSERT INTO notifications
        (id, member_id, loan_id, title, message, type, is_read, synced_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, datetime('now'))`
    );

    const insertAll = db.transaction((members) => {
      for (const { id: memberId } of members) {
        insert.run(randomUUID(), memberId, loan_id ?? null, title, message, type);
      }
    });
    insertAll(activeMembers);

    res.status(201).json({ recipients: activeMembers.length, title, message, type });
  })
);

// PATCH /api/notifications/:id/read — mark as read
router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Notification not found' });

    db.prepare(
      `UPDATE notifications
       SET is_read = 1, updated_at = datetime('now'), synced_at = NULL
       WHERE id = ?`
    ).run(req.params.id);

    const updated = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
    res.json(updated);
  })
);

export default router;
