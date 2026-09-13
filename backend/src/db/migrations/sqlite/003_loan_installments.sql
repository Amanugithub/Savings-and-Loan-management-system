-- Persisted loan installment schedules

CREATE TABLE loan_installments (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id),
    installment_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,

    principal_due REAL NOT NULL CHECK (principal_due >= 0),
    interest_due REAL NOT NULL CHECK (interest_due >= 0),
    insurance_due REAL NOT NULL CHECK (insurance_due >= 0),

    principal_paid REAL NOT NULL DEFAULT 0 CHECK (principal_paid >= 0),
    interest_paid REAL NOT NULL DEFAULT 0 CHECK (interest_paid >= 0),
    insurance_paid REAL NOT NULL DEFAULT 0 CHECK (insurance_paid >= 0),

    status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (status IN ('unpaid', 'partially_paid', 'paid')),

    synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,

    UNIQUE (loan_id, installment_number)
);

CREATE INDEX idx_loan_installments_loan
    ON loan_installments (loan_id, installment_number);

CREATE INDEX idx_loan_installments_unsynced
    ON loan_installments (synced_at)
    WHERE synced_at IS NULL;