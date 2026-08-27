import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createLoan, getLoan, getLoans, updateLoanStatus } from "@/api/loans"

export function useLoans(filters) {
  return useQuery({ queryKey: ["loans", filters], queryFn: () => getLoans(filters) })
}

export function useLoan(id) {
  return useQuery({ queryKey: ["loans", id], queryFn: () => getLoan(id), enabled: Boolean(id) })
}

export function useCreateLoan() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: createLoan, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loans"] }) })
}

export function useUpdateLoanStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateLoanStatus,
    onSuccess: (loan) => {
      queryClient.setQueryData(["loans", loan.id], loan)
      queryClient.invalidateQueries({ queryKey: ["loans"] })
    },
  })
}
