-- Migration 001
-- Loan workflow, administrator roles, and legacy status transition.
--
-- The migration runner must provide:
--   migration_admin_role_map(admin_id, role)
--   migration_loan_stage_map(loan_id, status)
--
-- These temporary mapping tables are populated from environment-backed
-- legacy mappings before this migration is executed.

-- ============================================================
-- Administrator roles
-- ============================================================

ALTER TABLE administrators
    ADD COLUMN role VARCHAR(30);

UPDATE administrators a
SET role = m.role
FROM migration_admin_role_map m
WHERE m.admin_id = a.id;

ALTER TABLE administrators
    ALTER COLUMN role SET NOT NULL;

ALTER TABLE administrators
    ADD CONSTRAINT administrators_role_check
    CHECK (
        role IN (
            'chairperson',
            'vice_chairperson',
            'loan_committee',
            'cashier',
            'accountant',
            'general_manager',
            'control_audit_committee'
        )
    );

-- ============================================================
-- Loan legacy status transition
-- ============================================================

UPDATE loans l
SET status = m.status
FROM migration_loan_stage_map m
WHERE l.id = m.loan_id
  AND l.status = 'pending';

UPDATE loans
SET status = CASE
    WHEN guarantor_member_id IS NOT NULL
        THEN 'awaiting_guarantor'
    ELSE 'awaiting_recommendation'
END
WHERE status = 'pending';

-- ============================================================
-- Loan workflow columns
-- ============================================================

ALTER TABLE loans
    ADD COLUMN guarantor_responded_at TIMESTAMPTZ,
    ADD COLUMN recommended_by UUID REFERENCES administrators(id),
    ADD COLUMN recommended_at TIMESTAMPTZ,
    ADD COLUMN declined_by UUID REFERENCES administrators(id),
    ADD COLUMN declined_at TIMESTAMPTZ,
    ADD COLUMN approved_by UUID REFERENCES administrators(id),
    ADD COLUMN approved_at TIMESTAMPTZ,
    ADD COLUMN disbursed_by UUID REFERENCES administrators(id),
    ADD COLUMN collateral_document_ref VARCHAR(255),
    ADD COLUMN collateral_certifying_authority VARCHAR(255);

-- ============================================================
-- Replace legacy loan constraints
-- ============================================================

ALTER TABLE loans
    DROP CONSTRAINT IF EXISTS loans_collateral_type_check;

ALTER TABLE loans
    DROP CONSTRAINT IF EXISTS loans_status_check;

ALTER TABLE loans
    ALTER COLUMN collateral_type DROP NOT NULL;

ALTER TABLE loans
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE loans
    ADD CONSTRAINT loans_status_check
    CHECK (
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
    );

ALTER TABLE loans
    ADD CONSTRAINT loans_collateral_type_check
    CHECK (
        collateral_type IS NULL
        OR collateral_type IN ('guarantor', 'property')
    );

ALTER TABLE loans
    ADD CONSTRAINT loans_regular_collateral_check
    CHECK (
        type = 'self_secured'
        OR collateral_type IN ('guarantor', 'property')
    );

ALTER TABLE loans
    ADD CONSTRAINT loans_guarantor_collateral_check
    CHECK (
        collateral_type <> 'guarantor'
        OR guarantor_member_id IS NOT NULL
    );

-- ============================================================
-- Live-loan uniqueness
-- ============================================================

DROP INDEX IF EXISTS uq_guarantor_one_active_loan;
DROP INDEX IF EXISTS uq_member_one_active_loan;
DROP INDEX IF EXISTS uq_guarantor_one_live_loan;
DROP INDEX IF EXISTS uq_member_one_live_loan;

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

-- ============================================================
-- Loan lookup indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_loans_guarantor
    ON loans (guarantor_member_id);

CREATE INDEX IF NOT EXISTS idx_loans_member
    ON loans (member_id);

CREATE INDEX IF NOT EXISTS idx_loans_status
    ON loans (status);

-- ============================================================
-- Notifications
-- ============================================================

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (
        type IN (
            'payment_due',
            'meeting',
            'news',
            'loan_status',
            'guarantor_request'
        )
    );