import { ArrowLeft, CalendarDays, CircleDollarSign } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useExpense } from "@/hooks/use-expenses"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

function ExpenseDetailPage() {
  const { id } = useParams()
  const { data: expense, isLoading, error } = useExpense(id)
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading expense…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/expenses" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to expenses</Button><Badge variant="outline" className="mb-3">{expense.category}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Expense details</h1><p className="mt-2 text-muted-foreground">Recorded on {<span className="font-amharic">{formatEthiopianDate(expense.date)}</span>}</p></section><Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign /> ETB {Number(expense.amount).toLocaleString()}</CardTitle><CardDescription>{expense.description || "No description was provided."}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info icon={<CalendarDays />} label="Expense date" value={<span className="font-amharic">{formatEthiopianDate(expense.date)}</span>} /><Info label="Category" value={expense.category} /><Info label="Expense ID" value={expense.id} /><Info label="Recorded by" value={expense.recorded_by} /></CardContent></Card></main>
}

function Info({ icon, label, value }) { return <div className="flex items-start gap-3"><div className="mt-0.5 text-muted-foreground">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium capitalize">{value}</p></div></div> }

export default ExpenseDetailPage
