import { useState } from "react"
import { ArrowLeft, CalendarDays, CircleDollarSign } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMembers } from "@/hooks/use-members"
import { useTransactionSummary } from "@/hooks/use-transactions"

const metricLabels = { total_savings: "Savings", total_shares: "Shares", total_installments: "Installments", total_interest: "Interest", total_penalties: "Penalties", total_collected: "Total collected", total_payouts: "Payouts", total_bank_interest: "Bank interest" }

function TransactionSummaryPage() {
  const { data: members = [] } = useMembers()
  const [filters, setFilters] = useState({ memberId: "", fiscalYear: new Date().getFullYear(), fiscalMonth: 1 })
  const { data: summary, isFetching, error } = useTransactionSummary(filters)
  const update = (event) => setFilters((current) => ({ ...current, [event.target.name]: event.target.value }))

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/transactions" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to transactions</Button><Badge variant="secondary" className="mb-3">Monthly collection sheet</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Member summary</h1><p className="mt-2 text-muted-foreground">Review one member’s fiscal-month transaction totals.</p></section><Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays /> Select period</CardTitle><CardDescription>The fiscal year uses the cooperative’s July–June calendar.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><label className="flex flex-col gap-2 text-sm font-medium md:col-span-1" htmlFor="summary-member">Member<select id="summary-member" name="memberId" value={filters.memberId} onChange={update} className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Select a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="fiscal-year">Fiscal year<input id="fiscal-year" name="fiscalYear" type="number" min="1" value={filters.fiscalYear} onChange={update} className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="fiscal-month">Fiscal month<select id="fiscal-month" name="fiscalMonth" value={filters.fiscalMonth} onChange={update} className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Month {index + 1}</option>)}</select></label></CardContent></Card>{!filters.memberId && <Card><CardContent className="flex flex-col items-center gap-3 p-12 text-center"><CircleDollarSign className="text-muted-foreground" /><p className="text-sm text-muted-foreground">Select a member to view their collection summary.</p></CardContent></Card>}{filters.memberId && error && <p className="text-sm text-destructive">{error.message}</p>}{filters.memberId && isFetching && <p className="text-sm text-muted-foreground">Loading summary…</p>}{summary && !isFetching && <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(metricLabels).map(([key, label]) => <Card key={key}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">ETB {Number(summary[key] || 0).toLocaleString()}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Fiscal year {summary.fiscal_year}, month {summary.fiscal_month}</p></CardContent></Card>)}</section>}</main>
}

export default TransactionSummaryPage
