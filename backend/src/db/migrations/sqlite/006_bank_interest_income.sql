-- Organization-level bank interest has no member or loan. Make member_id
-- nullable and add the ledger type while preserving existing transactions.
PRAGMA foreign_keys = OFF;
DROP VIEW monthly_summary;

CREATE TABLE transactions_new (
    id            TEXT PRIMARY KEY,
    member_id     TEXT REFERENCES members(id),
    loan_id       TEXT REFERENCES loans(id),
    recorded_by   TEXT NOT NULL REFERENCES administrators(id),
    type          TEXT NOT NULL CHECK (type IN (
                      'savings_deposit', 'share_purchase', 'penalty_payment',
                      'registration_fee', 'card_fee', 'loan_disbursement',
                      'loan_installment', 'loan_interest', 'loan_insurance',
                      'member_exit_payout', 'bank_interest_income'
                  )),
    amount        REAL NOT NULL CHECK (amount > 0 OR type = 'member_exit_payout'),
    date          TEXT NOT NULL DEFAULT (date('now')),
    fiscal_year   INTEGER GENERATED ALWAYS AS (
                      CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
                           THEN CAST(strftime('%Y', date) AS INTEGER)
                           ELSE CAST(strftime('%Y', date) AS INTEGER) - 1 END
                  ) STORED,
    fiscal_month  INTEGER GENERATED ALWAYS AS (
                      CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
                           THEN CAST(strftime('%m', date) AS INTEGER) - 6
                           ELSE CAST(strftime('%m', date) AS INTEGER) + 6 END
                  ) STORED,
    notes         TEXT,
    synced_at    TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT
);

INSERT INTO transactions_new (id, member_id, loan_id, recorded_by, type, amount, date, notes, synced_at, created_at, updated_at)
SELECT id, member_id, loan_id, recorded_by, type, amount, date, notes, synced_at, created_at, updated_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;
CREATE INDEX idx_transactions_member_date ON transactions (member_id, date);
CREATE INDEX idx_transactions_loan ON transactions (loan_id);
CREATE INDEX idx_transactions_unsynced ON transactions (synced_at) WHERE synced_at IS NULL;

CREATE VIEW monthly_summary AS
SELECT
    member_id,
    fiscal_year,
    fiscal_month,
    SUM(amount) FILTER (WHERE type = 'savings_deposit') AS total_savings,
    SUM(amount) FILTER (WHERE type = 'share_purchase') AS total_shares,
    SUM(amount) FILTER (WHERE type = 'loan_installment') AS total_installments,
    SUM(amount) FILTER (WHERE type = 'loan_interest') AS total_interest,
    SUM(amount) FILTER (WHERE type = 'penalty_payment') AS total_penalties,
    SUM(amount) FILTER (WHERE type NOT IN ('member_exit_payout', 'bank_interest_income')) AS total_collected,
    SUM(amount) FILTER (WHERE type = 'member_exit_payout') AS total_payouts,
    SUM(amount) FILTER (WHERE type = 'bank_interest_income') AS total_bank_interest
FROM transactions
GROUP BY member_id, fiscal_year, fiscal_month;

PRAGMA foreign_keys = ON;
