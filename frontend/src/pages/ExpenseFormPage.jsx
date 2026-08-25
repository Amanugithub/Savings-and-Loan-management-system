import { useState } from "react"
import { ArrowLeft, Save } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateExpense } from "@/hooks/use-expenses"

const categories = { supplies: "Supplies", utilities: "Utilities", rent: "Rent", maintenance: "Maintenance", equipment: "Equipment", other: "Other" }
const initialForm = { category: "supplies", amount: "", description: "", date: new Date().toISOString().slice(0, 10) }

function ExpenseFormPage() {
  const navigate = useNavigate()
  const mutation = useCreateExpense()
  const [form, setForm] = useState(initialForm)
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = (event) => { event.preventDefault(); mutation.mutate({ ...form, amount: Number(form.amount) }, { onSuccess: () => navigate("/expenses") }) }

  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/expenses" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to expenses</Button><Badge variant="secondary" className="mb-3">Operating cost</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Record expense</h1><p className="mt-2 text-muted-foreground">Add a verified expense to the organization’s financial register.</p></section><Card><CardHeader><CardTitle>Expense details</CardTitle><CardDescription>All amounts are recorded in Ethiopian birr.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6"><div className="grid gap-4 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="category">Category<Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}><SelectTrigger id="category" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="amount">Amount<Input id="amount" name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={updateField} required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="date">Date<DatePicker value={form.date} onChange={(date) => setForm((current) => ({ ...current, date }))} placeholder="Select expense date" aria-label="Expense date" /></label><label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="description">Description<Input id="description" name="description" maxLength={255} value={form.description} onChange={updateField} placeholder="What was this expense for?" /></label></div>{mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}<div className="flex justify-end gap-3"><Button type="button" variant="outline" render={<Link to="/expenses" />}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save data-icon="inline-start" />{mutation.isPending ? "Saving…" : "Save expense"}</Button></div></form></CardContent></Card></main>
}

export default ExpenseFormPage
