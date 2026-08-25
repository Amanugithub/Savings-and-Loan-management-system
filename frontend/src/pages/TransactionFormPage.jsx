import { useState } from "react"
import { ArrowLeft, Save } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useMembers } from "@/hooks/use-members"
import { useCreateTransaction } from "@/hooks/use-transactions"

const types = { savings_deposit: "Savings deposit", share_purchase: "Share purchase", penalty_payment: "Penalty payment", registration_fee: "Registration fee", card_fee: "Card fee", loan_disbursement: "Loan disbursement", loan_installment: "Loan installment", loan_interest: "Loan interest", loan_insurance: "Loan insurance", bank_interest_income: "Bank interest income" }
const initialForm = { type: "savings_deposit", member_id: "", loan_id: "", amount: "", date: new Date().toISOString().slice(0, 10), notes: "" }

function TransactionFormPage() {
  const navigate = useNavigate()
  const { data: members = [] } = useMembers()
  const mutation = useCreateTransaction()
  const [form, setForm] = useState(initialForm)
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const organizationLevel = form.type === "bank_interest_income"
  const loanRelated = ["loan_disbursement", "loan_installment", "loan_interest", "loan_insurance"].includes(form.type)
  const submit = (event) => { event.preventDefault(); const payload = { ...form, amount: Number(form.amount), member_id: organizationLevel ? undefined : form.member_id, loan_id: loanRelated && form.loan_id ? form.loan_id : undefined }; mutation.mutate(payload, { onSuccess: () => navigate("/transactions") }) }

  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/transactions" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to transactions</Button><Badge variant="secondary" className="mb-3">Ledger entry</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Record transaction</h1><p className="mt-2 text-muted-foreground">Choose the transaction type first so the required fields stay relevant.</p></section><Card><CardHeader><CardTitle>Transaction details</CardTitle><CardDescription>All amounts are recorded in Ethiopian birr.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6"><div className="grid gap-4 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="type">Transaction type<select id="type" name="type" value={form.type} onChange={updateField} className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{!organizationLevel && <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="member_id">Member<select id="member_id" name="member_id" value={form.member_id} onChange={updateField} className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" required><option value="">Select a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.phone_number}</option>)}</select></label>}{loanRelated && <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="loan_id">Loan ID<Input id="loan_id" name="loan_id" value={form.loan_id} onChange={updateField} placeholder="Paste the related loan ID" /></label>}<label className="flex flex-col gap-2 text-sm font-medium" htmlFor="amount">Amount<Input id="amount" name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={updateField} required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="date">Date<Input id="date" name="date" type="date" value={form.date} onChange={updateField} required /></label><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="notes">Notes<Input id="notes" name="notes" value={form.notes} onChange={updateField} placeholder="Optional note for the ledger" /></label></div>{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" render={<Link to="/transactions" />}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save data-icon="inline-start" />{mutation.isPending ? "Saving…" : "Save transaction"}</Button></div></form></CardContent></Card></main>
}

export default TransactionFormPage
