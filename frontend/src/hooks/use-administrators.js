import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createAdministrator, getAdministrators } from "@/api/administrators"

export function useAdministrators() {
  return useQuery({ queryKey: ["administrators"], queryFn: getAdministrators })
}

export function useCreateAdministrator() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createAdministrator,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["administrators"] }),
  })
}
