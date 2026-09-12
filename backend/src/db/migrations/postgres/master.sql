-- Savings and Loan Management System — consolidated PostgreSQL schema
-- Final schema represented by the former PostgreSQL migrations 001–004.
-- Run this file against a new PostgreSQL/Supabase database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- MEMBERS
-- ============================================================

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
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- ADMINISTRATORS
-- ============================================================

CREATE TABLE administrators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    role VARCHAR(30) NOT NULL CHECK (role IN (
        'chairperson',
        'vice_chairperson',
        'loan_committee',
        'cashier',
        'accountant',
        'general_manager',
        'control_audit_committee'
    )),

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- ============================================================
-- LOANS
-- ============================================================

CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    guarantor_member_id UUID REFERENCES members(id),

    type VARCHAR(20) NOT NULL
        CHECK (type IN ('regular', 'self_secured')),

    principal_amount NUMERIC(12,2) NOT NULL
        CHECK (principal_amount > 0),

    term_years INT NOT NULL
        CHECK (term_years IN (1, 2, 3, 4, 5)),

    interest_rate NUMERIC(5,2) NOT NULL,
    monthly_installment NUMERIC(12,2) NOT NULL,
    monthly_interest_amount NUMERIC(12,2) NOT NULL,
    insurance_amount NUMERIC(12,2) NOT NULL,

    collateral_type VARCHAR(20)
        CHECK (
            collateral_type IS NULL
            OR collateral_type IN ('guarantor', 'property')
        ),

    disbursement_date DATE,

    status VARCHAR(30) NOT NULL CHECK (
        status IN (
            'awaiting_guarantor',
            'guarantor_declined',
            'awaiting_recommendation',
            'recommendation_declined',
            'awaiting_committee_approval',
            'rejected',
            'approved',
            'active',
            'closed'
        )
    ),

    guarantor_responded_at TIMESTAMPTZ,

    recommended_by UUID REFERENCES administrators(id),
    recommended_at TIMESTAMPTZ,

    declined_by UUID REFERENCES administrators(id),
    declined_at TIMESTAMPTZ,

    approved_by UUID REFERENCES administrators(id),
    approved_at TIMESTAMPTZ,

    disbursed_by UUID REFERENCES administrators(id),

    collateral_document_ref VARCHAR(255),
    collateral_certifying_authority VARCHAR(255),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,

    CONSTRAINT chk_guarantor_not_self
        CHECK (
            guarantor_member_id IS NULL
            OR guarantor_member_id <> member_id
        ),

    CONSTRAINT chk_regular_loan_collateral
        CHECK (
            type = 'self_secured'
            OR collateral_type IN ('guarantor', 'property')
        ),

    CONSTRAINT chk_guarantor_collateral
        CHECK (
            collateral_type <> 'guarantor'
            OR guarantor_member_id IS NOT NULL
        )
);

CREATE UNIQUE INDEX uq_guarantor_one_live_loan
    ON loans (guarantor_member_id)
    WHERE guarantor_member_id IS NOT NULL
      AND status IN (
          'awaiting_guarantor',
          'awaiting_recommendation',
          'awaiting_committee_approval',
          'approved',
          'active'
      );

CREATE UNIQUE INDEX uq_member_one_live_loan
    ON loans (member_id)
    WHERE status IN (
        'awaiting_guarantor',
        'awaiting_recommendation',
        'awaiting_committee_approval',
        'approved',
        'active'
    );

CREATE INDEX idx_loans_member
    ON loans (member_id);

CREATE INDEX idx_loans_guarantor
    ON loans (guarantor_member_id);

CREATE INDEX idx_loans_status
    ON loans (status);

-- ============================================================
-- LOAN INSTALLMENTS
-- ============================================================

CREATE TABLE loan_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    installment_number INT NOT NULL CHECK (installment_number > 0),
    due_date DATE NOT NULL,

    principal_due NUMERIC(12,2) NOT NULL
        CHECK (principal_due >= 0),

    interest_due NUMERIC(12,2) NOT NULL
        CHECK (interest_due >= 0),

    insurance_due NUMERIC(12,2) NOT NULL
        CHECK (insurance_due >= 0),

    principal_paid NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (principal_paid >= 0),

    interest_paid NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (interest_paid >= 0),

    insurance_paid NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (insurance_paid >= 0),

    status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
        CHECK (status IN ('unpaid', 'partially_paid', 'paid')),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,

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

-- ============================================================
-- LOAN PENALTIES
-- ============================================================

CREATE TABLE loan_penalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    penalty_period VARCHAR(20) NOT NULL,
    calculation_date DATE NOT NULL,

    basis_amount NUMERIC(12,2) NOT NULL
        CHECK (basis_amount >= 0),

    rate NUMERIC(5,4) NOT NULL DEFAULT 0.02
        CHECK (rate = 0.02),

    amount NUMERIC(12,2) NOT NULL
        CHECK (amount >= 0),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,

    UNIQUE (loan_id, penalty_period)
);

CREATE INDEX idx_loan_penalties_loan_period
    ON loan_penalties (loan_id, penalty_period);

CREATE INDEX idx_loan_penalties_unsynced
    ON loan_penalties (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- LOAN PAYMENTS
-- ============================================================

CREATE TABLE loan_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID NOT NULL REFERENCES loans(id),
    member_id UUID NOT NULL REFERENCES members(id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL,
    recorded_by UUID NOT NULL REFERENCES administrators(id),
    notes VARCHAR(255),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_loan_payments_loan_date
    ON loan_payments (loan_id, payment_date);

CREATE INDEX idx_loan_payments_member
    ON loan_payments (member_id);

CREATE INDEX idx_loan_payments_unsynced
    ON loan_payments (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- LOAN PAYMENT ALLOCATIONS
-- ============================================================

CREATE TABLE loan_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES loan_payments(id),
    loan_id UUID NOT NULL REFERENCES loans(id),

    bucket VARCHAR(30) NOT NULL CHECK (
        bucket IN (
            'collection_expense',
            'interest_penalty',
            'principal'
        )
    ),

    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),

    installment_id UUID REFERENCES loan_installments(id),
    penalty_id UUID REFERENCES loan_penalties(id),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

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

-- ============================================================
-- TRANSACTIONS
-- ============================================================

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES members(id),
    loan_id UUID REFERENCES loans(id),
    recorded_by UUID NOT NULL REFERENCES administrators(id),

    type VARCHAR(30) NOT NULL CHECK (type IN (
        'savings_deposit',
        'share_purchase',
        'opening_savings_balance',
        'opening_share_balance',
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

    amount NUMERIC(12,2) NOT NULL
        CHECK (amount > 0 OR type = 'member_exit_payout'),

    date DATE NOT NULL DEFAULT CURRENT_DATE,

    fiscal_year SMALLINT GENERATED ALWAYS AS (
        CASE
            WHEN EXTRACT(MONTH FROM date) >= 7
                THEN EXTRACT(YEAR FROM date)::INT
            ELSE EXTRACT(YEAR FROM date)::INT - 1
        END
    ) STORED,

    fiscal_month SMALLINT GENERATED ALWAYS AS (
        CASE
            WHEN EXTRACT(MONTH FROM date) >= 7
                THEN EXTRACT(MONTH FROM date)::INT - 6
            ELSE EXTRACT(MONTH FROM date)::INT + 6
        END
    ) STORED,

    notes VARCHAR(255),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_member_date
    ON transactions (member_id, date);

CREATE INDEX idx_transactions_loan
    ON transactions (loan_id);

CREATE UNIQUE INDEX uq_member_one_opening_savings
    ON transactions (member_id)
    WHERE type = 'opening_savings_balance';

CREATE UNIQUE INDEX uq_member_one_opening_shares
    ON transactions (member_id)
    WHERE type = 'opening_share_balance';

CREATE INDEX idx_transactions_unsynced
    ON transactions (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category VARCHAR(20) NOT NULL CHECK (category IN (
        'supplies',
        'utilities',
        'rent',
        'maintenance',
        'equipment',
        'other'
    )),

    description VARCHAR(255),

    amount NUMERIC(12,2) NOT NULL
        CHECK (amount > 0),

    date DATE NOT NULL DEFAULT CURRENT_DATE,

    fiscal_year SMALLINT GENERATED ALWAYS AS (
        CASE
            WHEN EXTRACT(MONTH FROM date) >= 7
                THEN EXTRACT(YEAR FROM date)::INT
            ELSE EXTRACT(YEAR FROM date)::INT - 1
        END
    ) STORED,

    fiscal_month SMALLINT GENERATED ALWAYS AS (
        CASE
            WHEN EXTRACT(MONTH FROM date) >= 7
                THEN EXTRACT(MONTH FROM date)::INT - 6
            ELSE EXTRACT(MONTH FROM date)::INT + 6
        END
    ) STORED,

    recorded_by UUID NOT NULL REFERENCES administrators(id),
    loan_id UUID REFERENCES loans(id),

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_loan
    ON expenses (loan_id);

CREATE INDEX idx_expenses_unsynced
    ON expenses (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- DIVIDEND HISTORY
-- ============================================================

CREATE TABLE dividend_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES members(id),
    fiscal_year INT NOT NULL,

    savings_dividend NUMERIC(12,2) NOT NULL DEFAULT 0,
    share_dividend NUMERIC(12,2) NOT NULL DEFAULT 0,

    date_calculated DATE NOT NULL DEFAULT CURRENT_DATE,

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (member_id, fiscal_year)
);

CREATE INDEX idx_dividend_history_unsynced
    ON dividend_history (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- MEMBER EXITS
-- ============================================================

CREATE TABLE member_exits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL UNIQUE REFERENCES members(id),

    exit_date DATE NOT NULL,

    savings_returned NUMERIC(12,2) NOT NULL,
    shares_returned NUMERIC(12,2) NOT NULL,
    dividend_owed NUMERIC(12,2) NOT NULL,
    government_withholding NUMERIC(12,2) NOT NULL,
    net_amount_paid NUMERIC(12,2) NOT NULL,

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_member_exits_unsynced
    ON member_exits (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    member_id UUID NOT NULL REFERENCES members(id),
    loan_id UUID REFERENCES loans(id),

    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,

    type VARCHAR(30) NOT NULL CHECK (type IN (
        'payment_due',
        'meeting',
        'news',
        'loan_status',
        'guarantor_request'
    )),

    is_read BOOLEAN NOT NULL DEFAULT false,

    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_member_unread
    ON notifications (member_id)
    WHERE is_read = false;

CREATE INDEX idx_notifications_unsynced
    ON notifications (synced_at)
    WHERE synced_at IS NULL;

-- ============================================================
-- MONTHLY SUMMARY VIEW
-- ============================================================

CREATE OR REPLACE VIEW monthly_summary AS
SELECT
    member_id,
    fiscal_year,
    fiscal_month,

    SUM(amount) FILTER (
        WHERE type = 'savings_deposit'
    ) AS total_savings,

    SUM(amount) FILTER (
        WHERE type = 'share_purchase'
    ) AS total_shares,

    SUM(amount) FILTER (
        WHERE type = 'loan_installment'
    ) AS total_installments,

    SUM(amount) FILTER (
        WHERE type = 'loan_interest'
    ) AS total_interest,

    SUM(amount) FILTER (
        WHERE type = 'penalty_payment'
    ) AS total_penalties,

    SUM(amount) FILTER (
        WHERE type NOT IN (
            'member_exit_payout',
            'bank_interest_income',
            'opening_savings_balance',
            'opening_share_balance'
        )
    ) AS total_collected,

    SUM(amount) FILTER (
        WHERE type = 'member_exit_payout'
    ) AS total_payouts,

    SUM(amount) FILTER (
        WHERE type = 'bank_interest_income'
    ) AS total_bank_interest

FROM transactions
GROUP BY
    member_id,
    fiscal_year,
    fiscal_month;