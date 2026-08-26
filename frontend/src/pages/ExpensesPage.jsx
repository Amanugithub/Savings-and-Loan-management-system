import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, CircleDollarSign, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useExpenses } from "@/hooks/use-expenses"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

const categories = ["all", "supplies", "utilities", "rent", "maintenance", "equipment", "other"]

function labelFor(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ExpensesPage() {
  const [filters, setFilters] = useState({ category: "" })
  const { data: expenses = [], isLoading, error } = useExpenses(filters)
  const total = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.amount), 0), [expenses])

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary" className="mb-3">Operations finance</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Expenses</h1><p className="mt-2 text-muted-foreground">Record and review the operating costs that affect monthly profit.</p></div><Button render={<Link to="/expenses/new" />}><Plus data-icon="inline-start" /> Record expense</Button></section>
    <section className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardDescription>Visible expenses</CardDescription><CardTitle className="text-2xl">{expenses.length}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>Visible total</CardDescription><CardTitle className="text-2xl">ETB {total.toLocaleString()}</CardTitle></CardHeader></Card></section>
    <Card><CardHeader className="gap-4 border-b md:flex-row md:items-end md:justify-between"><div><CardTitle>Expense register</CardTitle><CardDescription className="mt-1">Expenses are ordered from newest to oldest.</CardDescription></div><Select value={filters.category || "all"} onValueChange={(category) => setFilters({ category: category === "all" ? "" : category })}><SelectTrigger className="w-full sm:w-52" aria-label="Filter expenses by category"><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectGroup>{categories.map((category) => <SelectItem key={category} value={category}>{category === "all" ? "All categories" : labelFor(category)}</SelectItem>)}</SelectGroup></SelectContent></Select></CardHeader><CardContent className="p-0">{isLoading && <p className="p-6 text-sm text-muted-foreground">Loading expenses…</p>}{error && <p className="p-6 text-sm text-destructive">{error.status === 401 ? "Sign in to view expenses." : error.message}</p>}{!isLoading && !error && expenses.length === 0 && <Empty className="m-6"><EmptyMedia><CircleDollarSign /></EmptyMedia><EmptyTitle>No expenses found</EmptyTitle><EmptyDescription>No expenses match the selected category.</EmptyDescription></Empty>}{!isLoading && !error && expenses.length > 0 && <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-12"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{expenses.map((expense) => <TableRow key={expense.id}><TableCell className="whitespace-nowrap text-muted-foreground">{formatEthiopianDate(expense.date)}</TableCell><TableCell><Badge variant="outline">{labelFor(expense.category)}</Badge></TableCell><TableCell className="max-w-80 truncate text-muted-foreground">{expense.description || "—"}</TableCell><TableCell className="text-right font-medium">ETB {Number(expense.amount).toLocaleString()}</TableCell><TableCell><Button variant="ghost" size="icon-sm" render={<Link to={`/expenses/${expense.id}`} />} aria-label="Open expense"><ArrowUpRight /></Button></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </main>
}

export default ExpensesPage
