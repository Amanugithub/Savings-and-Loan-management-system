import { useState } from "react"
import { ArrowLeft, Check, CircleX, Clock3, LockKeyhole } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { useMember } from "@/hooks/use-members"
import { useLoan, useUpdateLoanStatus } from "@/hooks/use-loans"
import { formatEthiopianDate, todayGregorianIso } from "@/lib/ethiopian-calendar"

const statusVariant = { pending: "secondary", active: "default", closed: "outline", rejected: "destructive" }

function LoanDetailPage() {
  const { id } = useParams()
  const { data: loan, isLoading, error } = useLoan(id)
  const { data: member } = useMember(loan?.member_id)
  const { data: guarantor } = useMember(loan?.guarantor_member_id)
  const mutation = useUpdateLoanStatus()
  const [disbursementDate, setDisbursementDate] = useState(todayGregorianIso())
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading loan…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  const changeStatus = (status) => mutation.mutate({ id: loan.id, status, disbursement_date: status === "active" ? disbursementDate : undefined })

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/loans" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to loans</Button><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant={statusVariant[loan.status] || "secondary"} className="mb-3">{loan.status}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{member?.name || "Loan details"}</h1><p className="mt-2 text-muted-foreground">{loan.type.replace("_", " ")} · {loan.term_years} year{loan.term_years === 1 ? "" : "s"} · {loan.id}</p></div><div className="flex flex-wrap gap-2">{loan.status === "pending" && <><Button variant="destructive" onClick={() => changeStatus("rejected")} disabled={mutation.isPending}><CircleX data-icon="inline-start" /> Reject</Button><Button onClick={() => changeStatus("active")} disabled={mutation.isPending}><Check data-icon="inline-start" /> Approve</Button></>}{loan.status === "active" && <Button variant="outline" onClick={() => changeStatus("closed")} disabled={mutation.isPending}><LockKeyhole data-icon="inline-start" /> Close loan</Button>}</div></div></section>{loan.status === "pending" && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 /> Approval details</CardTitle><CardDescription>Choose the disbursement date before approving this application.</CardDescription></CardHeader><CardContent><DatePicker value={disbursementDate} onChange={setDisbursementDate} placeholder="Select disbursement date" aria-label="Disbursement date" /></CardContent></Card>}{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<section className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle>Loan terms</CardTitle><CardDescription>Server-calculated values from the application.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Principal" value={`ETB ${Number(loan.principal_amount).toLocaleString()}`} /><Info label="Interest rate" value={`${loan.interest_rate}%`} /><Info label="Monthly installment" value={`ETB ${Number(loan.monthly_installment).toLocaleString()}`} /><Info label="Monthly interest" value={`ETB ${Number(loan.monthly_interest_amount).toLocaleString()}`} /><Info label="Insurance" value={`ETB ${Number(loan.insurance_amount).toLocaleString()}`} /><Info label="Collateral" value={loan.collateral_type} /></CardContent></Card><Card><CardHeader><CardTitle>People</CardTitle><CardDescription>Member and collateral information.</CardDescription></CardHeader><CardContent className="grid gap-4"><Info label="Borrower" value={member?.name || loan.member_id} /><Info label="Guarantor" value={guarantor?.name || (loan.guarantor_member_id ? loan.guarantor_member_id : "Not applicable")} /><Info label="Disbursement date" value={loan.disbursement_date ? formatEthiopianDate(loan.disbursement_date) : "Not disbursed"} /></CardContent></Card></section></main>
}

function Info({ label, value }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium capitalize">{value}</dd></div> }

export default LoanDetailPage
