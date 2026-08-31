import { apiRequest } from "@/api/client"

export function getMembers() {
  return apiRequest("/members")
}

export function getMember(id) {
  return apiRequest(`/members/${id}`)
}

export function createMember(payload) {
  return apiRequest("/members", { method: "POST", body: JSON.stringify(payload) })
}

export function updateMember({ id, ...payload }) {
  return apiRequest(`/members/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
}

export function resetMemberPassword({ id, new_password }) {
  return apiRequest(`/members/${id}/password`, { method: "PATCH", body: JSON.stringify({ new_password }) })
}
