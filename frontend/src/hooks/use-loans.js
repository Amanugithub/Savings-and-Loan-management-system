import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  committeeApprove,
  committeeReject,
  createLoan,
  declineRecommendation,
  disburseLoan,
  getLoan,
  getLoans,
  recommendLoan,
  recordLoanPayment,
  respondAsGuarantor,
} from "@/api/loans"

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

// Every loan-transition mutation below shares the same refresh shape. We
// seed the cache with the mutation's own response via setQueryData (when it
// carries a full loan object) before invalidating — invalidate alone starts
// a background refetch that can commit a moment after other queries on the
// same page (member names, etc.) have already updated, which is what was
// producing a transient torn read (new audit fields with a stale status
// badge) right after clicking an action. setQueryData makes that first
// post-mutation render internally consistent; the follow-up invalidate
// still fills in fields the mutation response doesn't carry (e.g. schedule).
function useLoanTransition(mutationFn, extractLoan = (result) => result) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (result, variables) => {
      const id = (typeof variables === "string" ? variables : variables?.id) ?? extractLoan(result)?.id
      const loan = extractLoan(result)
      if (id && loan) queryClient.setQueryData(["loans", id], (previous) => ({ ...previous, ...loan }))
      if (id) queryClient.invalidateQueries({ queryKey: ["loans", id] })
      queryClient.invalidateQueries({ queryKey: ["loans"], exact: false })
    },
  })
}

export function useRespondAsGuarantor() {
  return useLoanTransition(respondAsGuarantor)
}

export function useRecommendLoan() {
  return useLoanTransition(recommendLoan)
}

export function useDeclineRecommendation() {
  return useLoanTransition(declineRecommendation)
}

export function useCommitteeApprove() {
  return useLoanTransition(committeeApprove)
}

export function useCommitteeReject() {
  return useLoanTransition(committeeReject)
}

export function useDisburseLoan() {
  return useLoanTransition(disburseLoan, (result) => result?.loan)
}

export function useRecordLoanPayment() {
  return useLoanTransition(recordLoanPayment, () => undefined)
}
