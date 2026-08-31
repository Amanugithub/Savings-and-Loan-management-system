const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000/api"

const REQUEST_TIMEOUT = 10000

function getUserFriendlyMessage(status, backendMessage) {
  // Authentication error
  if (status === 401) {
    return "Invalid username or password."
  }

  // Permission error
  if (status === 403) {
    return "You are not authorized to perform this action."
  }

  // Server errors
  if (status >= 500) {
    return "The server is unavailable. Check that the backend is running and try again."
  }

  // Keep useful backend validation messages
  if (backendMessage) {
    return backendMessage
  }

  return "The request could not be completed. Please try again."
}

export async function apiRequest(path, options = {}) {
  const token = window.localStorage.getItem("sacco_token")

  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT)

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      const backendMessage =
        typeof body?.error === "string" ? body.error : null

      const error = new Error(
        getUserFriendlyMessage(response.status, backendMessage)
      )

      // Keep HTTP status available for debugging
      error.status = response.status

      // Keep original backend message internally
      error.backendMessage = backendMessage

      if (import.meta.env.DEV) {
        console.error("API request failed:", {
          path,
          status: response.status,
          backendMessage,
        })
      }

      throw error
    }

    return body
  } catch (error) {
    // Request timed out
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        "The request timed out. Please try again."
      )

      timeoutError.code = "TIMEOUT"

      if (import.meta.env.DEV) {
        console.error("API request timed out:", {
          path,
        })
      }

      throw timeoutError
    }

    // Backend unavailable / network failure
    if (error instanceof TypeError) {
      const networkError = new Error(
        "The server is unavailable. Check that the backend is running and try again."
      )

      networkError.code = "NETWORK_ERROR"

      if (import.meta.env.DEV) {
        console.error("Network request failed:", {
          path,
          originalError: error,
        })
      }

      throw networkError
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}