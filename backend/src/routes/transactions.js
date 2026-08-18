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

    const transactionDate = date ?? new Date().toISOString().slice(0, 10);

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

export default router;
