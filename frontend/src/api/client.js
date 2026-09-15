const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api"

export async function apiRequest(path, options = {}) {
  const token = window.localStorage.getItem("sacco_token")
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.error || "The request could not be completed")
    error.status = response.status
    // Some endpoints attach extra context to a failure response (e.g. the
    // payment endpoint's `outstanding_balance` on a 409) — keep it
    // reachable without every caller re-parsing the body.
    Object.assign(error, body)
    throw error
  }
  return body
}
