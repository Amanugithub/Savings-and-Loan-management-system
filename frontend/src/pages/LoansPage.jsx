import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, BriefcaseBusiness, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMembers } from "@/hooks/use-members"
import { useLoans } from "@/hooks/use-loans"

const statuses = ["all", "pending", "active", "closed", "rejected"]
const statusVariant = { pending: "secondary", active: "default", closed: "outline", rejected: "destructive" }

function LoansPage() {
  const [filters, setFilters] = useState({ status: "", member_id: "" })
  const { data: loans = [], isLoading, error } = useLoans(filters)
  const { data: members = [] } = useMembers()
  const memberNames = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members])
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value === "all" ? "" : value }))

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-8"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary" className="mb-3">Lending operations</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Loans</h1><p className="mt-2 text-muted-foreground">Review applications, manage active lending, and track repayment lifecycle.</p></div><Button render={<Link to="/loans/new" />}><Plus data-icon="inline-start" /> New loan application</Button></section><Card><CardHeader className="gap-4 border-b md:flex-row md:items-end md:justify-between"><div><CardTitle>Loan portfolio</CardTitle><CardDescription className="mt-1">{loans.length} loan{loans.length === 1 ? "" : "s"} in the current view.</CardDescription></div><div className="grid gap-3 sm:grid-cols-2"><Select value={filters.status || "all"} onValueChange={(value) => updateFilter("status", value)}><SelectTrigger aria-label="Filter loans by status"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectGroup>{statuses.map((status) => <SelectItem key={status} value={status}>{status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectGroup></SelectContent></Select><Select value={filters.member_id || "all"} onValueChange={(value) => updateFilter("member_id", value)}><SelectTrigger aria-label="Filter loans by member"><SelectValue placeholder="All members" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All members</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectGroup></SelectContent></Select></div></CardHeader><CardContent className="p-0">{isLoading && <p className="p-6 text-sm text-muted-foreground">Loading loans…</p>}{error && <p className="p-6 text-sm text-destructive">{error.status === 401 ? "Sign in to view loans." : error.message}</p>}{!isLoading && !error && loans.length === 0 && <div className="flex flex-col items-center gap-3 p-12 text-center"><BriefcaseBusiness className="text-muted-foreground" /><p className="text-sm text-muted-foreground">No loans match the selected filters.</p></div>}{!isLoading && !error && loans.length > 0 && <Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Type</TableHead><TableHead>Principal</TableHead><TableHead>Term</TableHead><TableHead>Status</TableHead><TableHead className="w-12"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{loans.map((loan) => <TableRow key={loan.id}><TableCell><Link to={`/loans/${loan.id}`} className="font-medium hover:text-primary hover:underline">{memberNames.get(loan.member_id) || "Unknown member"}</Link><p className="mt-1 text-xs text-muted-foreground">{loan.id.slice(0, 8)}…</p></TableCell><TableCell className="capitalize">{loan.type.replace("_", " ")}</TableCell><TableCell>ETB {Number(loan.principal_amount).toLocaleString()}</TableCell><TableCell>{loan.term_years} year{loan.term_years === 1 ? "" : "s"}</TableCell><TableCell><Badge variant={statusVariant[loan.status] || "secondary"}>{loan.status}</Badge></TableCell><TableCell><Button variant="ghost" size="icon-sm" render={<Link to={`/loans/${loan.id}`} />} aria-label="Open loan"><ArrowUpRight /></Button></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></main>
}

export default LoansPage
