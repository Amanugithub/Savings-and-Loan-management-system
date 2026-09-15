-- Migration 006: monthly_installment is the full scheduled payment.

UPDATE loans
SET monthly_installment = ROUND(
  principal_amount / (term_years * 12)
  + monthly_interest_amount
  + insurance_amount / (term_years * 12),
  2
);
