// Mirrors the backend's role gates (backend/src/middleware/roles.js,
// backend/src/routes/loans.js, transactions.js, administrators.js,
// expenses.js) so the UI can hide controls a role can't use. The backend's
// own 403 is still the real security boundary — this only avoids showing
// someone a button that would just bounce.

export const CHAIR_LEVEL = ["chairperson", "vice_chairperson"]
export const INTAKE_LEVEL = ["cashier", "general_manager"]

export const ROLE_LABELS = {
  chairperson: "Chairperson",
  vice_chairperson: "Vice chairperson",
  loan_committee: "Loan committee",
  cashier: "Cashier",
  accountant: "Accountant",
  general_manager: "General manager",
  control_audit_committee: "Control & audit committee",
}

export const ROLES = Object.keys(ROLE_LABELS)

// Ordered so a status timeline can be laid out left-to-right; terminal
// (dead-end) statuses are flagged so the UI can style them distinctly.
export const LOAN_STATUSES = [
  { value: "awaiting_guarantor", label: "Awaiting guarantor", variant: "secondary" },
  { value: "guarantor_declined", label: "Guarantor declined", variant: "destructive", terminal: true },
  { value: "awaiting_recommendation", label: "Awaiting recommendation", variant: "secondary" },
  { value: "recommendation_declined", label: "Recommendation declined", variant: "destructive", terminal: true },
  { value: "awaiting_committee_approval", label: "Awaiting committee approval", variant: "secondary" },
  { value: "rejected", label: "Rejected", variant: "destructive", terminal: true },
  { value: "approved", label: "Approved", variant: "default" },
  { value: "active", label: "Active", variant: "default" },
  { value: "closed", label: "Closed", variant: "outline", terminal: true },
]

export const LOAN_STATUS_LABELS = Object.fromEntries(LOAN_STATUSES.map((s) => [s.value, s.label]))
export const LOAN_STATUS_VARIANTS = Object.fromEntries(LOAN_STATUSES.map((s) => [s.value, s.variant]))

// Still moving through the approval pipeline — not yet disbursed, not dead.
export const IN_REVIEW_STATUSES = LOAN_STATUSES.filter((s) => !s.terminal && s.value !== "active").map((s) => s.value)

export function canCreateLoan(role) {
  return INTAKE_LEVEL.includes(role)
}

// Any active administrator may record an office-side guarantor response —
// the backend only requires a valid, active admin, not a specific role.
export function canRespondAsGuarantor() {
  return true
}

export function canRecommend(role) {
  return CHAIR_LEVEL.includes(role)
}

export function canCommitteeDecide(role) {
  return role === "loan_committee"
}

export function canDisburse(role) {
  return role === "cashier"
}

export function canRecordPayment(role) {
  return role === "cashier"
}

export function canManageAdministrators(role) {
  return CHAIR_LEVEL.includes(role) || role === "general_manager"
}

export function canRecordExpense(role) {
  return role === "accountant"
}

// Transaction types a cashier can post via the generic ledger endpoint.
// Loan repayment types (loan_installment/loan_interest/loan_insurance/
// penalty_payment) are deliberately excluded — those now go through the
// payment waterfall (POST /api/loans/:id/payments) instead.
export const CASHIER_TRANSACTION_TYPES = [
  "savings_deposit",
  "share_purchase",
  "opening_savings_balance",
  "opening_share_balance",
  "registration_fee",
  "card_fee",
]
export const ACCOUNTANT_TRANSACTION_TYPES = ["bank_interest_income"]

export function transactionTypesForRole(role) {
  if (role === "accountant") return ACCOUNTANT_TRANSACTION_TYPES
  if (role === "cashier") return CASHIER_TRANSACTION_TYPES
  return []
}

export function canRecordTransaction(role) {
  return transactionTypesForRole(role).length > 0
}
