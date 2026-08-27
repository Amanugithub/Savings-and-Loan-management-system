import { apiRequest } from "@/api/client"

export function getDividendPreview(fiscalYear) {
  return apiRequest(`/dividend-history/preview/${fiscalYear}`)
}

export function calculateDividends(fiscalYear) {
  return apiRequest(`/dividend-history/calculate/${fiscalYear}`, { method: "POST" })
}

export function getDividendHistory(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") params.set(key, value) })
  const query = params.toString()
  return apiRequest(`/dividend-history${query ? `?${query}` : ""}`)
}

export function getDividend(id) {
  return apiRequest(`/dividend-history/${id}`)
}
