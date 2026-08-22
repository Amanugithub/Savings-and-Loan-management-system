ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_amount_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type IN (
  'savings_deposit', 'share_purchase', 'penalty_payment',
  'registration_fee', 'card_fee', 'loan_disbursement',
  'loan_installment', 'loan_interest', 'loan_insurance',
  'member_exit_payout'
));
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_check
  CHECK (amount > 0 OR type = 'member_exit_payout');

CREATE OR REPLACE VIEW monthly_summary AS
SELECT
    member_id,
    fiscal_year,
    fiscal_month,
    SUM(amount) FILTER (WHERE type = 'savings_deposit') AS total_savings,
    SUM(amount) FILTER (WHERE type = 'share_purchase') AS total_shares,
    SUM(amount) FILTER (WHERE type = 'loan_installment') AS total_installments,
    SUM(amount) FILTER (WHERE type = 'loan_interest') AS total_interest,
    SUM(amount) FILTER (WHERE type = 'penalty_payment') AS total_penalties,
    SUM(amount) FILTER (WHERE type NOT IN ('member_exit_payout', 'bank_interest_income')) AS total_collected,
    SUM(amount) FILTER (WHERE type = 'member_exit_payout') AS total_payouts
FROM transactions
GROUP BY member_id, fiscal_year, fiscal_month;
