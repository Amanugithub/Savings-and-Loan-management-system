import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../config/sqlite.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const SAVINGS_SHARE = 0.65;
const SHARE_SHARE = 0.20;
// Reserve is the remaining 0.15 — computed for reporting, never distributed.

const REVENUE_TYPES = [
  'loan_interest',
  'loan_insurance',
  'penalty_payment',
  'registration_fee',
  'card_fee',
  'bank_interest_income',
];

function parseFiscalYear(value) {
  if (typeof value !== 'string' || !/^\d{1,4}$/.test(value)) {
    return { error: 'fiscal_year must be an integer between 1 and 9999' };
  }

  const fiscalYear = Number(value);
  if (!Number.isSafeInteger(fiscalYear) || fiscalYear < 1 || fiscalYear > 9999) {
    return { error: 'fiscal_year must be an integer between 1 and 9999' };
  }

  return { value: fiscalYear };
}

router.use(requireAuth);

// Fiscal month 1 = July of `fiscalYear`, fiscal month 12 = June of
// `fiscalYear + 1`. Converts a (fiscalYear, fiscalMonth) pair to the
// last calendar date of that month, e.g. (2025, 1) -> "2025-07-31".
function fiscalMonthEndDate(fiscalYear, fiscalMonth) {
  const calendarMonth = fiscalMonth <= 6 ? fiscalMonth + 6 : fiscalMonth - 6;
  const calendarYear = fiscalMonth <= 6 ? fiscalYear : fiscalYear + 1;
  // Date.UTC's month param is 0-indexed; day 0 rolls back to the last
  // day of the previous (1-indexed) month, i.e. calendarMonth itself.
  return new Date(Date.UTC(calendarYear, calendarMonth, 0)).toISOString().slice(0, 10);
}


function computeDividends(fiscalYear) {
  const memberSavingsDividend = new Map(); // member_id -> running total
  const memberShareDividend = new Map();
  const monthlyBreakdown = [];

  for (let fiscalMonth = 1; fiscalMonth <= 12; fiscalMonth++) {
    const monthEndDate = fiscalMonthEndDate(fiscalYear, fiscalMonth);

    const revenuePlaceholders = REVENUE_TYPES.map(() => '?').join(', ');
    const revenue = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE fiscal_year = ? AND fiscal_month = ? AND type IN (${revenuePlaceholders})`
      )
      .get(fiscalYear, fiscalMonth, ...REVENUE_TYPES).total;

    const expenseTotal = db
      .prepare('SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS total FROM expenses WHERE fiscal_year = ? AND fiscal_month = ?')
      .get(fiscalYear, fiscalMonth).total;

    const monthlyProfit = Math.round((revenue - expenseTotal) * 100) / 100;
    const distributableProfit = Math.max(0, monthlyProfit);
    const savingsPool = distributableProfit * SAVINGS_SHARE;
    const sharePool = distributableProfit * SHARE_SHARE;
    const reserveAmount = distributableProfit * (1 - SAVINGS_SHARE - SHARE_SHARE);

    const savingsBalances = db
      .prepare(
        `SELECT member_id, ROUND(SUM(amount), 2) AS balance FROM transactions
         WHERE type IN ('savings_deposit', 'opening_savings_balance') AND date <= ? GROUP BY member_id`
      )
      .all(monthEndDate);
    const shareBalances = db
      .prepare(
        `SELECT member_id, ROUND(SUM(amount), 2) AS balance FROM transactions
         WHERE type IN ('share_purchase', 'opening_share_balance') AND date <= ? GROUP BY member_id`
      )
      .all(monthEndDate);

    const totalSavings = savingsBalances.reduce((sum, r) => sum + r.balance, 0);
    const totalShares = shareBalances.reduce((sum, r) => sum + r.balance, 0);

    if (totalSavings > 0 && savingsPool !== 0) {
      for (const { member_id, balance } of savingsBalances) {
        const share = (balance / totalSavings) * savingsPool;
        memberSavingsDividend.set(member_id, (memberSavingsDividend.get(member_id) || 0) + share);
      }
    }
    if (totalShares > 0 && sharePool !== 0) {
      for (const { member_id, balance } of shareBalances) {
        const share = (balance / totalShares) * sharePool;
        memberShareDividend.set(member_id, (memberShareDividend.get(member_id) || 0) + share);
      }
    }

    monthlyBreakdown.push({
      fiscal_month: fiscalMonth,
      month_end_date: monthEndDate,
      revenue,
      expenses: expenseTotal,
      profit: monthlyProfit,
      savings_pool: savingsPool,
      share_pool: sharePool,
      reserve: reserveAmount,
      total_savings_balance: totalSavings,
      total_share_balance: totalShares,
    });
  }

  const memberIds = new Set([...memberSavingsDividend.keys(), ...memberShareDividend.keys()]);
  const perMember = [...memberIds].map((member_id) => ({
    member_id,
    savings_dividend: Math.round((memberSavingsDividend.get(member_id) || 0) * 100) / 100,
    share_dividend: Math.round((memberShareDividend.get(member_id) || 0) * 100) / 100,
  }));

  return { fiscal_year: fiscalYear, perMember, monthlyBreakdown };
}

// GET /api/dividend-history/preview/:fiscalYear — runs the calculation
// WITHOUT writing anything, so you can sanity-check the numbers before
// committing them (dividend payouts are consequential — you want to
// look before you leap).
router.get(
  '/preview/:fiscalYear',
  asyncHandler(async (req, res) => {
    const fiscalYearResult = parseFiscalYear(req.params.fiscalYear);
    if (fiscalYearResult.error) return res.status(400).json({ error: fiscalYearResult.error });
    res.json(computeDividends(fiscalYearResult.value));
  })
);

// POST /api/dividend-history/calculate/:fiscalYear — runs the calculation
// and writes one row per member into dividend_history (upsert on
// (member_id, fiscal_year) — safe to re-run if figures need correcting).
router.post(
  '/calculate/:fiscalYear',
  asyncHandler(async (req, res) => {
    const fiscalYearResult = parseFiscalYear(req.params.fiscalYear);
    if (fiscalYearResult.error) return res.status(400).json({ error: fiscalYearResult.error });
    const fiscalYear = fiscalYearResult.value;

    const { perMember, monthlyBreakdown } = computeDividends(fiscalYear);

    const upsert = db.prepare(`
      INSERT INTO dividend_history (
        id, member_id, fiscal_year, savings_dividend, share_dividend,
        date_calculated, updated_at, synced_at
      )
      VALUES (?, ?, ?, ?, ?, date('now'), datetime('now'), NULL)
      ON CONFLICT(member_id, fiscal_year) DO UPDATE SET
        savings_dividend = excluded.savings_dividend,
        share_dividend = excluded.share_dividend,
        date_calculated = excluded.date_calculated,
        updated_at = excluded.updated_at,
        synced_at = NULL
    `);

    const writeAll = db.transaction((rows) => {
      for (const row of rows) {
        upsert.run(randomUUID(), row.member_id, fiscalYear, row.savings_dividend, row.share_dividend);
      }
    });
    writeAll(perMember);

    const saved = db
      .prepare('SELECT * FROM dividend_history WHERE fiscal_year = ? ORDER BY savings_dividend DESC')
      .all(fiscalYear);

    res.json({
      fiscal_year: fiscalYear,
      members_calculated: perMember.length,
      total_reserve: monthlyBreakdown.reduce((sum, m) => sum + m.reserve, 0),
      monthly_breakdown: monthlyBreakdown,
      dividends: saved,
    });
  })
);

// GET /api/dividend-history — list, optionally filtered
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { member_id, fiscal_year } = req.query;

    if (Array.isArray(member_id) || Array.isArray(fiscal_year)) {
      return res.status(400).json({ error: 'member_id and fiscal_year must be single values' });
    }

    let query = 'SELECT * FROM dividend_history';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }
    if (fiscal_year) {
      const fiscalYearResult = parseFiscalYear(fiscal_year);
      if (fiscalYearResult.error) return res.status(400).json({ error: fiscalYearResult.error });
      conditions.push('fiscal_year = ?');
      params.push(fiscalYearResult.value);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY fiscal_year DESC, savings_dividend DESC';

    res.json(db.prepare(query).all(...params));
  })
);

// GET /api/dividend-history/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const record = db.prepare('SELECT * FROM dividend_history WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Dividend record not found' });
    res.json(record);
  })
);

export default router;
