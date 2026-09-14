import { useMemo, useState } from "react"
import { ArrowLeft, Check, CircleX, Clock3, LockKeyhole, ReceiptText } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoanStatusBadge } from "@/components/loans/loan-status-badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/context/AuthContext"
import { useAdministrators } from "@/hooks/use-administrators"
import { useMember } from "@/hooks/use-members"
import {
  useCommitteeApprove,
  useCommitteeReject,
  useDeclineRecommendation,
  useDisburseLoan,
  useLoan,
  useRecommendLoan,
  useRecordLoanPayment,
  useRespondAsGuarantor,
} from "@/hooks/use-loans"
import { formatEthiopianDate, todayGregorianIso } from "@/lib/ethiopian-calendar"
import { canCommitteeDecide, canDisburse, canRecommend, canRecordPayment, canRespondAsGuarantor } from "@/lib/loan-workflow"

function Info({ label, value }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>
}

// Every transition button below is disabled while its own mutation is
// pending, so a slow connection or a double-click can't fire the same
// request twice — the buttons unmount on success anyway (the loan moves
// to a new status), but this covers the window before that happens.
function ActionConfirmButton({ label, icon: Icon, description, destructive, mutation, onConfirm, disabledReason }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button variant={destructive ? "destructive" : "default"} onClick={() => setOpen(true)} disabled={mutation.isPending || Boolean(disabledReason)} title={disabledReason}>
      <Icon data-icon="inline-start" /> {label}
    </Button>
    <AlertDialog open={open} onOpenChange={setOpen} title={label} description={description} confirmLabel={label} destructive={destructive} disabled={mutation.isPending} onConfirm={() => { setOpen(false); onConfirm() }} />
  </>
}

function AuditTimeline({ loan, adminNames }) {
  const events = [
    loan.guarantor_responded_at && { at: loan.guarantor_responded_at, label: "Guarantor responded" },
    loan.recommended_at && { at: loan.recommended_at, label: `Recommended by ${adminNames.get(loan.recommended_by) || "an administrator"}` },
    loan.declined_at && { at: loan.declined_at, label: `Declined by ${adminNames.get(loan.declined_by) || "an administrator"}` },
    loan.approved_at && { at: loan.approved_at, label: `Approved by ${adminNames.get(loan.approved_by) || "an administrator"}` },
    // Shown with its business-effective disbursement date, but ordered by
    // when the disburse action actually happened — disbursement_date can be
    // backdated, which would otherwise misplace it in the sequence.
    loan.disbursement_date && { at: loan.disbursement_date, sortAt: loan.updated_at || loan.disbursement_date, label: `Disbursed by ${adminNames.get(loan.disbursed_by) || "an administrator"}` },
  ].filter(Boolean).sort((a, b) => new Date(a.sortAt || a.at) - new Date(b.sortAt || b.at))

  if (events.length === 0) return <p className="text-sm text-muted-foreground">No workflow events recorded yet.</p>

  return <ol className="flex flex-col gap-3">
    {events.map((event, index) => (
      <li key={index} className="flex items-start gap-3 text-sm">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
        <div><p className="font-medium">{event.label}</p><p className="text-xs text-muted-foreground">{formatEthiopianDate(event.at)}</p></div>
      </li>
    ))}
  </ol>
}

function ScheduleAndPenalties({ loan }) {
  const schedule = loan.schedule ?? []
  const penalties = loan.penalties ?? []

  return <section className="grid gap-6 lg:grid-cols-2">
    <Card>
      <CardHeader><CardTitle>Repayment schedule</CardTitle><CardDescription>{schedule.length} installment{schedule.length === 1 ? "" : "s"}.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {schedule.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No schedule yet — installments are created on disbursement.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due</TableHead><TableHead>Principal</TableHead><TableHead>Interest</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {schedule.map((installment) => (
                <TableRow key={installment.id}>
                  <TableCell>{installment.installment_number}</TableCell>
                  <TableCell className="whitespace-nowrap"><span className="font-amharic">{formatEthiopianDate(installment.due_date)}</span></TableCell>
                  <TableCell>{Number(installment.principal_paid).toLocaleString()} / {Number(installment.principal_due).toLocaleString()}</TableCell>
                  <TableCell>{Number(installment.interest_paid).toLocaleString()} / {Number(installment.interest_due).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={installment.status === "paid" ? "default" : installment.status === "partially_paid" ? "secondary" : "outline"}>{installment.status.replace("_", " ")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle>Overdue penalties</CardTitle><CardDescription>2% of the outstanding balance per overdue month.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Info label="Total accrued" value={`ETB ${Number(loan.total_penalties ?? 0).toLocaleString()}`} />
          <Info label="Still outstanding" value={`ETB ${Number(loan.outstanding_penalty_balance ?? 0).toLocaleString()}`} />
        </div>
        {penalties.length === 0 ? <p className="text-sm text-muted-foreground">No overdue penalties — the loan is current.</p> : (
          <Table>
            <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Basis</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {penalties.map((penalty) => (
                <TableRow key={penalty.id}>
                  <TableCell>{penalty.penalty_period}</TableCell>
                  <TableCell>ETB {Number(penalty.basis_amount).toLocaleString()}</TableCell>
                  <TableCell>ETB {Number(penalty.amount).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  </section>
}

function RecordPaymentCard({ loanId }) {
  const mutation = useRecordLoanPayment()
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(todayGregorianIso())
  const [notes, setNotes] = useState("")
  const [lastResult, setLastResult] = useState(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const submit = (event) => {
    event.preventDefault()
    mutation.mutate(
      { id: loanId, amount: Number(amount), date, notes: notes || undefined, idempotencyKey },
      {
        onSuccess: (result) => {
          setLastResult(result)
          setAmount("")
          setNotes("")
          setIdempotencyKey(crypto.randomUUID())
        },
      }
    )
  }

  const bucketLabel = { collection_expense: "Collection expense", interest_penalty: "Interest / insurance / penalty", principal: "Principal" }

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText /> Record a payment</CardTitle><CardDescription>Allocated automatically: collection expenses, then interest/insurance/penalties, then principal.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="payment-amount">Amount<Input id="payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="payment-date">Date<DatePicker value={date} onChange={setDate} aria-label="Payment date" /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="payment-notes">Notes (optional)<Input id="payment-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Recording…" : "Record payment"}</Button>
        </div>
      </form>

      {mutation.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mutation.error.status === 409
            ? `This exceeds the outstanding balance (ETB ${Number(mutation.error.outstanding_balance ?? 0).toLocaleString()}).`
            : mutation.error.message}
        </p>
      )}

      {lastResult && (
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-sm font-medium">Payment allocated</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            {lastResult.allocations.map((allocation) => (
              <li key={allocation.id} className="flex justify-between gap-4"><span>{bucketLabel[allocation.bucket] || allocation.bucket}</span><span className="font-medium text-foreground">ETB {Number(allocation.amount).toLocaleString()}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-sm">Outstanding balance now: <span className="font-semibold">ETB {Number(lastResult.outstanding_balance).toLocaleString()}</span></p>
        </div>
      )}
    </CardContent>
  </Card>
}

function LoanDetailPage() {
  const { id } = useParams()
  const { role } = useAuth()
  const { data: loan, isLoading, error } = useLoan(id)
  const { data: member } = useMember(loan?.member_id)
  const { data: guarantor } = useMember(loan?.guarantor_member_id)
  const { data: administrators = [] } = useAdministrators()
  const adminNames = useMemo(() => new Map(administrators.map((admin) => [admin.id, admin.name])), [administrators])

  const respondAsGuarantor = useRespondAsGuarantor()
  const recommend = useRecommendLoan()
  const declineRecommendation = useDeclineRecommendation()
  const committeeApprove = useCommitteeApprove()
  const committeeReject = useCommitteeReject()
  const disburse = useDisburseLoan()
  const [disbursementDate, setDisbursementDate] = useState(todayGregorianIso())

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading loan…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  const missingPropertyDocs = loan.collateral_type === "property" && (!loan.collateral_document_ref || !loan.collateral_certifying_authority)

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
    <section>
      <Button variant="ghost" render={<Link to="/loans" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to loans</Button>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <LoanStatusBadge status={loan.status} className="mb-3" />
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{member?.name || "Loan details"}</h1>
          <p className="mt-2 text-muted-foreground">{loan.type.replace("_", " ")} · {loan.term_years} year{loan.term_years === 1 ? "" : "s"} · {loan.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {loan.status === "awaiting_guarantor" && canRespondAsGuarantor(role) && <>
            <ActionConfirmButton label="Record guarantor decline" icon={CircleX} destructive description="Marks this application's guarantor consent as declined." mutation={respondAsGuarantor} onConfirm={() => respondAsGuarantor.mutate({ id: loan.id, decision: "decline" })} />
            <ActionConfirmButton label="Record guarantor approval" icon={Check} description="Moves this application to awaiting recommendation." mutation={respondAsGuarantor} onConfirm={() => respondAsGuarantor.mutate({ id: loan.id, decision: "approve" })} />
          </>}

          {loan.status === "awaiting_recommendation" && canRecommend(role) && <>
            <ActionConfirmButton label="Decline recommendation" icon={CircleX} destructive description="Ends this application without forwarding it to committee." mutation={declineRecommendation} onConfirm={() => declineRecommendation.mutate(loan.id)} />
            <ActionConfirmButton label="Recommend" icon={Check} description="Forwards this application to the loan committee for approval." mutation={recommend} onConfirm={() => recommend.mutate(loan.id)} />
          </>}

          {loan.status === "awaiting_committee_approval" && canCommitteeDecide(role) && <>
            <ActionConfirmButton
              label="Reject"
              icon={CircleX}
              destructive
              description="Ends this application."
              mutation={committeeReject}
              onConfirm={() => committeeReject.mutate(loan.id)}
            />
            <ActionConfirmButton
              label="Approve"
              icon={Check}
              description="Approves this loan for disbursement."
              mutation={committeeApprove}
              disabledReason={missingPropertyDocs ? "Add the property document reference and certifying authority before approval." : undefined}
              onConfirm={() => committeeApprove.mutate(loan.id)}
            />
          </>}
        </div>
      </div>
    </section>

    {missingPropertyDocs && loan.status === "awaiting_committee_approval" && (
      <p role="alert" className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">This property-secured loan needs a document reference and certifying authority before it can be approved.</p>
    )}

    {loan.status === "approved" && canDisburse(role) && (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 /> Disbursement</CardTitle><CardDescription>Choose the disbursement date — this also generates the repayment schedule.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="disbursement-date">Disbursement date<DatePicker value={disbursementDate} onChange={setDisbursementDate} aria-label="Disbursement date" /></label>
          <ActionConfirmButton label="Disburse loan" icon={LockKeyhole} description="Activates the loan and creates its repayment schedule. This cannot be repeated." mutation={disburse} onConfirm={() => disburse.mutate({ id: loan.id, disbursement_date: disbursementDate })} />
        </CardContent>
      </Card>
    )}

    {[respondAsGuarantor, recommend, declineRecommendation, committeeApprove, committeeReject, disburse].map((mutation, index) => mutation.error && (
      <p key={index} role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>
    ))}

    <section className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Loan terms</CardTitle><CardDescription>Server-calculated values from the application.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Principal" value={`ETB ${Number(loan.principal_amount).toLocaleString()}`} />
          <Info label="Interest rate" value={`${loan.interest_rate}%`} />
          <Info label="Monthly installment" value={`ETB ${Number(loan.monthly_installment).toLocaleString()}`} />
          <Info label="Monthly interest" value={`ETB ${Number(loan.monthly_interest_amount).toLocaleString()}`} />
          <Info label="Insurance" value={`ETB ${Number(loan.insurance_amount).toLocaleString()}`} />
          <Info label="Collateral" value={loan.collateral_type ? loan.collateral_type : "Self-secured"} />
          {loan.collateral_type === "property" && <>
            <Info label="Document reference" value={loan.collateral_document_ref || "Not provided"} />
            <Info label="Certifying authority" value={loan.collateral_certifying_authority || "Not provided"} />
          </>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>People &amp; timeline</CardTitle><CardDescription>Member, guarantor, and workflow audit trail.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <Info label="Borrower" value={member?.name || loan.member_id} />
          <Info label="Guarantor" value={guarantor?.name || (loan.guarantor_member_id ? loan.guarantor_member_id : "Not applicable")} />
          <Info label="Disbursement date" value={loan.disbursement_date ? <span className="font-amharic">{formatEthiopianDate(loan.disbursement_date)}</span> : "Not disbursed"} />
          <div>
            <dt className="mb-2 text-xs text-muted-foreground">Audit timeline</dt>
            <AuditTimeline loan={loan} adminNames={adminNames} />
          </div>
        </CardContent>
      </Card>
    </section>

    {loan.status === "active" && <>
      <ScheduleAndPenalties loan={loan} />
      {canRecordPayment(role) && <RecordPaymentCard loanId={loan.id} />}
    </>}
  </main>
}

export default LoanDetailPage
