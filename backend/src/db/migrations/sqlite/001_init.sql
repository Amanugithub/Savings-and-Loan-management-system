-- =========================================================
-- Savings and Loan Management System — LOCAL Schema (SQLite)
-- Runs on the office computer via better-sqlite3, so the
-- Administrator app works fully offline. Structurally the
-- same as the remote Postgres schema, with two differences:
--
-- 1. IDs are generated in application code (crypto.randomUUID()
--    in Node) BEFORE insert, not by the database — SQLite has
--    no built-in UUID generator, unlike Postgres's gen_random_uuid().
--
-- 2. Tables that can be created/edited while offline have a
--    `synced_at` column: NULL means "not yet pushed to the
--    remote database." The sync worker queries
--    `WHERE synced_at IS NULL`, pushes those rows to the
--    remote sync API, then stamps synced_at on success.
--    This is the entire "outbox" — no separate queue table
--    needed.
-- =========================================================

CREATE TABLE members (
    id              TEXT PRIMARY KEY,   -- UUID string, set by app code on insert
    name            TEXT NOT NULL,
    gender          TEXT NOT NULL CHECK (gender IN ('male', 'female')),
    address         TEXT,
    age             INTEGER CHECK (age > 0),
    heir_info       TEXT,
    id_card_number  TEXT UNIQUE,
    phone_number    TEXT UNIQUE NOT NULL,  -- also serves as the mobile app login username
    password_hash   TEXT,                   -- set at in-person registration
    date_joined     TEXT NOT NULL DEFAULT (date('now')),  -- ISO date string
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'exited')),
    synced_at       TEXT,               -- NULL = pending sync to remote
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE administrators (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive')),
    synced_at       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE loans (
    id                          TEXT PRIMARY KEY,
    member_id                   TEXT NOT NULL REFERENCES members(id),
    guarantor_member_id         TEXT REFERENCES members(id),
    type                        TEXT NOT NULL CHECK (type IN ('regular', 'self_secured')),
    principal_amount            REAL NOT NULL CHECK (principal_amount > 0),
    term_years                  INTEGER NOT NULL CHECK (term_years IN (1, 2, 3, 4, 5)),
    interest_rate                REAL NOT NULL,
    monthly_installment          REAL NOT NULL,
    monthly_interest_amount      REAL NOT NULL,
    insurance_amount             REAL NOT NULL,
    collateral_type              TEXT NOT NULL CHECK (collateral_type IN ('guarantor', 'property')),
    disbursement_date            TEXT,
    status                        TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'active', 'closed', 'rejected')),
    synced_at                     TEXT,
    created_at                    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (guarantor_member_id IS NULL OR guarantor_member_id <> member_id)
);

-- Same guarantor-exclusivity rule as remote, enforced locally too.
CREATE UNIQUE INDEX uq_guarantor_one_active_loan
    ON loans (guarantor_member_id)
    WHERE status = 'active' AND guarantor_member_id IS NOT NULL;

CREATE INDEX idx_loans_member ON loans (member_id);

CREATE TABLE transactions (
    id            TEXT PRIMARY KEY,
    member_id     TEXT REFERENCES members(id),
    loan_id       TEXT REFERENCES loans(id),
    recorded_by   TEXT NOT NULL REFERENCES administrators(id),
    type          TEXT NOT NULL CHECK (type IN (
                      'savings_deposit',
                      'share_purchase',
                      'penalty_payment',
                      'registration_fee',
                      'card_fee',
                      'loan_disbursement',
                      'loan_installment',
                      'loan_interest',
                      'loan_insurance',
                      'member_exit_payout',
                      'bank_interest_income'
                  )),
    amount        REAL NOT NULL CHECK (amount > 0 OR type = 'member_exit_payout'),
    date          TEXT NOT NULL DEFAULT (date('now')),  -- ISO date string, e.g. 2026-03-15
    -- SQLite has no EXTRACT(); strftime('%m', date) gives the month as text,
    -- so it's cast to INTEGER for the comparison. Same July-June fiscal
    -- year logic as the remote schema, just different date-function syntax.
    fiscal_year   INTEGER GENERATED ALWAYS AS (
                      CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
                           THEN CAST(strftime('%Y', date) AS INTEGER)
                           ELSE CAST(strftime('%Y', date) AS INTEGER) - 1
                      END
                  ) STORED,
    fiscal_month  INTEGER GENERATED ALWAYS AS (
                      CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
                           THEN CAST(strftime('%m', date) AS INTEGER) - 6
                           ELSE CAST(strftime('%m', date) AS INTEGER) + 6
                      END
                  ) STORED,
    notes         TEXT,
    synced_at     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transactions_member_date ON transactions (member_id, date);
CREATE INDEX idx_transactions_loan ON transactions (loan_id);
CREATE INDEX idx_transactions_unsynced ON transactions (synced_at) WHERE synced_at IS NULL;

CREATE TABLE expenses (
    id            TEXT PRIMARY KEY,
    category      TEXT NOT NULL CHECK (category IN (
                      'supplies', 'utilities', 'rent', 'maintenance', 'equipment', 'other'
                  )),
    description   TEXT,
    amount        REAL NOT NULL CHECK (amount > 0),
    date          TEXT NOT NULL DEFAULT (date('now')),
    fiscal_year   INTEGER GENERATED ALWAYS AS (
                      CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
                           THEN CAST(strftime('%Y', date) AS INTEGER)
                           ELSE CAST(strftime('%Y', date) AS INTEGER) - 1
                      END
                  ) STORED,
    fiscal_month  INTEGER GENERATED ALWAYS AS (
                      CASE WHEN CAST(strftime('%m', date) AS INTEGER) >= 7
                           THEN CAST(strftime('%m', date) AS INTEGER) - 6
                           ELSE CAST(strftime('%m', date) AS INTEGER) + 6
                      END
                  ) STORED,
    recorded_by   TEXT NOT NULL REFERENCES administrators(id),
    synced_at     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_expenses_unsynced ON expenses (synced_at) WHERE synced_at IS NULL;

-- Computed and stored LOCALLY at fiscal year-end -- this is
-- the authoritative calculation, not a mirror of remote.
-- Since all money transactions are recorded locally (no
-- mobile payment integration), the local database already
-- has the complete picture needed for this, with or without
-- internet. Synced up to remote afterward purely so the
-- member mobile app has something to read.
CREATE TABLE dividend_history (
    id                TEXT PRIMARY KEY,
    member_id         TEXT NOT NULL REFERENCES members(id),
    fiscal_year       INTEGER NOT NULL,
    savings_dividend  REAL NOT NULL DEFAULT 0,
    share_dividend    REAL NOT NULL DEFAULT 0,
    date_calculated   TEXT NOT NULL DEFAULT (date('now')),
    synced_at         TEXT,
    UNIQUE (member_id, fiscal_year)
);

CREATE INDEX idx_dividend_history_unsynced ON dividend_history (synced_at) WHERE synced_at IS NULL;

-- Same reasoning: a resignation payout is calculated from
-- local data and can happen entirely offline.
CREATE TABLE member_exits (
    id                       TEXT PRIMARY KEY,
    member_id                TEXT NOT NULL UNIQUE REFERENCES members(id),
    exit_date                TEXT NOT NULL,
    savings_returned         REAL NOT NULL,
    shares_returned          REAL NOT NULL,
    dividend_owed            REAL NOT NULL,
    government_withholding   REAL NOT NULL,
    net_amount_paid          REAL NOT NULL,
    synced_at                TEXT
);

CREATE INDEX idx_member_exits_unsynced ON member_exits (synced_at) WHERE synced_at IS NULL;

-- Same one-row-per-recipient design as remote. Staff can queue
-- up a meeting announcement or payment reminder while offline;
-- it syncs out to members' phones once connectivity returns.
CREATE TABLE notifications (
    id            TEXT PRIMARY KEY,
    member_id     TEXT NOT NULL REFERENCES members(id),
    loan_id       TEXT REFERENCES loans(id),
    title         TEXT NOT NULL,
    message       TEXT NOT NULL,
    type          TEXT NOT NULL CHECK (type IN (
                      'payment_due', 'meeting', 'news', 'loan_status'
                  )),
    is_read       INTEGER NOT NULL DEFAULT 0,  -- SQLite has no boolean; 0/1
    synced_at     TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_unsynced ON notifications (synced_at) WHERE synced_at IS NULL;

-- =========================================================
-- monthly_summary — same idea as remote: a live view over
-- local transactions, grouped by the generated fiscal columns.
-- Gives staff the same "monthly collection sheet" view
-- whether they're online or offline.
-- =========================================================
CREATE VIEW monthly_summary AS
SELECT
    member_id,
    fiscal_year,
    fiscal_month,
    SUM(amount) FILTER (WHERE type = 'savings_deposit')  AS total_savings,
    SUM(amount) FILTER (WHERE type = 'share_purchase')   AS total_shares,
    SUM(amount) FILTER (WHERE type = 'loan_installment') AS total_installments,
    SUM(amount) FILTER (WHERE type = 'loan_interest')    AS total_interest,
    SUM(amount) FILTER (WHERE type = 'penalty_payment')  AS total_penalties,
    SUM(amount) FILTER (WHERE type NOT IN ('member_exit_payout', 'bank_interest_income')) AS total_collected,
    SUM(amount) FILTER (WHERE type = 'member_exit_payout') AS total_payouts,
    SUM(amount) FILTER (WHERE type = 'bank_interest_income') AS total_bank_interest
FROM transactions
GROUP BY member_id, fiscal_year, fiscal_month;
