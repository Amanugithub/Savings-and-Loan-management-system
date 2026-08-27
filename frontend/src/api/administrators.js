import { apiRequest } from "@/api/client"

export function getAdministrators() {
  return apiRequest("/administrators")
}

export function createAdministrator(payload) {
  return apiRequest("/administrators", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}
