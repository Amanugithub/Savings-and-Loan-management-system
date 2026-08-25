import { apiRequest } from "@/api/client"

export function getNotifications(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") params.set(key, value) })
  const query = params.toString()
  return apiRequest(`/notifications${query ? `?${query}` : ""}`)
}

export function getNotification(id) {
  return apiRequest(`/notifications/${id}`)
}

export function previewBroadcast(payload) {
  return apiRequest("/notifications/broadcast/preview", { method: "POST", body: JSON.stringify(payload) })
}

export function createNotification({ broadcast, ...payload }) {
  return apiRequest(broadcast ? "/notifications/broadcast" : "/notifications", { method: "POST", body: JSON.stringify(payload) })
}

export function markNotificationRead(id) {
  return apiRequest(`/notifications/${id}/read`, { method: "PATCH" })
}
