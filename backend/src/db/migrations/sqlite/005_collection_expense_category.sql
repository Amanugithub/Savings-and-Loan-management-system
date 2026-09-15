-- Migration 005: allow collection expenses to be attached to a loan.

DROP INDEX IF EXISTS idx_expenses_unsynced;
DROP INDEX IF EXISTS idx_expenses_loan;

ALTER TABLE expenses RENAME TO expenses_before_collection_expense;

CREATE TABLE expenses (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN (
        'supplies', 'utilities', 'rent', 'maintenance', 'equipment',
        'collection_expense', 'other'
    )),
    description TEXT,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL DEFAULT (date('now')),
    fiscal_year INTEGER GENERATED ALWAYS AS (
        CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
             THEN CAST(strftime('%Y', date) AS INTEGER)
             ELSE CAST(strftime('%Y', date) AS INTEGER) - 1 END
    ) STORED,
    fiscal_month INTEGER GENERATED ALWAYS AS (
        CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
             THEN CAST(strftime('%m', date) AS INTEGER) - 6
             ELSE CAST(strftime('%m', date) AS INTEGER) + 6 END
    ) STORED,
    recorded_by TEXT NOT NULL REFERENCES administrators(id),
    loan_id TEXT REFERENCES loans(id),
    synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);

INSERT INTO expenses (
    id, category, description, amount, date, recorded_by, loan_id,
    synced_at, created_at, updated_at
)
SELECT
    id, category, description, amount, date, recorded_by, loan_id,
    synced_at, created_at, updated_at
FROM expenses_before_collection_expense;

DROP TABLE expenses_before_collection_expense;

CREATE INDEX idx_expenses_unsynced ON expenses (synced_at) WHERE synced_at IS NULL;
CREATE INDEX idx_expenses_loan ON expenses (loan_id);
