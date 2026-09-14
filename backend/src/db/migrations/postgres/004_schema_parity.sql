-- Migration 004: make the PostgreSQL audit timestamp definitions explicit.

ALTER TABLE dividend_history
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE member_exits
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
