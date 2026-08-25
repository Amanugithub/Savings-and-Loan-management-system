import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { calculateDividends, getDividend, getDividendHistory, getDividendPreview } from "@/api/dividends"

export function useDividendPreview(fiscalYear) {
  return useQuery({ queryKey: ["dividend-preview", fiscalYear], queryFn: () => getDividendPreview(fiscalYear), enabled: Boolean(fiscalYear) })
}

export function useDividendHistory(filters) {
  return useQuery({ queryKey: ["dividend-history", filters], queryFn: () => getDividendHistory(filters) })
}

export function useDividend(id) {
  return useQuery({ queryKey: ["dividend-history", id], queryFn: () => getDividend(id), enabled: Boolean(id) })
}

export function useCalculateDividends() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: calculateDividends,
    onSuccess: (result, fiscalYear) => {
      queryClient.setQueryData(["dividend-calculation", fiscalYear], result)
      queryClient.invalidateQueries({ queryKey: ["dividend-history"] })
      queryClient.invalidateQueries({ queryKey: ["dividend-preview", fiscalYear] })
    },
  })
}
