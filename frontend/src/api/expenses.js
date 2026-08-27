import { apiRequest } from "@/api/client"

export function getExpenses(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "all") params.set(key, value)
  })
  const query = params.toString()
  return apiRequest(`/expenses${query ? `?${query}` : ""}`)
}

export function getExpense(id) {
  return apiRequest(`/expenses/${id}`)
}

export function createExpense(payload) {
  return apiRequest("/expenses", { method: "POST", body: JSON.stringify(payload) })
}
