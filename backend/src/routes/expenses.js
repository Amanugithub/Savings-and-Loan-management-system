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

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        error: "Amount must be a positive number",
      });
    }

    const id = randomUUID();

    const expenseDate = date ?? new Date().toISOString().slice(0, 10);

    if (!isValidISODate(expenseDate)) {
      return res.status(400).json({
        error: "Date must be a valid date in YYYY-MM-DD format",
      });
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
    synced_at
  )
  VALUES (?, ?, ?, ?, ?, ?, NULL)
`,
    ).run(
      id,
      category,
      description ?? null,
      parsedAmount,
      expenseDate,
      recordedBy,
    );

    const expense = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);

    return res.status(201).json(expense);
  }),
);

export default router;
