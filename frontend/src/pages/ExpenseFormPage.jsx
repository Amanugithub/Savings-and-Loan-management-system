import { useState } from "react"
import { ArrowLeft, Save } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateExpense } from "@/hooks/use-expenses"
import { useLoans } from "@/hooks/use-loans"
import { todayGregorianIso } from "@/lib/ethiopian-calendar"

const categories = { supplies: "Supplies", utilities: "Utilities", rent: "Rent", maintenance: "Maintenance", equipment: "Equipment", collection_expense: "Collection expense", other: "Other" }
const initialForm = { category: "supplies", amount: "", description: "", date: todayGregorianIso(), loan_id: "" }

function ExpenseFormPage() {
  const navigate = useNavigate()
  const mutation = useCreateExpense()
  const { data: loans = [] } = useLoans()
  const [form, setForm] = useState(initialForm)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isCollectionExpense = form.category === "collection_expense"
  const loanItems = loans.map((loan) => ({ value: loan.id, label: loan.id.slice(0, 8) + "… · ETB " + Number(loan.principal_amount).toLocaleString() + " · " + loan.status.replaceAll("_", " ") }))
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const updateCategory = (category) => setForm((current) => ({ ...current, category, loan_id: category === "collection_expense" ? current.loan_id : "" }))
  const submit = (event) => { event.preventDefault(); setConfirmOpen(true) }
  const confirmSubmit = () => { setConfirmOpen(false); mutation.mutate({ ...form, amount: Number(form.amount), loan_id: isCollectionExpense ? form.loan_id : undefined }, { onSuccess: () => navigate("/expenses") }) }

  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-8">
    <section><Button variant="ghost" render={<Link to="/expenses" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to expenses</Button><Badge variant="secondary" className="mb-3">Operating cost</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Record expense</h1><p className="mt-2 text-muted-foreground">Add a verified expense to the organization&apos;s financial register.</p></section>
    <Card><CardHeader><CardTitle>Expense details</CardTitle><CardDescription>Collection expenses are attached to a loan and are collected before other repayment balances.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6"><div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="category">Category<Select items={Object.entries(categories).map(([value, label]) => ({ value, label }))} value={form.category} onValueChange={updateCategory}><SelectTrigger id="category" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      {isCollectionExpense && <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="expense-loan">Loan<Select items={loanItems} value={form.loan_id || undefined} onValueChange={(loan_id) => setForm((current) => ({ ...current, loan_id }))}><SelectTrigger id="expense-loan" className="w-full"><SelectValue placeholder="Select the related loan" /></SelectTrigger><SelectContent><SelectGroup>{loans.map((loan) => <SelectItem key={loan.id} value={loan.id}>{loan.id.slice(0, 8)}… · ETB {Number(loan.principal_amount).toLocaleString()} · {loan.status.replaceAll("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select></label>}
      <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="amount">Amount<Input id="amount" name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={updateField} required /></label>
      <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="date">Date<DatePicker value={form.date} onChange={(date) => setForm((current) => ({ ...current, date }))} placeholder="Select expense date" aria-label="Expense date" /></label>
      <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="description">Description<Input id="description" name="description" maxLength={255} value={form.description} onChange={updateField} placeholder="What was this expense for?" /></label>
    </div>{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" render={<Link to="/expenses" />}>Cancel</Button><Button type="submit" disabled={mutation.isPending || (isCollectionExpense && !form.loan_id)}><Save data-icon="inline-start" />{mutation.isPending ? "Saving…" : "Save expense"}</Button></div></form></CardContent></Card>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Save this expense?" description={"This will record " + (form.amount ? "ETB " + Number(form.amount).toLocaleString() : "this amount") + " as a " + categories[form.category].toLowerCase() + " expense."} confirmLabel="Save expense" onConfirm={confirmSubmit} disabled={mutation.isPending} />
  </main>
}

export default ExpenseFormPage
