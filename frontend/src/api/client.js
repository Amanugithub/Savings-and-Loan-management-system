const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export async function apiRequest(path, options = {}) {
  const token = window.localStorage.getItem("sacco_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event("auth:session-expired"));
    }

    const error = new Error(
      body?.error || "The request could not be completed",
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
