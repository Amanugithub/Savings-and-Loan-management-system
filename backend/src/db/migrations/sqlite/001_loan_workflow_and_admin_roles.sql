-- Migration 001
-- Loan workflow, administrator roles, and legacy status transition.

-- ------------------------------------------------------------
-- Administrator roles
-- ------------------------------------------------------------

ALTER TABLE administrators
ADD COLUMN role TEXT;

UPDATE administrators
SET role = (
    SELECT role
    FROM migration_admin_role_map
    WHERE migration_admin_role_map.admin_id = administrators.id
);

CREATE TABLE administrators_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (
        role IN (
            'chairperson',
            'vice_chairperson',
            'loan_committee',
            'cashier',
            'accountant',
            'general_manager',
            'control_audit_committee'
        )
    ),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);

INSERT INTO administrators_new (
    id,
    name,
    username,
    password_hash,
    role,
    status,
    synced_at,
    created_at,
    updated_at
)
SELECT
    id,
    name,
    username,
    password_hash,
    role,
    status,
    synced_at,
    created_at,
    updated_at
FROM administrators;

DROP TABLE administrators;

ALTER TABLE administrators_new
RENAME TO administrators;

-- ------------------------------------------------------------
-- Legacy loan workflow mapping
-- ------------------------------------------------------------

UPDATE loans
SET status = (
    SELECT status
    FROM migration_loan_stage_map
    WHERE migration_loan_stage_map.loan_id = loans.id
)
WHERE status = 'pending'
  AND id IN (
      SELECT loan_id
      FROM migration_loan_stage_map
  );

UPDATE loans
SET status = CASE
    WHEN guarantor_member_id IS NOT NULL
        THEN 'awaiting_guarantor'
    ELSE 'awaiting_recommendation'
END
WHERE status = 'pending';

-- ------------------------------------------------------------
-- Loans
-- ------------------------------------------------------------

CREATE TABLE loans_new (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    guarantor_member_id TEXT REFERENCES members(id),

    type TEXT NOT NULL CHECK (
        type IN ('regular', 'self_secured')
    ),

    principal_amount NUMERIC NOT NULL CHECK (principal_amount > 0),

    term_years INTEGER NOT NULL CHECK (
        term_years IN (1, 2, 3, 4, 5)
    ),

    interest_rate NUMERIC NOT NULL,

    monthly_installment NUMERIC NOT NULL,

    monthly_interest_amount NUMERIC NOT NULL,

    insurance_amount NUMERIC NOT NULL,

    collateral_type TEXT CHECK (
        collateral_type IS NULL
        OR collateral_type IN ('guarantor', 'property')
    ),

    disbursement_date TEXT,

    status TEXT NOT NULL CHECK (
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

    guarantor_responded_at TEXT,

    recommended_by TEXT REFERENCES administrators(id),

    recommended_at TEXT,

    declined_by TEXT REFERENCES administrators(id),

    declined_at TEXT,

    approved_by TEXT REFERENCES administrators(id),

    approved_at TEXT,

    disbursed_by TEXT REFERENCES administrators(id),

    collateral_document_ref TEXT,

    collateral_certifying_authority TEXT,

    synced_at TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    updated_at TEXT,

    CHECK (
        guarantor_member_id IS NULL
        OR guarantor_member_id <> member_id
    ),

    CHECK (
        type = 'self_secured'
        OR collateral_type IN ('guarantor', 'property')
    ),

    CHECK (
        collateral_type <> 'guarantor'
        OR guarantor_member_id IS NOT NULL
    )
);

INSERT INTO loans_new (
    id,
    member_id,
    guarantor_member_id,
    type,
    principal_amount,
    term_years,
    interest_rate,
    monthly_installment,
    monthly_interest_amount,
    insurance_amount,
    collateral_type,
    disbursement_date,
    status,
    synced_at,
    created_at,
    updated_at
)
SELECT
    id,
    member_id,
    guarantor_member_id,
    type,
    principal_amount,
    term_years,
    interest_rate,
    monthly_installment,
    monthly_interest_amount,
    insurance_amount,
    collateral_type,
    disbursement_date,
    status,
    synced_at,
    created_at,
    updated_at
FROM loans;

DROP TABLE loans;

ALTER TABLE loans_new
RENAME TO loans;

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

-- ------------------------------------------------------------
-- Notifications
-- ------------------------------------------------------------

CREATE TABLE notifications_new (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    loan_id TEXT REFERENCES loans(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
        type IN (
            'payment_due',
            'meeting',
            'news',
            'loan_status',
            'guarantor_request'
        )
    ),
    is_read INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
);

INSERT INTO notifications_new (
    id,
    member_id,
    loan_id,
    title,
    message,
    type,
    is_read,
    synced_at,
    created_at,
    updated_at
)
SELECT
    id,
    member_id,
    loan_id,
    title,
    message,
    type,
    is_read,
    synced_at,
    created_at,
    updated_at
FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new
RENAME TO notifications;

CREATE INDEX idx_notifications_unsynced
    ON notifications (synced_at)
    WHERE synced_at IS NULL;

PRAGMA foreign_keys = ON;