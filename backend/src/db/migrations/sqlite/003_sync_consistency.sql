-- Version fields make the local outbox optimistic: a row changed while it
-- is being uploaded must remain pending for the next sync pass.
ALTER TABLE administrators ADD COLUMN updated_at TEXT;
ALTER TABLE loans ADD COLUMN updated_at TEXT;
ALTER TABLE transactions ADD COLUMN updated_at TEXT;
ALTER TABLE expenses ADD COLUMN updated_at TEXT;
ALTER TABLE dividend_history ADD COLUMN updated_at TEXT;
ALTER TABLE member_exits ADD COLUMN updated_at TEXT;
ALTER TABLE notifications ADD COLUMN updated_at TEXT;

UPDATE administrators SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE loans SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE transactions SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE expenses SET updated_at = created_at WHERE updated_at IS NULL;
UPDATE dividend_history SET updated_at = date_calculated WHERE updated_at IS NULL;
UPDATE member_exits SET updated_at = exit_date WHERE updated_at IS NULL;
UPDATE notifications SET updated_at = created_at WHERE updated_at IS NULL;

CREATE TABLE sync_id_map (
    local_table TEXT NOT NULL,
    local_id TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    PRIMARY KEY (local_table, local_id)
);
