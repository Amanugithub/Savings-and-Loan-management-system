import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../config/sqlite.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

// Transaction types allowed by the database CHECK constraint.
const ALLOWED_TRANSACTION_TYPES = [
  "savings_deposit",
  "share_purchase",
  "penalty_payment",
  "registration_fee",
  "card_fee",
  "loan_disbursement",
  "loan_installment",
  "loan_interest",
  "loan_insurance",
];

function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function parseIntegerParam(value, name, { min = 0, max } = {}) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { error: `${name} must be an integer` };
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    const range = max === undefined ? `at least ${min}` : `between ${min} and ${max}`;
    return { error: `${name} must be ${range}` };
  }

  return { value: parsed };
}

// POST /api/transactions — create a new transaction
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { member_id, loan_id, type, amount, date, notes } = req.body;

    if (!member_id || !type || amount === undefined) {
      return res.status(400).json({
        error: "member_id, type, and amount are required",
      });
    }

    if (!ALLOWED_TRANSACTION_TYPES.includes(type)) {
      return res.status(400).json({
        error: "Invalid transaction type",
      });
    }

    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        error: "Amount must be a positive number",
      });
    }

    const member = db
      .prepare("SELECT id FROM members WHERE id = ?")
      .get(member_id);

    if (!member) {
      return res.status(404).json({
        error: "Member not found",
      });
    }

    if (loan_id) {
      const loan = db
        .prepare("SELECT id FROM loans WHERE id = ? AND member_id = ?")
        .get(loan_id, member_id);

      if (!loan) {
        return res.status(404).json({
          error: "Loan not found for this member",
        });
      }
    }

    const id = randomUUID();

    const transactionDate = (date && date.trim())
      ? date.trim()
      : new Date().toISOString().slice(0, 10);

    if (!isValidISODate(transactionDate)) {
      return res.status(400).json({
        error: "Date must be a valid date in YYYY-MM-DD format",
      });
    }

    const recordedBy = req.admin.id;

    db.prepare(
      `
  INSERT INTO transactions (
    id,
    member_id,
    loan_id,
    recorded_by,
    type,
    amount,
    date,
    notes,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `,
    ).run(
      id,
      member_id,
      loan_id ?? null,
      recordedBy,
      type,
      parsedAmount,
      transactionDate,
      notes ?? null,
    );

    const transaction = db
      .prepare("SELECT * FROM transactions WHERE id = ?")
      .get(id);

    return res.status(201).json(transaction);
  }),
);

// GET /api/transactions — list, optionally filtered by member or loan

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { member_id, loan_id, limit: requestedLimit, offset: requestedOffset } = req.query;

    // Validate that query parameters are scalar (not arrays)
    if (Array.isArray(member_id)) {
      return res.status(400).json({
        error: 'member_id must be a single value, not an array',
      });
    }
    if (Array.isArray(loan_id)) {
      return res.status(400).json({
        error: 'loan_id must be a single value, not an array',
      });
    }

    const limitResult = requestedLimit === undefined
      ? { value: 50 }
      : parseIntegerParam(requestedLimit, "limit", { min: 1, max: 100 });
    const offsetResult = requestedOffset === undefined
      ? { value: 0 }
      : parseIntegerParam(requestedOffset, "offset");

    if (limitResult.error || offsetResult.error) {
      return res.status(400).json({
        error: limitResult.error || offsetResult.error,
      });
    }

    const limit = limitResult.value;
    const offset = offsetResult.value;

    let query = 'SELECT * FROM transactions';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }
    if (loan_id) {
      conditions.push('loan_id = ?');
      params.push(loan_id);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit + 1, offset);

    const fetchedTransactions = db.prepare(query).all(...params);
    const hasMore = fetchedTransactions.length > limit;
    const transactions = fetchedTransactions.slice(0, limit);
    res.json({
      data: transactions,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
      },
    });
  })
);

// GET /api/transactions/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  })
);

// GET /api/transactions/summary/:memberId/:fiscalYear/:fiscalMonth
// Thin wrapper over the monthly_summary view already defined in your schema.
router.get(
  '/summary/:memberId/:fiscalYear/:fiscalMonth',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { memberId, fiscalYear, fiscalMonth } = req.params;

    const fiscalYearResult = parseIntegerParam(fiscalYear, "fiscalYear", { min: 1 });
    const fiscalMonthResult = parseIntegerParam(fiscalMonth, "fiscalMonth", { min: 1, max: 12 });

    if (fiscalYearResult.error || fiscalMonthResult.error) {
      return res.status(400).json({
        error: fiscalYearResult.error || fiscalMonthResult.error,
      });
    }

    const summary = db
      .prepare(
        'SELECT * FROM monthly_summary WHERE member_id = ? AND fiscal_year = ? AND fiscal_month = ?'
      )
      .get(memberId, fiscalYearResult.value, fiscalMonthResult.value);
    res.json(summary || {
      member_id: memberId,
      fiscal_year: fiscalYearResult.value,
      fiscal_month: fiscalMonthResult.value,
      total_savings: 0,
      total_shares: 0,
      total_installments: 0,
      total_interest: 0,
      total_penalties: 0,
      total_collected: 0,
    });
  })
);
export default router;
