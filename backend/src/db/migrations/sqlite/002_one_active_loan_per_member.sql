-- A member may have at most one active loan at a time.
-- Pending loans are allowed so applications can be reviewed independently.

CREATE UNIQUE INDEX uq_member_one_active_loan
    ON loans (member_id)
    WHERE status = 'active';
