import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createTransaction, getTransactionBalances, getTransactionSummary, getTransactions } from "@/api/transactions"

export function useTransactions(filters) {
  return useQuery({ queryKey: ["transactions", filters], queryFn: () => getTransactions(filters) })
}

export function useTransactionBalances(memberId) {
  return useQuery({ queryKey: ["transaction-balances", memberId || "all"], queryFn: () => getTransactionBalances(memberId), enabled: memberId === undefined || Boolean(memberId) })
}

export function useTransactionSummary(filters) {
  return useQuery({ queryKey: ["transaction-summary", filters], queryFn: () => getTransactionSummary(filters), enabled: Boolean(filters.memberId) })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] })
      queryClient.invalidateQueries({ queryKey: ["transaction-balances"] })
      queryClient.invalidateQueries({ queryKey: ["members"] })
    },
  })
}
