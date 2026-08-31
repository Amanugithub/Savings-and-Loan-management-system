import { apiRequest } from "@/api/client"
import { ethiopianFiscalYearToGregorian } from "@/lib/ethiopian-calendar"

export function getDividendPreview(fiscalYear) {
  return apiRequest(`/dividend-history/preview/${ethiopianFiscalYearToGregorian(fiscalYear)}`)
}

export function calculateDividends(fiscalYear) {
  return apiRequest(`/dividend-history/calculate/${ethiopianFiscalYearToGregorian(fiscalYear)}`, { method: "POST" })
}

export function getDividendHistory(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    const nextValue = key === "fiscal_year" ? ethiopianFiscalYearToGregorian(value) : value
    if (nextValue !== undefined && nextValue !== null && nextValue !== "") params.set(key, nextValue)
  })
  const query = params.toString()
  return apiRequest(`/dividend-history${query ? `?${query}` : ""}`)
}

export function getDividend(id) {
  return apiRequest(`/dividend-history/${id}`)
}
