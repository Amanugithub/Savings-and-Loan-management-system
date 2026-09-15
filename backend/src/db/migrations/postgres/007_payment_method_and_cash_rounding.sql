-- Migration 007: record payment method and make small cash rounding explicit.

ALTER TABLE loan_payments
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'cash';

ALTER TABLE loan_payments
  DROP CONSTRAINT IF EXISTS loan_payments_payment_method_check;

ALTER TABLE loan_payments
  ADD CONSTRAINT loan_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money'));

ALTER TABLE loan_payment_allocations
  DROP CONSTRAINT IF EXISTS loan_payment_allocations_bucket_check;

ALTER TABLE loan_payment_allocations
  ADD CONSTRAINT loan_payment_allocations_bucket_check
  CHECK (bucket IN (
    'collection_expense',
    'interest_penalty',
    'principal',
    'cash_rounding_adjustment'
  ));

UPDATE loans
SET monthly_installment = ROUND(
  (principal_amount
   + ROUND(principal_amount * interest_rate / 100, 2)
   + insurance_amount) / (term_years * 12),
  2
);
