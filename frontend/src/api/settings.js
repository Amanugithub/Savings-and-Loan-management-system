import { apiRequest } from "@/api/client"

export function changePassword(payload) {
  return apiRequest("/auth/password", { method: "PATCH", body: JSON.stringify(payload) })
}

export function getSyncStatus() {
  return apiRequest("/sync/status")
}

export function runSync() {
  return apiRequest("/sync", { method: "POST" })
}
