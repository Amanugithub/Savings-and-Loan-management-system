import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

router.use(requireAuth);

function round2(value) {
  return Math.round(value * 100) / 100;
}

function calculateExit(memberId, exitDate) {
  const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(memberId);
  if (!member) return { error: { status: 400, message: 'member_id does not reference an existing member' } };
  if (member.status === 'exited') return { error: { status: 409, message: 'This member has already exited' } };

  const alreadyExited = db.prepare('SELECT id FROM member_exits WHERE member_id = ?').get(memberId);
  if (alreadyExited) return { error: { status: 409, message: 'An exit record already exists for this member' } };

  const activeLoanAsBorrower = db
    .prepare("SELECT id FROM loans WHERE member_id = ? AND status = 'active'")
    .get(memberId);
  if (activeLoanAsBorrower) {
    return { error: { status: 409, message: 'Member has an active loan and cannot exit until it is closed' } };
  }

  const activeAsGuarantor = db
    .prepare("SELECT id FROM loans WHERE guarantor_member_id = ? AND status = 'active'")
    .get(memberId);
  if (activeAsGuarantor) {
    return { error: { status: 409, message: 'Member is the guarantor on another active loan and cannot exit until that loan is closed' } };
  }

  const savingsReturned = db
    .prepare("SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total FROM transactions WHERE type IN ('savings_deposit', 'opening_savings_balance') AND member_id = ? AND date <= ?")
    .get(memberId, exitDate).total;
  const sharesReturned = db
    .prepare("SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total FROM transactions WHERE type IN ('share_purchase', 'opening_share_balance') AND member_id = ? AND date <= ?")
    .get(memberId, exitDate).total;
  const dividendOwed = db
    .prepare(
      `SELECT ROUND(COALESCE(SUM(savings_dividend + share_dividend), 0), 2) AS total
       FROM dividend_history WHERE member_id = ? AND date_calculated <= ?`
    )
    .get(memberId, exitDate).total;

  const governmentWithholding = round2(dividendOwed * 0.10);
  const netAmountPaid = round2(savingsReturned + sharesReturned + dividendOwed - governmentWithholding);

  return {
    member_id: memberId,
    exit_date: exitDate,
    savings_returned: round2(savingsReturned),
    shares_returned: round2(sharesReturned),
    dividend_owed: round2(dividendOwed),
    government_withholding: governmentWithholding,
    net_amount_paid: netAmountPaid,
  };
}

// GET /api/member-exits — list, optionally filtered by member
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { member_id } = req.query;
    let query = 'SELECT * FROM member_exits';
    const params = [];
    if (member_id) {
      query += ' WHERE member_id = ?';
      params.push(member_id);
    }
    query += ' ORDER BY exit_date DESC';
    res.json(db.prepare(query).all(...params));
  })
);

// GET /api/member-exits/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const record = db.prepare('SELECT * FROM member_exits WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Exit record not found' });
    res.json(record);
  })
);

// GET /api/member-exits/preview/:memberId — calculate the payout without writing anything.
router.get(
  '/preview/:memberId',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const exitDate = req.query.exit_date === undefined ? today : req.query.exit_date;

    if (Array.isArray(exitDate) || !isValidISODate(exitDate) || exitDate > today) {
      return res.status(400).json({ error: 'exit_date must be a valid date no later than today' });
    }

    const result = calculateExit(req.params.memberId, exitDate);
    if (result.error) return res.status(result.error.status).json({ error: result.error.message });
    res.json(result);
  })
);

// POST /api/member-exits — process a resignation payout. All monetary
// fields are calculated server-side, never trusted from the client —
// this determines a real cash payout, so the client only supplies
// member_id and optionally exit_date.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { member_id, exit_date } = req.body;

    if (!member_id) {
      return res.status(400).json({ error: 'member_id is required' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const exitDate = exit_date === undefined ? today : exit_date;
    if (!isValidISODate(exitDate) || exitDate > today) {
      return res.status(400).json({ error: 'exit_date must be a valid date no later than today' });
    }

    const processExit = db.transaction(() => {
      const calculation = calculateExit(member_id, exitDate);
      if (calculation.error) return calculation;
      const id = randomUUID();

      db.prepare(
        `INSERT INTO member_exits
          (id, member_id, exit_date, savings_returned, shares_returned, dividend_owed, government_withholding, net_amount_paid, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(
        id,
        member_id,
        exitDate,
        calculation.savings_returned,
        calculation.shares_returned,
        calculation.dividend_owed,
        calculation.government_withholding,
        calculation.net_amount_paid,
      );

      db.prepare(
        `INSERT INTO transactions
          (id, member_id, recorded_by, type, amount, date, notes, synced_at)
         VALUES (?, ?, ?, 'member_exit_payout', ?, ?, ?, NULL)`
      ).run(
        randomUUID(), member_id, req.admin.id, calculation.net_amount_paid, exitDate,
        `Member exit ${id}; savings=${calculation.savings_returned}; shares=${calculation.shares_returned}; dividends=${calculation.dividend_owed}; withholding=${calculation.government_withholding}`
      );

      db.prepare("UPDATE members SET status = 'exited', updated_at = datetime('now'), synced_at = NULL WHERE id = ?").run(member_id);
      return { id };
    });
    const result = processExit();
    if (result.error) return res.status(result.error.status).json({ error: result.error.message });

    const record = db.prepare('SELECT * FROM member_exits WHERE id = ?').get(result.id);
    res.status(201).json(record);
  })
);

export default router;
