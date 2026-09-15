-- Migration 005: allow collection expenses to be attached to a loan.

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_category_check CHECK (category IN (
    'supplies',
    'utilities',
    'rent',
    'maintenance',
    'equipment',
    'collection_expense',
    'other'
  ));
