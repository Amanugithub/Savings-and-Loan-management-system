import { useState } from "react"
import { ArrowLeft, Save } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WarningsAlert } from "@/components/ui/warnings-alert"
import { useAuth } from "@/context/AuthContext"
import { useMembers } from "@/hooks/use-members"
import { useCreateTransaction } from "@/hooks/use-transactions"
import { todayGregorianIso } from "@/lib/ethiopian-calendar"
import { canRecordTransaction, transactionTypesForRole } from "@/lib/loan-workflow"

const typeLabels = {
  savings_deposit: "Savings deposit",
  share_purchase: "Share purchase",
  opening_savings_balance: "Opening savings balance",
  opening_share_balance: "Opening share balance",
  registration_fee: "Registration fee",
  card_fee: "Card fee",
  bank_interest_income: "Bank interest income",
}

function TransactionFormPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { data: members = [] } = useMembers()
  const mutation = useCreateTransaction()
  const availableTypes = transactionTypesForRole(role)
  const [form, setForm] = useState({ type: availableTypes[0] || "", member_id: "", amount: "", date: todayGregorianIso(), notes: "" })
  const [warnings, setWarnings] = useState(null)
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const organizationLevel = form.type === "bank_interest_income"
  const submit = (event) => {
    event.preventDefault()
    const payload = { ...form, amount: Number(form.amount), member_id: organizationLevel ? undefined : form.member_id }
    mutation.mutate(payload, {
      onSuccess: (response) => {
        if (response.warnings?.length) setWarnings(response.warnings)
        else navigate("/transactions")
      },
    })
  }

  if (!canRecordTransaction(role)) {
    return <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Button variant="ghost" render={<Link to="/transactions" />} className="-ml-3 w-fit"><ArrowLeft data-icon="inline-start" /> Back to transactions</Button>
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Your role can&apos;t record ledger transactions. Loan repayments are recorded from a loan&apos;s detail page instead of this form.</p>
    </main>
  }

  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/transactions" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to transactions</Button><Badge variant="secondary" className="mb-3">Ledger entry</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Record transaction</h1><p className="mt-2 text-muted-foreground">Loan installment, interest, insurance, and penalty payments are recorded from the loan&apos;s detail page instead — they go through the repayment waterfall there.</p></section><Card><CardHeader><CardTitle>Transaction details</CardTitle><CardDescription>All amounts are recorded in Ethiopian birr.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6"><div className="grid gap-4 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="type">Transaction type<Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}><SelectTrigger id="type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{availableTypes.map((value) => <SelectItem key={value} value={value}>{typeLabels[value]}</SelectItem>)}</SelectGroup></SelectContent></Select></label>{!organizationLevel && <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="member_id">Member<Select value={form.member_id || undefined} onValueChange={(value) => setForm((current) => ({ ...current, member_id: value }))}><SelectTrigger id="member_id" className="w-full"><SelectValue placeholder="Select a member" /></SelectTrigger><SelectContent><SelectGroup>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.phone_number}</SelectItem>)}</SelectGroup></SelectContent></Select></label>}<label className="flex flex-col gap-2 text-sm font-medium" htmlFor="amount">Amount<Input id="amount" name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={updateField} required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="date">Date<DatePicker value={form.date} onChange={(date) => setForm((current) => ({ ...current, date }))} placeholder="Select transaction date" aria-label="Transaction date" /></label><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="notes">Notes<Input id="notes" name="notes" value={form.notes} onChange={updateField} placeholder="Optional note for the ledger" /></label></div><WarningsAlert warnings={warnings} />{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<div className="flex justify-end gap-3">{warnings ? <Button type="button" onClick={() => navigate("/transactions")}>Continue</Button> : <><Button type="button" variant="outline" render={<Link to="/transactions" />}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save data-icon="inline-start" />{mutation.isPending ? "Saving…" : "Save transaction"}</Button></>}</div></form></CardContent></Card></main>
}

export default TransactionFormPage
