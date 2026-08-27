import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createTransaction, getTransactionSummary, getTransactions } from "@/api/transactions"

export function useTransactions(filters) {
  return useQuery({ queryKey: ["transactions", filters], queryFn: () => getTransactions(filters) })
}

export function useTransactionSummary(filters) {
  return useQuery({ queryKey: ["transaction-summary", filters], queryFn: () => getTransactionSummary(filters), enabled: Boolean(filters.memberId) })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["transactions"] }),
  })
}
