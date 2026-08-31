import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../config/sqlite.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

const ALLOWED_EXPENSE_CATEGORIES = [
  "supplies",
  "utilities",
  "rent",
  "maintenance",
  "equipment",
  "other",
];

// GET /api/expenses
// Returns all expenses, most recent first.
// Optional filter: ?category=...
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { category } = req.query;

    if (Array.isArray(category)) {
      return res.status(400).json({
        error: "category must be a single value, not an array",
      });
    }

    if (category && !ALLOWED_EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `category must be one of: ${ALLOWED_EXPENSE_CATEGORIES.join(", ")}`,
      });
    }

    let query = "SELECT * FROM expenses";
    const params = [];

    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }

    query += " ORDER BY date DESC, created_at DESC";

    const expenses = db.prepare(query).all(...params);

    res.json(expenses);
  }),
);

// GET /api/expenses/:id
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const expense = db
      .prepare("SELECT * FROM expenses WHERE id = ?")
      .get(req.params.id);

    if (!expense) {
      return res.status(404).json({
        error: "Expense not found",
      });
    }

    res.json(expense);
  }),
);

function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { category, amount, description, date } = req.body;

    if (!category || amount === undefined) {
      return res.status(400).json({
        error: "category and amount are required",
      });
    }

    if (!ALLOWED_EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: "Invalid expense category",
      });
    }

    const parsedAmount = Number(amount);
    const cents = Math.round((parsedAmount + Number.EPSILON) * 100);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount - cents / 100) > 1e-9) {
      return res.status(400).json({
        error: "Amount must be a positive number with no more than 2 decimal places",
      });
    }
    const normalizedAmount = cents / 100;

    const id = randomUUID();

    const expenseDate = date === undefined || date === null || date === ""
      ? new Date().toISOString().slice(0, 10)
      : date;

    if (!isValidISODate(expenseDate)) {
      return res.status(400).json({
        error: "Date must be a valid date in YYYY-MM-DD format",
      });
    }

    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > 255) {
        return res.status(400).json({
          error: "description must be a string of at most 255 characters",
        });
      }
    }

    const recordedBy = req.admin.id;

    db.prepare(
      `
  INSERT INTO expenses (
    id,
    category,
    description,
    amount,
    date,
    recorded_by,
    updated_at,
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), NULL)
`,
    ).run(
      id,
      category,
      description ?? null,
      normalizedAmount,
      expenseDate,
      recordedBy,
    );

    const expense = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);

    return res.status(201).json(expense);
  }),
);

export default router;
