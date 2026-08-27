import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { getMemberExit, getMemberExitPreview, getMemberExits, processMemberExit } from "@/api/member-exits"

export function useMemberExits(filters) {
  return useQuery({ queryKey: ["member-exits", filters], queryFn: () => getMemberExits(filters) })
}

export function useMemberExit(id) {
  return useQuery({ queryKey: ["member-exits", id], queryFn: () => getMemberExit(id), enabled: Boolean(id) })
}

export function useMemberExitPreview({ memberId, exitDate }) {
  return useQuery({ queryKey: ["member-exit-preview", memberId, exitDate], queryFn: () => getMemberExitPreview({ memberId, exitDate }), enabled: Boolean(memberId && exitDate) })
}

export function useProcessMemberExit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: processMemberExit,
    onSuccess: (record) => {
      queryClient.setQueryData(["member-exits", record.id], record)
      queryClient.invalidateQueries({ queryKey: ["member-exits"] })
      queryClient.invalidateQueries({ queryKey: ["members"] })
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
    },
  })
}
