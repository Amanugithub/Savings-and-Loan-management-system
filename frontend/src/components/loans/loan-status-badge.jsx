import { Badge } from "@/components/ui/badge"
import { LOAN_STATUS_LABELS, LOAN_STATUS_VARIANTS } from "@/lib/loan-workflow"

function LoanStatusBadge({ status, className }) {
  return <Badge variant={LOAN_STATUS_VARIANTS[status] || "secondary"} className={className}>{LOAN_STATUS_LABELS[status] || status}</Badge>
}

export { LoanStatusBadge }
