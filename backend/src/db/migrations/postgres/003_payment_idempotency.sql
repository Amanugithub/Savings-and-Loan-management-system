-- Migration 003: persist retry keys for receipt-based loan payments.

ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_payments_idempotency
    ON loan_payments (loan_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
