import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createExpense, getExpense, getExpenses } from "@/api/expenses"

export function useExpenses(filters) {
  return useQuery({ queryKey: ["expenses", filters], queryFn: () => getExpenses(filters) })
}

export function useExpense(id) {
  return useQuery({ queryKey: ["expenses", id], queryFn: () => getExpense(id), enabled: Boolean(id) })
}

export function useCreateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createExpense,
    onSuccess: (expense) => {
      queryClient.setQueryData(["expenses", expense.id], expense)
      queryClient.invalidateQueries({ queryKey: ["expenses"] })
    },
  })
}
