-- Migration 002
-- Persist installment schedules, penalties, payments and payment allocations.

CREATE TABLE loan_installments (
    id TEXT PRIMARY KEY,

    loan_id TEXT NOT NULL
        REFERENCES loans(id),

    installment_number INTEGER NOT NULL
        CHECK (installment_number > 0),

    due_date TEXT NOT NULL,

    principal_due NUMERIC NOT NULL
        CHECK (principal_due >= 0),

    interest_due NUMERIC NOT NULL
        CHECK (interest_due >= 0),

    insurance_due NUMERIC NOT NULL
        CHECK (insurance_due >= 0),

    principal_paid NUMERIC NOT NULL DEFAULT 0
        CHECK (principal_paid >= 0),

    interest_paid NUMERIC NOT NULL DEFAULT 0
        CHECK (interest_paid >= 0),

    insurance_paid NUMERIC NOT NULL DEFAULT 0
        CHECK (insurance_paid >= 0),

    status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (
            status IN (
                'unpaid',
                'partially_paid',
                'paid'
            )
        ),

    synced_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    updated_at TEXT,

    UNIQUE (loan_id, installment_number),

    CHECK (principal_paid <= principal_due),

    CHECK (interest_paid <= interest_due),

    CHECK (insurance_paid <= insurance_due)
);

CREATE INDEX idx_loan_installments_loan_due
    ON loan_installments (loan_id, due_date);

CREATE INDEX idx_loan_installments_status
    ON loan_installments (status);

CREATE INDEX idx_loan_installments_unsynced
    ON loan_installments (synced_at)
    WHERE synced_at IS NULL;


CREATE TABLE loan_penalties (
    id TEXT PRIMARY KEY,

    loan_id TEXT NOT NULL
        REFERENCES loans(id),

    penalty_period TEXT NOT NULL,

    calculation_date TEXT NOT NULL,

    basis_amount NUMERIC NOT NULL
        CHECK (basis_amount >= 0),

    rate NUMERIC NOT NULL DEFAULT 0.02
        CHECK (rate = 0.02),

    amount NUMERIC NOT NULL
        CHECK (amount >= 0),

    synced_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    updated_at TEXT,

    UNIQUE (loan_id, penalty_period)
);

CREATE INDEX idx_loan_penalties_loan_period
    ON loan_penalties (loan_id, penalty_period);

CREATE INDEX idx_loan_penalties_unsynced
    ON loan_penalties (synced_at)
    WHERE synced_at IS NULL;


CREATE TABLE loan_payments (
    id TEXT PRIMARY KEY,

    loan_id TEXT NOT NULL
        REFERENCES loans(id),

    member_id TEXT NOT NULL
        REFERENCES members(id),

    amount NUMERIC NOT NULL
        CHECK (amount > 0),

    payment_date TEXT NOT NULL,

    recorded_by TEXT NOT NULL
        REFERENCES administrators(id),

    notes TEXT,

    synced_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    updated_at TEXT
);

CREATE INDEX idx_loan_payments_loan_date
    ON loan_payments (loan_id, payment_date);

CREATE INDEX idx_loan_payments_member
    ON loan_payments (member_id);

CREATE INDEX idx_loan_payments_unsynced
    ON loan_payments (synced_at)
    WHERE synced_at IS NULL;


CREATE TABLE loan_payment_allocations (
    id TEXT PRIMARY KEY,

    payment_id TEXT NOT NULL
        REFERENCES loan_payments(id),

    loan_id TEXT NOT NULL
        REFERENCES loans(id),

    bucket TEXT NOT NULL
        CHECK (
            bucket IN (
                'collection_expense',
                'interest_penalty',
                'principal'
            )
        ),

    amount NUMERIC NOT NULL
        CHECK (amount > 0),

    installment_id TEXT
        REFERENCES loan_installments(id),

    penalty_id TEXT
        REFERENCES loan_penalties(id),

    synced_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    updated_at TEXT
);

CREATE INDEX idx_payment_allocations_payment
    ON loan_payment_allocations (payment_id);

CREATE INDEX idx_payment_allocations_loan
    ON loan_payment_allocations (loan_id);

CREATE INDEX idx_payment_allocations_installment
    ON loan_payment_allocations (installment_id);

CREATE INDEX idx_payment_allocations_penalty
    ON loan_payment_allocations (penalty_id);

CREATE INDEX idx_payment_allocations_unsynced
    ON loan_payment_allocations (synced_at)
    WHERE synced_at IS NULL;


-- Collection expenses are associated with the loan they belong to.
ALTER TABLE expenses
ADD COLUMN loan_id TEXT REFERENCES loans(id);

CREATE INDEX idx_expenses_loan
    ON expenses (loan_id);