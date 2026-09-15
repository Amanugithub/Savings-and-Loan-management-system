-- Migration 007: record payment method and make small cash rounding explicit.

ALTER TABLE loan_payments
  ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money'));

DROP INDEX IF EXISTS idx_loan_payment_allocations_payment;
DROP INDEX IF EXISTS idx_loan_payment_allocations_loan;
DROP INDEX IF EXISTS idx_loan_payment_allocations_installment;
DROP INDEX IF EXISTS idx_loan_payment_allocations_penalty;
DROP INDEX IF EXISTS idx_loan_payment_allocations_unsynced;

ALTER TABLE loan_payment_allocations
  RENAME TO loan_payment_allocations_before_cash_rounding;

CREATE TABLE loan_payment_allocations (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL REFERENCES loan_payments(id),
    loan_id TEXT NOT NULL REFERENCES loans(id),

    bucket TEXT NOT NULL CHECK (
        bucket IN (
            'collection_expense',
            'interest_penalty',
            'principal',
            'cash_rounding_adjustment'
        )
    ),

    amount NUMERIC NOT NULL CHECK (amount > 0),

    installment_id TEXT REFERENCES loan_installments(id),
    penalty_id TEXT REFERENCES loan_penalties(id),

    synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);

INSERT INTO loan_payment_allocations (
    id, payment_id, loan_id, bucket, amount, installment_id, penalty_id,
    synced_at, created_at, updated_at
)
SELECT
    id, payment_id, loan_id, bucket, amount, installment_id, penalty_id,
    synced_at, created_at, updated_at
FROM loan_payment_allocations_before_cash_rounding;

DROP TABLE loan_payment_allocations_before_cash_rounding;

CREATE INDEX idx_loan_payment_allocations_payment
    ON loan_payment_allocations (payment_id);

CREATE INDEX idx_loan_payment_allocations_loan
    ON loan_payment_allocations (loan_id);

CREATE INDEX idx_loan_payment_allocations_installment
    ON loan_payment_allocations (installment_id);

CREATE INDEX idx_loan_payment_allocations_penalty
    ON loan_payment_allocations (penalty_id);

CREATE INDEX idx_loan_payment_allocations_unsynced
    ON loan_payment_allocations (synced_at)
    WHERE synced_at IS NULL;

UPDATE loans
SET monthly_installment = ROUND(
  (principal_amount
   + ROUND(principal_amount * interest_rate / 100, 2)
   + insurance_amount) / (term_years * 12),
  2
);
