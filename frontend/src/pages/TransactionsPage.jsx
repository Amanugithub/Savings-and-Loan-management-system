import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Plus, Receipt, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMembers } from "@/hooks/use-members"
import { useTransactions } from "@/hooks/use-transactions"

const transactionTypes = ["", "savings_deposit", "share_purchase", "penalty_payment", "registration_fee", "card_fee", "loan_disbursement", "loan_installment", "loan_interest", "loan_insurance", "bank_interest_income"]
const typeLabels = { savings_deposit: "Savings deposit", share_purchase: "Share purchase", penalty_payment: "Penalty payment", registration_fee: "Registration fee", card_fee: "Card fee", loan_disbursement: "Loan disbursement", loan_installment: "Loan installment", loan_interest: "Loan interest", loan_insurance: "Loan insurance", bank_interest_income: "Bank interest income" }

function TransactionsPage() {
  const [filters, setFilters] = useState({ type: "", member_id: "", date_from: "", date_to: "", limit: 20, offset: 0 })
  const { data, isLoading, error } = useTransactions(filters)
  const { data: members = [] } = useMembers()
  const memberNames = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members])
  const transactions = data?.data ?? []
  const pagination = data?.pagination
  const clearFilters = () => setFilters({ type: "", member_id: "", date_from: "", date_to: "", limit: 20, offset: 0 })

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary" className="mb-3">Financial activity</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Transactions</h1><p className="mt-2 text-muted-foreground">Track every savings, share, fee, and loan movement.</p></div><Button render={<Link to="/transactions/new" />}><Plus data-icon="inline-start" /> Record transaction</Button></section>
    <Card><CardHeader className="gap-4 border-b"><div><CardTitle>Transaction ledger</CardTitle><CardDescription className="mt-1">Showing {transactions.length} records from the current page.</CardDescription></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Select value={filters.member_id || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, member_id: value === "all" ? "" : value, offset: 0 }))}><SelectTrigger className="w-full pl-9" aria-label="Filter by member"><SelectValue placeholder="All members" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All members</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div><Select value={filters.type || "all"} onValueChange={(value) => setFilters((current) => ({ ...current, type: value === "all" ? "" : value, offset: 0 }))}><SelectTrigger aria-label="Filter by transaction type"><SelectValue placeholder="All types" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All types</SelectItem>{transactionTypes.slice(1).map((type) => <SelectItem key={type} value={type}>{typeLabels[type]}</SelectItem>)}</SelectGroup></SelectContent></Select><DatePicker value={filters.date_from} onChange={(date_from) => setFilters((current) => ({ ...current, date_from, offset: 0 }))} placeholder="From date" aria-label="From date" /><DatePicker value={filters.date_to} onChange={(date_to) => setFilters((current) => ({ ...current, date_to, offset: 0 }))} placeholder="To date" aria-label="To date" /></div><div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button></div></CardHeader><CardContent className="p-0">
      {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading transactions…</p>}
      {error && <p className="p-6 text-sm text-destructive">{error.status === 401 ? "Sign in to view transactions." : error.message}</p>}
      {!isLoading && !error && transactions.length === 0 && <div className="flex flex-col items-center gap-3 p-12 text-center"><Receipt className="text-muted-foreground" /><p className="text-sm text-muted-foreground">No transactions match the selected filters.</p></div>}
      {!isLoading && !error && transactions.length > 0 && <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{transactions.map((transaction) => { const isOutflow = ["loan_disbursement", "member_exit_payout"].includes(transaction.type); return <TableRow key={transaction.id}><TableCell className="whitespace-nowrap text-muted-foreground">{new Date(transaction.date).toLocaleDateString()}</TableCell><TableCell className="font-medium">{transaction.member_id ? memberNames.get(transaction.member_id) || "Unknown member" : "Organization"}</TableCell><TableCell><Badge variant="outline">{typeLabels[transaction.type] || transaction.type}</Badge></TableCell><TableCell className="max-w-64 truncate text-muted-foreground">{transaction.notes || "—"}</TableCell><TableCell className={`text-right font-medium ${isOutflow ? "text-destructive" : "text-primary"}`}><span className="inline-flex items-center gap-1">{isOutflow ? <ArrowDownLeft /> : <ArrowUpRight />}{isOutflow ? "−" : "+"} ETB {Number(transaction.amount).toLocaleString()}</span></TableCell></TableRow>})}</TableBody></Table>}
      {!isLoading && !error && <div className="flex items-center justify-between border-t px-6 py-4"><p className="text-xs text-muted-foreground">Page {Math.floor((filters.offset || 0) / filters.limit) + 1}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={filters.offset === 0} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, current.offset - current.limit) }))}><ChevronLeft /> Previous</Button><Button variant="outline" size="sm" disabled={!pagination?.has_more} onClick={() => setFilters((current) => ({ ...current, offset: current.offset + current.limit }))}>Next <ChevronRight /></Button></div></div>}
    </CardContent></Card>
    <Button variant="outline" className="w-fit" render={<Link to="/transactions/summary" />}><CalendarDays data-icon="inline-start" /> Open monthly collection sheet</Button>
  </main>
}

export default TransactionsPage
