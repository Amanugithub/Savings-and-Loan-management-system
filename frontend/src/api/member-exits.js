import { apiRequest } from "@/api/client"

export function getMemberExits(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  const query = params.toString()
  return apiRequest(`/member-exits${query ? `?${query}` : ""}`)
}

export function getMemberExit(id) {
  return apiRequest(`/member-exits/${id}`)
}

export function getMemberExitPreview({ memberId, exitDate }) {
  const query = exitDate ? `?exit_date=${encodeURIComponent(exitDate)}` : ""
  return apiRequest(`/member-exits/preview/${memberId}${query}`)
}

export function processMemberExit(payload) {
  return apiRequest("/member-exits", { method: "POST", body: JSON.stringify(payload) })
}
