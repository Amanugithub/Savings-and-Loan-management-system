import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createMember, getMember, getMembers, resetMemberPassword, updateMember } from "@/api/members"

export function useMembers() {
  return useQuery({ queryKey: ["members"], queryFn: getMembers })
}

export function useMember(id) {
  return useQuery({ queryKey: ["members", id], queryFn: () => getMember(id), enabled: Boolean(id) })
}

export function useCreateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateMember,
    onSuccess: (member) => {
      queryClient.setQueryData(["members", member.id], member)
      queryClient.invalidateQueries({ queryKey: ["members"] })
    },
  })
}

export function useResetMemberPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetMemberPassword,
    onSuccess: (result) => {
      queryClient.setQueryData(["members", result.member.id], result.member)
      queryClient.invalidateQueries({ queryKey: ["members"] })
    },
  })
}
