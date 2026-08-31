import { apiRequest } from "@/api/client"

export function getTransactions(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value)
  })
  return apiRequest(`/transactions?${params.toString()}`)
}

export function getTransactionBalances(memberId) {
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : ""
  return apiRequest(`/transactions/balances${query}`)
}

export function createTransaction(payload) {
  return apiRequest("/transactions", { method: "POST", body: JSON.stringify(payload) })
}

export function getTransactionSummary({ memberId, fiscalYear, fiscalMonth }) {
  return apiRequest(`/transactions/summary/${memberId}/${fiscalYear}/${fiscalMonth}`)
}
