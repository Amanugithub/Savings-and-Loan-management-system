import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createNotification, getNotification, getNotifications, markNotificationRead, previewBroadcast } from "@/api/notifications"

export function useNotifications(filters) {
  return useQuery({ queryKey: ["notifications", filters], queryFn: () => getNotifications(filters) })
}

export function useNotification(id) {
  return useQuery({ queryKey: ["notifications", id], queryFn: () => getNotification(id), enabled: Boolean(id) })
}

export function usePreviewBroadcast() {
  return useMutation({ mutationFn: previewBroadcast })
}

export function useCreateNotification() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createNotification, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }) })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: markNotificationRead, onSuccess: (notification) => { queryClient.setQueryData(["notifications", notification.id], notification); queryClient.invalidateQueries({ queryKey: ["notifications"] }) } })
}
