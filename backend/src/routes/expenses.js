import { Router } from "express";
import db from "../config/sqlite.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";

const router = Router();

// GET /api/expenses
// Returns all expenses, most recent first.
// Optional filter: ?category=...
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { category } = req.query;

    // Reject arrays like ?category=a&category=b
    if (Array.isArray(category)) {
      return res.status(400).json({
        error: "category must be a single value, not an array",
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
// Returns one expense by ID, or 404 if it does not exist.
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

export default router;