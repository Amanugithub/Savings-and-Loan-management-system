import { useState } from "react"
import { ArrowLeft, Save } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useMembers } from "@/hooks/use-members"
import { useCreateLoan } from "@/hooks/use-loans"

const initialForm = { member_id: "", guarantor_member_id: "", type: "regular", principal_amount: "", term_years: "", collateral_type: "guarantor" }
const terms = [1, 2, 3, 4, 5]

function LoanFormPage() {
  const navigate = useNavigate()
  const { data: members = [] } = useMembers()
  const mutation = useCreateLoan()
  const [form, setForm] = useState(initialForm)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value, ...(key === "collateral_type" && value === "property" ? { guarantor_member_id: "" } : {}) }))
  const guarantors = members.filter((member) => member.status === "active" && member.id !== form.member_id)
  const payload = { ...form, principal_amount: Number(form.principal_amount), term_years: Number(form.term_years), guarantor_member_id: form.collateral_type === "guarantor" ? form.guarantor_member_id : undefined }
  const submit = (event) => { event.preventDefault(); setConfirmOpen(true) }
  const confirmSubmit = () => { setConfirmOpen(false); mutation.mutate(payload, { onSuccess: (loan) => navigate(`/loans/${loan.id}`) }) }

  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/loans" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to loans</Button><Badge variant="secondary" className="mb-3">Loan application</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">New loan application</h1><p className="mt-2 text-muted-foreground">The backend calculates interest, insurance, and monthly installments after submission.</p></section><Card><CardHeader><CardTitle>Application details</CardTitle><CardDescription>Applications start in pending status for administrator review.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6"><div className="grid gap-4 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="loan-member">Member<Select value={form.member_id || undefined} onValueChange={(value) => update("member_id", value)}><SelectTrigger id="loan-member" className="w-full"><SelectValue placeholder="Select a member" /></SelectTrigger><SelectContent><SelectGroup>{members.filter((member) => member.status === "active").map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.phone_number}</SelectItem>)}</SelectGroup></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="loan-type">Loan type<Select value={form.type} onValueChange={(value) => update("type", value)}><SelectTrigger id="loan-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="regular">Regular</SelectItem><SelectItem value="self_secured">Self secured</SelectItem></SelectGroup></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="principal">Principal amount<Input id="principal" type="number" min="0.01" step="0.01" value={form.principal_amount} onChange={(event) => update("principal_amount", event.target.value)} placeholder="0.00" required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="term">Term<Select value={form.term_years || undefined} onValueChange={(value) => update("term_years", value)}><SelectTrigger id="term" className="w-full"><SelectValue placeholder="Select term" /></SelectTrigger><SelectContent><SelectGroup>{terms.map((term) => <SelectItem key={term} value={String(term)}>{term} year{term === 1 ? "" : "s"}</SelectItem>)}</SelectGroup></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="collateral">Collateral type<Select value={form.collateral_type} onValueChange={(value) => update("collateral_type", value)}><SelectTrigger id="collateral" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="guarantor">Guarantor</SelectItem><SelectItem value="property">Property</SelectItem></SelectGroup></SelectContent></Select></label>{form.collateral_type === "guarantor" && <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="guarantor">Guarantor<Select value={form.guarantor_member_id || undefined} onValueChange={(value) => update("guarantor_member_id", value)}><SelectTrigger id="guarantor" className="w-full"><SelectValue placeholder="Select an active guarantor" /></SelectTrigger><SelectContent><SelectGroup>{guarantors.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.phone_number}</SelectItem>)}</SelectGroup></SelectContent></Select></label>}</div>{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" render={<Link to="/loans" />}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save data-icon="inline-start" />{mutation.isPending ? "Submitting…" : "Submit application"}</Button></div></form></CardContent></Card><AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Submit this loan application?" description="This will create a pending loan application for administrator review." confirmLabel="Submit application" onConfirm={confirmSubmit} disabled={mutation.isPending} /></main>
}

export default LoanFormPage
