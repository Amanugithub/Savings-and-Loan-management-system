import { useState, useMemo } from "react"
import { ArrowLeft, Save, Calculator } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WarningsAlert } from "@/components/ui/warnings-alert"
import { useAuth } from "@/context/AuthContext"
import { useMembers } from "@/hooks/use-members"
import { useCreateLoan } from "@/hooks/use-loans"
import { canCreateLoan } from "@/lib/loan-workflow"
import { calculateLoanDetails } from "@/lib/loan-calculator"

const initialForm = {
  member_id: "",
  guarantor_member_id: "",
  type: "regular",
  principal_amount: "",
  term_years: "",
  collateral_type: "guarantor",
  collateral_document_ref: "",
  collateral_certifying_authority: "",
}
const terms = [1, 2, 3, 4, 5]

function LoanFormPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { data: members = [] } = useMembers()
  const mutation = useCreateLoan()
  const [form, setForm] = useState(initialForm)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [createdLoan, setCreatedLoan] = useState(null)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value, ...(key === "collateral_type" && value === "property" ? { guarantor_member_id: "" } : {}) }))
  const guarantors = members.filter((member) => member.status === "active" && member.id !== form.member_id)
  const isSelfSecured = form.type === "self_secured"
  const isPropertyCollateral = !isSelfSecured && form.collateral_type === "property"

  // Calculate loan preview
  const loanPreview = useMemo(() => {
    return calculateLoanDetails(form.principal_amount, form.term_years)
  }, [form.principal_amount, form.term_years])

  const payload = {
    member_id: form.member_id,
    type: form.type,
    principal_amount: Number(form.principal_amount),
    term_years: Number(form.term_years),
    ...(isSelfSecured
      ? {}
      : {
          collateral_type: form.collateral_type,
          guarantor_member_id: form.collateral_type === "guarantor" ? form.guarantor_member_id : undefined,
          collateral_document_ref: form.collateral_type === "property" ? form.collateral_document_ref || undefined : undefined,
          collateral_certifying_authority: form.collateral_type === "property" ? form.collateral_certifying_authority || undefined : undefined,
        }),
  }

  const submit = (event) => { event.preventDefault(); setConfirmOpen(true) }
  const confirmSubmit = () => {
    setConfirmOpen(false)
    mutation.mutate(payload, {
      onSuccess: (response) => {
        if (response.warnings?.length) {
          setCreatedLoan(response.data)
        } else {
          navigate(`/loans/${response.data.id}`)
        }
      },
    })
  }

  if (!canCreateLoan(role)) {
    return <main className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <Button variant="ghost" render={<Link to="/loans" />} className="-ml-3 w-fit"><ArrowLeft data-icon="inline-start" /> Back to loans</Button>
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Only cashiers and the general manager can submit loan applications.</p>
    </main>
  }

  if (createdLoan) {
    return <main className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Badge variant="secondary" className="w-fit">Application submitted</Badge>
      <h1 className="font-heading text-2xl font-semibold text-foreground">Loan application created, with guideline warnings</h1>
      <WarningsAlert warnings={mutation.data?.warnings} />
      <Button className="w-fit" onClick={() => navigate(`/loans/${createdLoan.id}`)}>Continue to loan detail</Button>
    </main>
  }

  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/loans" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to loans</Button><Badge variant="secondary" className="mb-3">Loan application</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">New loan application</h1><p className="mt-2 text-muted-foreground">Enter the loan details below to see a preview of interest, insurance, and payment amounts.</p></section><Card><CardHeader><CardTitle>Application details</CardTitle><CardDescription>Guarantor-backed applications start awaiting guarantor consent; others start awaiting recommendation.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6"><div className="grid gap-4 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="loan-member">Member<Select items={members.filter((member) => member.status === "active").map((member) => ({ value: member.id, label: `${member.name} · ${member.phone_number}` }))} value={form.member_id || undefined} onValueChange={(value) => update("member_id", value)}><SelectTrigger id="loan-member" className="w-full"><SelectValue placeholder="Select a member" /></SelectTrigger><SelectContent><SelectGroup>{members.filter((member) => member.status === "active").map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.phone_number}</SelectItem>)}</SelectGroup></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="loan-type">Loan type<Select items={[{ value: "regular", label: "Regular" }, { value: "self_secured", label: "Self secured" }]} value={form.type} onValueChange={(value) => update("type", value)}><SelectTrigger id="loan-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="regular">Regular</SelectItem><SelectItem value="self_secured">Self secured</SelectItem></SelectGroup></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="principal">Principal amount<Input id="principal" type="number" min="0.01" step="0.01" value={form.principal_amount} onChange={(event) => update("principal_amount", event.target.value)} placeholder="0.00" required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="term">Term<Select items={terms.map((term) => ({ value: String(term), label: `${term} year${term === 1 ? "" : "s"}` }))} value={form.term_years || undefined} onValueChange={(value) => update("term_years", value)}><SelectTrigger id="term" className="w-full"><SelectValue placeholder="Select term" /></SelectTrigger><SelectContent><SelectGroup>{terms.map((term) => <SelectItem key={term} value={String(term)}>{term} year{term === 1 ? "" : "s"}</SelectItem>)}</SelectGroup></SelectContent></Select></label>{!isSelfSecured && <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="collateral">Collateral type<Select items={[{ value: "guarantor", label: "Guarantor" }, { value: "property", label: "Property" }]} value={form.collateral_type} onValueChange={(value) => update("collateral_type", value)}><SelectTrigger id="collateral" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="guarantor">Guarantor</SelectItem><SelectItem value="property">Property</SelectItem></SelectGroup></SelectContent></Select></label>}{!isSelfSecured && form.collateral_type === "guarantor" && <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="guarantor">Guarantor<Select items={guarantors.map((member) => ({ value: member.id, label: `${member.name} · ${member.phone_number}` }))} value={form.guarantor_member_id || undefined} onValueChange={(value) => update("guarantor_member_id", value)}><SelectTrigger id="guarantor" className="w-full"><SelectValue placeholder="Select an active guarantor" /></SelectTrigger><SelectContent><SelectGroup>{guarantors.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.phone_number}</SelectItem>)}</SelectGroup></SelectContent></Select></label>}{isPropertyCollateral && <>
    <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="collateral-doc-ref">Property document reference<Input id="collateral-doc-ref" value={form.collateral_document_ref} onChange={(event) => update("collateral_document_ref", event.target.value)} placeholder="Title deed / registration number" required /></label>
    <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="collateral-authority">Certifying authority<Input id="collateral-authority" value={form.collateral_certifying_authority} onChange={(event) => update("collateral_certifying_authority", event.target.value)} placeholder="Issuing office or authority" required /></label>
  </>}{isSelfSecured && <p className="text-sm text-muted-foreground md:col-span-2">Self-secured loans use the member&apos;s own savings and shares as collateral — no guarantor or property document is needed.</p>}</div>{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" render={<Link to="/loans" />}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save data-icon="inline-start" />{mutation.isPending ? "Submitting…" : "Submit application"}</Button></div></form></CardContent></Card>{loanPreview && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />Loan preview</CardTitle><CardDescription>Calculated breakdown of interest, insurance, and payment amounts</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2"><div className="flex flex-col gap-1"><p className="text-sm text-muted-foreground">Principal amount</p><p className="font-heading text-2xl font-semibold">{loanPreview.principal.toLocaleString()} <span className="text-base font-normal text-muted-foreground">ETB</span></p></div><div className="flex flex-col gap-1"><p className="text-sm text-muted-foreground">Interest rate</p><p className="font-heading text-2xl font-semibold">{loanPreview.interestRate}%</p></div><div className="flex flex-col gap-1"><p className="text-sm text-muted-foreground">Total interest</p><p className="font-heading text-2xl font-semibold">{loanPreview.totalInterest.toLocaleString()} <span className="text-base font-normal text-muted-foreground">ETB</span></p></div><div className="flex flex-col gap-1"><p className="text-sm text-muted-foreground">Insurance (1%)</p><p className="font-heading text-2xl font-semibold">{loanPreview.insuranceAmount.toLocaleString()} <span className="text-base font-normal text-muted-foreground">ETB</span></p></div><div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 md:col-span-2"><p className="text-sm font-medium text-muted-foreground">Monthly payment</p><p className="font-heading text-3xl font-bold">{loanPreview.monthlyPayment.toLocaleString()} <span className="text-lg font-normal text-muted-foreground">ETB/month</span></p><p className="mt-1 text-xs text-muted-foreground">{loanPreview.monthlyPrincipal.toLocaleString()} principal + {loanPreview.monthlyInterest.toLocaleString()} interest + {loanPreview.monthlyInsurance.toLocaleString()} insurance</p></div><div className="flex flex-col gap-1 md:col-span-2"><p className="text-sm text-muted-foreground">Total repayment over {loanPreview.termYears} year{loanPreview.termYears === 1 ? "" : "s"} ({loanPreview.months} months)</p><p className="font-heading text-2xl font-semibold">{loanPreview.totalRepayment.toLocaleString()} <span className="text-base font-normal text-muted-foreground">ETB</span></p></div></div></CardContent></Card>}<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Submit this loan application?" description="This will create a loan application for administrator review." confirmLabel="Submit application" onConfirm={confirmSubmit} disabled={mutation.isPending} /></main>
}

export default LoanFormPage
