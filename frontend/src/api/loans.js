import { apiRequest } from "@/api/client"

export function getLoans(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return apiRequest(`/loans?${params.toString()}`)
}

export function getLoan(id) {
  return apiRequest(`/loans/${id}`)
}

// Returns { data: loan, warnings: [...] }
export function createLoan(payload) {
  return apiRequest("/loans", { method: "POST", body: JSON.stringify(payload) })
}

export function respondAsGuarantor({ id, decision }) {
  return apiRequest(`/loans/${id}/guarantor-response`, { method: "PATCH", body: JSON.stringify({ decision }) })
}

export function recommendLoan(id) {
  return apiRequest(`/loans/${id}/recommend`, { method: "PATCH" })
}

export function declineRecommendation(id) {
  return apiRequest(`/loans/${id}/decline-recommendation`, { method: "PATCH" })
}

export function committeeApprove(id) {
  return apiRequest(`/loans/${id}/committee-approve`, { method: "PATCH" })
}

export function committeeReject(id) {
  return apiRequest(`/loans/${id}/committee-reject`, { method: "PATCH" })
}

// Returns { loan, installments }
export function disburseLoan({ id, disbursement_date }) {
  return apiRequest(`/loans/${id}/disburse`, { method: "PATCH", body: JSON.stringify({ disbursement_date }) })
}

// Returns { payment, allocations, installments, outstanding_balance }
export function recordLoanPayment({ id, amount, date, notes, idempotencyKey, payment_method, allocation_mode }) {
  return apiRequest(`/loans/${id}/payments`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ amount, date, notes, payment_method, allocation_mode }),
  })
}

export function previewLoanPayment({ id, amount, payment_method, allocation_mode }) {
  return apiRequest(`/loans/${id}/payments/preview`, {
    method: "POST",
    body: JSON.stringify({ amount, payment_method, allocation_mode }),
  })
}
