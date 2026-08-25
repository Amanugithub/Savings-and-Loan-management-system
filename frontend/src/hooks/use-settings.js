import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { changePassword, getSyncStatus, runSync } from "@/api/settings"

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword })
}

export function useSyncStatus() {
  return useQuery({ queryKey: ["sync-status"], queryFn: getSyncStatus })
}

export function useRunSync() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: runSync, onSuccess: (result) => { queryClient.setQueryData(["sync-status"], result.health || result); queryClient.invalidateQueries({ queryKey: ["sync-status"] }) } })
}
