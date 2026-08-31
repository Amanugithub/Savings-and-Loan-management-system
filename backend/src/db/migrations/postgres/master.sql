-- Savings and Loan Management System — consolidated PostgreSQL schema
-- Final schema represented by the former PostgreSQL migrations 001–004.
-- Run this file against a new PostgreSQL/Supabase database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    address VARCHAR(255),
    age INT CHECK (age > 0),
    heir_info VARCHAR(255),
    id_card_number VARCHAR(50) UNIQUE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    date_joined DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'exited')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE administrators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    guarantor_member_id UUID REFERENCES members(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('regular', 'self_secured')),
    principal_amount NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
    term_years INT NOT NULL CHECK (term_years IN (1, 2, 3, 4, 5)),
    interest_rate NUMERIC(5,2) NOT NULL,
    monthly_installment NUMERIC(12,2) NOT NULL,
    monthly_interest_amount NUMERIC(12,2) NOT NULL,
    insurance_amount NUMERIC(12,2) NOT NULL,
    collateral_type VARCHAR(20) NOT NULL CHECK (collateral_type IN ('guarantor', 'property')),
    disbursement_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'closed', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_guarantor_not_self
        CHECK (guarantor_member_id IS NULL OR guarantor_member_id <> member_id)
);

CREATE UNIQUE INDEX uq_guarantor_one_active_loan
    ON loans (guarantor_member_id)
    WHERE status = 'active' AND guarantor_member_id IS NOT NULL;
CREATE UNIQUE INDEX uq_member_one_active_loan
    ON loans (member_id)
    WHERE status = 'active';
CREATE INDEX idx_loans_member ON loans (member_id);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES members(id),
    loan_id UUID REFERENCES loans(id),
    recorded_by UUID NOT NULL REFERENCES administrators(id),
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'savings_deposit', 'share_purchase', 'opening_savings_balance',
        'opening_share_balance', 'penalty_payment',
        'registration_fee', 'card_fee', 'loan_disbursement',
        'loan_installment', 'loan_interest', 'loan_insurance',
        'member_exit_payout', 'bank_interest_income'
    )),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 OR type = 'member_exit_payout'),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    fiscal_year SMALLINT GENERATED ALWAYS AS (
        CASE WHEN EXTRACT(MONTH FROM date) >= 7
             THEN EXTRACT(YEAR FROM date)::INT
             ELSE EXTRACT(YEAR FROM date)::INT - 1 END
    ) STORED,
    fiscal_month SMALLINT GENERATED ALWAYS AS (
        CASE WHEN EXTRACT(MONTH FROM date) >= 7
             THEN EXTRACT(MONTH FROM date)::INT - 6
             ELSE EXTRACT(MONTH FROM date)::INT + 6 END
    ) STORED,
    notes VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_member_date ON transactions (member_id, date);
CREATE INDEX idx_transactions_loan ON transactions (loan_id);
CREATE UNIQUE INDEX uq_member_one_opening_savings
    ON transactions (member_id) WHERE type = 'opening_savings_balance';
CREATE UNIQUE INDEX uq_member_one_opening_shares
    ON transactions (member_id) WHERE type = 'opening_share_balance';

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(20) NOT NULL CHECK (category IN (
        'supplies', 'utilities', 'rent', 'maintenance', 'equipment', 'other'
    )),
    description VARCHAR(255),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    fiscal_year SMALLINT GENERATED ALWAYS AS (
        CASE WHEN EXTRACT(MONTH FROM date) >= 7
             THEN EXTRACT(YEAR FROM date)::INT
             ELSE EXTRACT(YEAR FROM date)::INT - 1 END
    ) STORED,
    fiscal_month SMALLINT GENERATED ALWAYS AS (
        CASE WHEN EXTRACT(MONTH FROM date) >= 7
             THEN EXTRACT(MONTH FROM date)::INT - 6
             ELSE EXTRACT(MONTH FROM date)::INT + 6 END
    ) STORED,
    recorded_by UUID NOT NULL REFERENCES administrators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dividend_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    fiscal_year INT NOT NULL,
    savings_dividend NUMERIC(12,2) NOT NULL DEFAULT 0,
    share_dividend NUMERIC(12,2) NOT NULL DEFAULT 0,
    date_calculated DATE NOT NULL DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, fiscal_year)
);

CREATE TABLE member_exits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL UNIQUE REFERENCES members(id),
    exit_date DATE NOT NULL,
    savings_returned NUMERIC(12,2) NOT NULL,
    shares_returned NUMERIC(12,2) NOT NULL,
    dividend_owed NUMERIC(12,2) NOT NULL,
    government_withholding NUMERIC(12,2) NOT NULL,
    net_amount_paid NUMERIC(12,2) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    loan_id UUID REFERENCES loans(id),
    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN (
        'payment_due', 'meeting', 'news', 'loan_status'
    )),
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_member_unread
    ON notifications (member_id) WHERE is_read = false;

CREATE OR REPLACE VIEW monthly_summary AS
SELECT
    member_id,
    fiscal_year,
    fiscal_month,
    SUM(amount) FILTER (WHERE type = 'savings_deposit') AS total_savings,
    SUM(amount) FILTER (WHERE type = 'share_purchase') AS total_shares,
    SUM(amount) FILTER (WHERE type = 'loan_installment') AS total_installments,
    SUM(amount) FILTER (WHERE type = 'loan_interest') AS total_interest,
    SUM(amount) FILTER (WHERE type = 'penalty_payment') AS total_penalties,
    SUM(amount) FILTER (WHERE type NOT IN (
        'member_exit_payout', 'bank_interest_income',
        'opening_savings_balance', 'opening_share_balance'
    )) AS total_collected,
    SUM(amount) FILTER (WHERE type = 'member_exit_payout') AS total_payouts,
    SUM(amount) FILTER (WHERE type = 'bank_interest_income') AS total_bank_interest
FROM transactions
GROUP BY member_id, fiscal_year, fiscal_month;
