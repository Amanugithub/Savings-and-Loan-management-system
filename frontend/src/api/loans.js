import { apiRequest } from "@/api/client"

export function getLoans(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return apiRequest(`/loans?${params.toString()}`)
}

export function getLoan(id) {
  return apiRequest(`/loans/${id}`)
}

export function createLoan(payload) {
  return apiRequest("/loans", { method: "POST", body: JSON.stringify(payload) })
}

export function updateLoanStatus({ id, status, disbursement_date }) {
  return apiRequest(`/loans/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, disbursement_date }) })
}
