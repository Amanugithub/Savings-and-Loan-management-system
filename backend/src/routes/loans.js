import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const VALID_TERMS = [1, 2, 3, 4, 5];
const VALID_LOAN_TYPES = ['regular', 'self_secured'];
const VALID_COLLATERAL_TYPES = ['guarantor', 'property'];
const VALID_STATUSES = ['pending', 'active', 'closed', 'rejected'];
const INTEREST_RATE_BY_TERM = {
  1: 8,
  2: 8,
  3: 10,
  4: 11,
  5: 13,
};

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

// GET /api/loans — list, optionally filtered by member or status
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { member_id, status } = req.query;
    let query = 'SELECT * FROM loans';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        });
      }
      conditions.push('status = ?');
      params.push(status);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';

    res.json(db.prepare(query).all(...params));
  })
);

// GET /api/loans/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });
    res.json(loan);
  })
);

// POST /api/loans — apply for a loan. Status starts as 'pending'.
// monthly_installment, interest_rate, monthly_interest_amount, and
// insurance_amount are calculated here (not trusted from the client) using
// the approved term-based rate and formulas
// documented in the schema:
//   monthly_installment     = principal / (term_years * 12)
//   interest_rate            = approved rate for the selected term
//   monthly_interest_amount = (principal * interest_rate%) / (term_years * 12)
//   insurance_amount        = 1% of principal, paid upfront
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      member_id,
      guarantor_member_id,
      type,
      principal_amount,
      term_years,
      collateral_type,
    } = req.body;

    if (!member_id || !type || principal_amount === undefined || !term_years || !collateral_type) {
      return res.status(400).json({
        error: 'member_id, type, principal_amount, term_years, and collateral_type are required',
      });
    }
    if (!VALID_LOAN_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_LOAN_TYPES.join(', ')}` });
    }
    if (typeof principal_amount !== 'number' || !Number.isFinite(principal_amount) || principal_amount <= 0) {
      return res.status(400).json({ error: 'principal_amount must be a positive number' });
    }
    if (!VALID_TERMS.includes(term_years)) {
      return res.status(400).json({ error: `term_years must be one of: ${VALID_TERMS.join(', ')}` });
    }
    if (!VALID_COLLATERAL_TYPES.includes(collateral_type)) {
      return res.status(400).json({ error: `collateral_type must be one of: ${VALID_COLLATERAL_TYPES.join(', ')}` });
    }
    if (collateral_type === 'guarantor' && !guarantor_member_id) {
      return res.status(400).json({ error: 'guarantor_member_id is required when collateral_type is guarantor' });
    }
    if (guarantor_member_id === member_id) {
      return res.status(400).json({ error: 'guarantor_member_id cannot be the same as member_id' });
    }

    const member = db.prepare('SELECT id, status FROM members WHERE id = ?').get(member_id);
    if (!member) return res.status(400).json({ error: 'member_id does not reference an existing member' });
    if (member.status !== 'active') {
      return res.status(400).json({ error: 'Loans can only be created for active members' });
    }

    if (guarantor_member_id) {
      if (collateral_type !== 'guarantor') {
        return res.status(400).json({
          error: 'guarantor_member_id is only allowed when collateral_type is guarantor',
        });
      }

      const guarantor = db
        .prepare('SELECT id, status FROM members WHERE id = ?')
        .get(guarantor_member_id);
      if (!guarantor) return res.status(400).json({ error: 'guarantor_member_id does not reference an existing member' });
      if (guarantor.status !== 'active') {
        return res.status(400).json({ error: 'The guarantor must be an active member' });
      }
    }

    const activeLoan = db
      .prepare("SELECT id FROM loans WHERE member_id = ? AND status = 'active'")
      .get(member_id);
    if (activeLoan) {
      return res.status(409).json({ error: 'Member already has an active loan' });
    }

    const months = term_years * 12;
    const interest_rate = INTEREST_RATE_BY_TERM[term_years];
    const monthly_installment = principal_amount / months;
    const monthly_interest_amount = (principal_amount * interest_rate) / 100 / months;
    const insurance_amount = principal_amount * 0.01;

    const id = randomUUID();

    // The DB's unique partial index (one active loan per guarantor)
    // still guards this at the data level — this insert is 'pending',
    // so it won't collide until the loan is approved to 'active'.
    db.prepare(
      `INSERT INTO loans
        (id, member_id, guarantor_member_id, type, principal_amount, term_years,
         interest_rate, monthly_installment, monthly_interest_amount, insurance_amount,
         collateral_type, status, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL)`
    ).run(
      id,
      member_id,
      guarantor_member_id ?? null,
      type,
      principal_amount,
      term_years,
      interest_rate,
      monthly_installment,
      monthly_interest_amount,
      insurance_amount,
      collateral_type
    );

    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
    res.status(201).json(loan);
  })
);

// PATCH /api/loans/:id/status — the only way to move a loan through
// pending -> active/rejected -> closed. Keeps the state machine in
// one place instead of letting a generic PATCH set status to anything.
const ALLOWED_TRANSITIONS = {
  pending: ['active', 'rejected'],
  active: ['closed'],
};

router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, disbursement_date } = req.body;
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
    if (!loan) return res.status(404).json({ error: 'Loan not found' });

    const allowedNext = ALLOWED_TRANSITIONS[loan.status] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `Cannot move loan from '${loan.status}' to '${status}'. Allowed: ${allowedNext.join(', ') || 'none'}`,
      });
    }

    if (status === 'active') {
      const activeLoan = db
        .prepare("SELECT id FROM loans WHERE member_id = ? AND status = 'active' AND id <> ?")
        .get(loan.member_id, req.params.id);
      if (activeLoan) {
        return res.status(409).json({ error: 'Member already has an active loan' });
      }

      // Approving a loan disburses it. If no date is supplied, use today's date.
      // The DB's unique partial index will reject this if the guarantor
      // already backs another active loan; that surfaces as a 409.
      const disbursementDate = disbursement_date ?? new Date().toISOString().slice(0, 10);
      if (!isValidISODate(disbursementDate)) {
        return res.status(400).json({
          error: 'disbursement_date must be a valid date in YYYY-MM-DD format',
        });
      }

      db.prepare(
        "UPDATE loans SET status = 'active', disbursement_date = ?, synced_at = NULL WHERE id = ?"
      ).run(disbursementDate, req.params.id);
    } else {
      db.prepare('UPDATE loans SET status = ?, synced_at = NULL WHERE id = ?').run(status, req.params.id);
    }

    const updated = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
    res.json(updated);
  })
);

export default router;
