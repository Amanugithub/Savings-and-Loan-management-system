-- =========================================================
-- Savings and Loan Management System — REMOTE Schema (PostgreSQL)
-- Hosted on Supabase. This is the source of truth the mobile
-- app reads from, and what the local admin database syncs to.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- ---------------------------------------------------------
-- All tables use UUID primary keys, not auto-increment
-- integers. This is required for offline-first sync: a
-- record created on the local admin machine (with no
-- internet) must never collide with a record created
-- directly on the remote database (e.g. a member's loan
-- application from the mobile app). UUIDs generated
-- independently on either side are effectively guaranteed
-- unique, so sync becomes a safe "insert if not already
-- present" operation, never a renumbering problem.
-- ---------------------------------------------------------

CREATE TABLE members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    gender          VARCHAR(10)  NOT NULL CHECK (gender IN ('male', 'female')),
    address         VARCHAR(255),
    age             INT CHECK (age > 0),
    heir_info       VARCHAR(255),
    id_card_number  VARCHAR(50) UNIQUE,
    phone_number    VARCHAR(20) UNIQUE NOT NULL,  -- also serves as the mobile app login username
    password_hash   VARCHAR(255),                  -- NULL until first set at in-person registration
    date_joined     DATE NOT NULL DEFAULT CURRENT_DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'exited')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()  -- used to resolve sync conflicts (last write wins)
);

CREATE TABLE administrators (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loans (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id                   UUID NOT NULL REFERENCES members(id),
    guarantor_member_id         UUID REFERENCES members(id),
    type                        VARCHAR(20) NOT NULL
                                    CHECK (type IN ('regular', 'self_secured')),
    principal_amount            NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
    term_years                  INT NOT NULL CHECK (term_years IN (1, 2, 3, 4, 5)),
    interest_rate               NUMERIC(5,2) NOT NULL,   -- e.g. 8.00 / 10.00 / 11.00 / 13.00
    monthly_installment         NUMERIC(12,2) NOT NULL,  -- principal / (term_years * 12)
    monthly_interest_amount     NUMERIC(12,2) NOT NULL,  -- (principal * rate) / (term_years * 12)
    insurance_amount            NUMERIC(12,2) NOT NULL,  -- 1% of principal, paid upfront
    collateral_type             VARCHAR(20) NOT NULL
                                    CHECK (collateral_type IN ('guarantor', 'property')),
    disbursement_date           DATE,                    -- NULL until approved & disbursed
    status                      VARCHAR(20) NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'active', 'closed', 'rejected')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_guarantor_not_self
        CHECK (guarantor_member_id IS NULL OR guarantor_member_id <> member_id)
);

-- Business rule: a member can only guarantee ONE active loan at a time.
CREATE UNIQUE INDEX uq_guarantor_one_active_loan
    ON loans (guarantor_member_id)
    WHERE status = 'active' AND guarantor_member_id IS NOT NULL;

CREATE INDEX idx_loans_member ON loans (member_id);

CREATE UNIQUE INDEX uq_member_one_active_loan
    ON loans (member_id)
    WHERE status = 'active';

CREATE TABLE transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id     UUID REFERENCES members(id),
    loan_id       UUID REFERENCES loans(id),   -- NULL unless loan-related
    recorded_by   UUID NOT NULL REFERENCES administrators(id),
    type          VARCHAR(30) NOT NULL CHECK (type IN (
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
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0 OR type = 'member_exit_payout'),
    date          DATE NOT NULL DEFAULT CURRENT_DATE,  -- Gregorian, source of truth
    -- Fiscal year runs July 1 - June 30 (fixed Gregorian offset; the org
    -- does not track Pagume, so a plain 12-month scheme is used).
    fiscal_year   SMALLINT GENERATED ALWAYS AS (
                      CASE WHEN EXTRACT(MONTH FROM date) >= 7
                           THEN EXTRACT(YEAR FROM date)::INT
                           ELSE EXTRACT(YEAR FROM date)::INT - 1
                      END
                  ) STORED,
    fiscal_month  SMALLINT GENERATED ALWAYS AS (
                      CASE WHEN EXTRACT(MONTH FROM date) >= 7
                           THEN EXTRACT(MONTH FROM date)::INT - 6
                           ELSE EXTRACT(MONTH FROM date)::INT + 6
                      END
                  ) STORED,
    notes         VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_member_date ON transactions (member_id, date);
CREATE INDEX idx_transactions_loan ON transactions (loan_id);

CREATE TABLE expenses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category      VARCHAR(20) NOT NULL CHECK (category IN (
                      'supplies', 'utilities', 'rent', 'maintenance', 'equipment', 'other'
                  )),
    description   VARCHAR(255),
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    date          DATE NOT NULL DEFAULT CURRENT_DATE,
    fiscal_year   SMALLINT GENERATED ALWAYS AS (
                      CASE WHEN EXTRACT(MONTH FROM date) >= 7
                           THEN EXTRACT(YEAR FROM date)::INT
                           ELSE EXTRACT(YEAR FROM date)::INT - 1
                      END
                  ) STORED,
    fiscal_month  SMALLINT GENERATED ALWAYS AS (
                      CASE WHEN EXTRACT(MONTH FROM date) >= 7
                           THEN EXTRACT(MONTH FROM date)::INT - 6
                           ELSE EXTRACT(MONTH FROM date)::INT + 6
                      END
                  ) STORED,
    recorded_by   UUID NOT NULL REFERENCES administrators(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirror of the local calculation -- populated by sync, not
-- computed independently here. The local admin database is
-- the authoritative source (see schema_local.sql): since all
-- money transactions are recorded in person, offline, local
-- always has the complete picture needed to calculate this,
-- with or without internet. This remote copy exists purely
-- so the member mobile app has dividend history to read.
CREATE TABLE dividend_history (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id         UUID NOT NULL REFERENCES members(id),
    fiscal_year       INT NOT NULL,
    savings_dividend  NUMERIC(12,2) NOT NULL DEFAULT 0,
    share_dividend    NUMERIC(12,2) NOT NULL DEFAULT 0,
    date_calculated   DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, fiscal_year)
);

-- Same: mirror of the local calculation, synced up after the
-- fact. The 10% government withholding applies ONLY here, not
-- to dividend_history.
CREATE TABLE member_exits (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id                UUID NOT NULL UNIQUE REFERENCES members(id),
    exit_date                DATE NOT NULL,
    savings_returned         NUMERIC(12,2) NOT NULL,
    shares_returned          NUMERIC(12,2) NOT NULL,
    dividend_owed            NUMERIC(12,2) NOT NULL,
    government_withholding   NUMERIC(12,2) NOT NULL,  -- 10% of dividend_owed
    net_amount_paid          NUMERIC(12,2) NOT NULL,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per recipient, even for broadcasts (e.g. a meeting
-- notice sent to all 400 members becomes 400 rows) -- keeps
-- every query simple, and the storage cost is trivial at this scale.
CREATE TABLE notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id     UUID NOT NULL REFERENCES members(id),
    loan_id       UUID REFERENCES loans(id),  -- optional context, e.g. for payment-due reminders
    title         VARCHAR(150) NOT NULL,
    message       VARCHAR(500) NOT NULL,
    type          VARCHAR(20) NOT NULL CHECK (type IN (
                      'payment_due', 'meeting', 'news', 'loan_status'
                  )),
    is_read       BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_member_unread ON notifications (member_id) WHERE is_read = false;

-- =========================================================
-- monthly_summary — a live view, not a stored table.
-- Mirrors the cooperative's existing monthly collection sheet.
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
