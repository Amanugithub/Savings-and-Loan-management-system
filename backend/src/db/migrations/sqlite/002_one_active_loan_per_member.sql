-- A member may have at most one active loan at a time.
-- Pending loans are allowed so applications can be reviewed independently.

-- First, check for existing duplicate active loans per member.
-- If duplicates exist, the migration must fail with a clear error message.
-- The administrator must resolve duplicates manually before proceeding.
SELECT CASE
    WHEN (SELECT COUNT(*) FROM (
        SELECT member_id
        FROM loans
        WHERE status = 'active'
        GROUP BY member_id
        HAVING COUNT(*) > 1
    )) > 0
    THEN RAISE(ABORT, 'Migration failed: Duplicate active loans detected. A member cannot have more than one active loan. Please resolve duplicates manually before running this migration.')
END;

CREATE UNIQUE INDEX uq_member_one_active_loan
    ON loans (member_id)
    WHERE status = 'active';
