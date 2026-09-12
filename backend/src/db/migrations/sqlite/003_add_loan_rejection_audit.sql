ALTER TABLE loans ADD COLUMN rejected_by TEXT REFERENCES administrators(id);
ALTER TABLE loans ADD COLUMN rejected_at TEXT;
