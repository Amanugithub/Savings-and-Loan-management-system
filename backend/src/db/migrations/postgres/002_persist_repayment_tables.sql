-- Migration 002
-- Persist loan repayment schedules, penalties, payments,
-- payment allocations, and loan-linked expenses.

-- ============================================================
-- Loan installments / repayment schedule
-- ============================================================

CREATE TABLE loan_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    loan_id UUID NOT NULL
        REFERENCES loans(id),

    installment_number INTEGER NOT NULL
        CHECK (installment_number > 0),

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
        CHECK (
            status IN (
                'unpaid',
                'partially_paid',
                'paid'
            )
        ),

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
    ON loan_installments (loan_id)
    WHERE synced_at IS NULL;


-- ============================================================
-- Loan penalties
-- ============================================================

CREATE TABLE loan_penalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    loan_id UUID NOT NULL
        REFERENCES loans(id),

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

CREATE INDEX idx_loan_penalties_loan
    ON loan_penalties (loan_id);

CREATE INDEX idx_loan_penalties_calculation_date
    ON loan_penalties (calculation_date);

CREATE INDEX idx_loan_penalties_unsynced
    ON loan_penalties (loan_id)
    WHERE synced_at IS NULL;


-- ============================================================
-- Loan payments
-- ============================================================

CREATE TABLE loan_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    loan_id UUID NOT NULL
        REFERENCES loans(id),

    member_id UUID NOT NULL
        REFERENCES members(id),

    amount NUMERIC(12,2) NOT NULL
        CHECK (amount > 0),

    payment_date DATE NOT NULL,

    recorded_by UUID NOT NULL
        REFERENCES administrators(id),

    notes VARCHAR(255),

    synced_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_loan_payments_loan_date
    ON loan_payments (loan_id, payment_date);

CREATE INDEX idx_loan_payments_member
    ON loan_payments (member_id);

CREATE INDEX idx_loan_payments_recorded_by
    ON loan_payments (recorded_by);

CREATE INDEX idx_loan_payments_unsynced
    ON loan_payments (loan_id)
    WHERE synced_at IS NULL;


-- ============================================================
-- Payment allocation
-- ============================================================

CREATE TABLE loan_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_id UUID NOT NULL
        REFERENCES loan_payments(id),

    loan_id UUID NOT NULL
        REFERENCES loans(id),

    bucket VARCHAR(30) NOT NULL
        CHECK (
            bucket IN (
                'collection_expense',
                'interest_penalty',
                'principal'
            )
        ),

    amount NUMERIC(12,2) NOT NULL
        CHECK (amount > 0),

    installment_id UUID
        REFERENCES loan_installments(id),

    penalty_id UUID
        REFERENCES loan_penalties(id),

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
    ON loan_payment_allocations (loan_id)
    WHERE synced_at IS NULL;


-- ============================================================
-- Link expenses to loans
-- ============================================================

ALTER TABLE expenses
    ADD COLUMN loan_id UUID REFERENCES loans(id);

CREATE INDEX idx_expenses_loan
    ON expenses (loan_id);