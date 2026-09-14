-- Migration 004: align SQLite audit timestamps with PostgreSQL.

ALTER TABLE dividend_history ADD COLUMN created_at TEXT;
UPDATE dividend_history
SET created_at = COALESCE(date_calculated, datetime('now'))
WHERE created_at IS NULL;

ALTER TABLE member_exits ADD COLUMN created_at TEXT;
UPDATE member_exits
SET created_at = COALESCE(exit_date, datetime('now'))
WHERE created_at IS NULL;
