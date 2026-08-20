CREATE TABLE sync_state (
    table_name         TEXT PRIMARY KEY,
    cursor_updated_at  TEXT NOT NULL,
    cursor_id          TEXT NOT NULL
);
