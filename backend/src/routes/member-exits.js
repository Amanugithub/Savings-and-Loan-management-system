import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

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

    const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(member_id);
    if (!member) return res.status(400).json({ error: 'member_id does not reference an existing member' });
    if (member.status === 'exited') {
      return res.status(409).json({ error: 'This member has already exited' });
    }

    const alreadyExited = db.prepare('SELECT id FROM member_exits WHERE member_id = ?').get(member_id);
    if (alreadyExited) {
      return res.status(409).json({ error: 'An exit record already exists for this member' });
    }

    // Block on an active loan as BORROWER — the debt must be settled
    // before the co-op pays out their savings/shares/dividends.
    const activeLoanAsBorrower = db
      .prepare("SELECT id FROM loans WHERE member_id = ? AND status = 'active'")
      .get(member_id);
    if (activeLoanAsBorrower) {
      return res.status(409).json({ error: 'Member has an active loan and cannot exit until it is closed' });
    }

    // Block on being an active GUARANTOR elsewhere — their exit would
    // leave that other loan without valid collateral.
    const activeAsGuarantor = db
      .prepare("SELECT id FROM loans WHERE guarantor_member_id = ? AND status = 'active'")
      .get(member_id);
    if (activeAsGuarantor) {
      return res.status(409).json({
        error: 'Member is the guarantor on another active loan and cannot exit until that loan is closed',
      });
    }

    const savingsReturned = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'savings_deposit' AND member_id = ?")
      .get(member_id).total;
    const sharesReturned = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'share_purchase' AND member_id = ?")
      .get(member_id).total;

    // Dividends accumulate in dividend_history across every fiscal year
    // rather than being paid out annually (there's no dividend-payout
    // transaction type) — so this sums the member's ENTIRE dividend
    // history, not just the most recent year.
    const dividendOwed = db
      .prepare(
        `SELECT COALESCE(SUM(savings_dividend + share_dividend), 0) AS total
         FROM dividend_history WHERE member_id = ?`
      )
      .get(member_id).total;

    const round2 = (n) => Math.round(n * 100) / 100;
    const governmentWithholding = round2(dividendOwed * 0.10);
    const netAmountPaid = round2(savingsReturned + sharesReturned + dividendOwed - governmentWithholding);

    const id = randomUUID();
    const exitDate = exit_date ?? new Date().toISOString().slice(0, 10);

    const processExit = db.transaction(() => {
      db.prepare(
        `INSERT INTO member_exits
          (id, member_id, exit_date, savings_returned, shares_returned, dividend_owed, government_withholding, net_amount_paid, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      ).run(id, member_id, exitDate, savingsReturned, sharesReturned, dividendOwed, governmentWithholding, netAmountPaid);

      db.prepare("UPDATE members SET status = 'exited', updated_at = datetime('now'), synced_at = NULL WHERE id = ?").run(member_id);
    });
    processExit();

    const record = db.prepare('SELECT * FROM member_exits WHERE id = ?').get(id);
    res.status(201).json(record);
  })
);

export default router;