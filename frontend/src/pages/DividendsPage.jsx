import { useMemo, useState } from "react"
import { Calculator, CheckCircle2, Coins, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMembers } from "@/hooks/use-members"
import { useCalculateDividends, useDividendHistory, useDividendPreview } from "@/hooks/use-dividends"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

function currentFiscalYear() {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

function amount(value) { return `ETB ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` }

function DividendsPage() {
  const [fiscalYear, setFiscalYear] = useState(String(currentFiscalYear()))
  const yearOptions = useMemo(() => Array.from({ length: 7 }, (_, index) => String(currentFiscalYear() - 3 + index)), [])
  const previewQuery = useDividendPreview(fiscalYear)
  const historyQuery = useDividendHistory({ fiscal_year: fiscalYear })
  const { data: members = [] } = useMembers()
  const calculateMutation = useCalculateDividends()
  const memberNames = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members])
  const preview = previewQuery.data
  const monthly = preview?.monthlyBreakdown || []
  const history = historyQuery.data || []
  const totalProfit = monthly.reduce((sum, row) => sum + Number(row.profit), 0)
  const totalSavingsPool = monthly.reduce((sum, row) => sum + Number(row.savings_pool), 0)
  const totalSharePool = monthly.reduce((sum, row) => sum + Number(row.share_pool), 0)

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-8"><section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary" className="mb-3">Annual allocation</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Dividends</h1><p className="mt-2 max-w-2xl text-muted-foreground">Preview the fiscal-year profit allocation before saving member dividend records.</p></div><div className="w-full sm:w-52"><Select value={fiscalYear} onValueChange={setFiscalYear}><SelectTrigger aria-label="Select fiscal year"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{yearOptions.map((year) => <SelectItem key={year} value={year}>Fiscal year {year}</SelectItem>)}</SelectGroup></SelectContent></Select></div></section>
    {previewQuery.isLoading && <p className="text-sm text-muted-foreground">Calculating fiscal-year preview…</p>}
    {previewQuery.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{previewQuery.error.message}</p>}
    {preview && <><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Members eligible" value={preview.perMember.length} icon={Coins} /><MetricCard label="Total profit" value={amount(totalProfit)} icon={Calculator} /><MetricCard label="Savings pool" value={amount(totalSavingsPool)} icon={Coins} /><MetricCard label="Share pool" value={amount(totalSharePool)} icon={Coins} /></section><Card><CardHeader className="flex flex-col gap-4 border-b md:flex-row md:items-end md:justify-between"><div><CardTitle>Calculation preview</CardTitle><CardDescription className="mt-1">The backend calculates profit after expenses, then allocates 65% to savings, 20% to shares, and 15% to reserve.</CardDescription></div><Button onClick={() => calculateMutation.mutate(Number(fiscalYear))} disabled={calculateMutation.isPending}><Calculator data-icon="inline-start" />{calculateMutation.isPending ? "Calculating…" : "Save dividend calculation"}</Button></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Fiscal month</TableHead><TableHead>Month ending</TableHead><TableHead>Revenue</TableHead><TableHead>Expenses</TableHead><TableHead>Profit</TableHead><TableHead className="text-right">Reserve</TableHead></TableRow></TableHeader><TableBody>{monthly.map((row) => <TableRow key={row.fiscal_month}><TableCell>Month {row.fiscal_month}</TableCell><TableCell className="text-muted-foreground">{formatEthiopianDate(row.month_end_date)}</TableCell><TableCell>{amount(row.revenue)}</TableCell><TableCell>{amount(row.expenses)}</TableCell><TableCell className="font-medium">{amount(row.profit)}</TableCell><TableCell className="text-right">{amount(row.reserve)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></>}
    {calculateMutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{calculateMutation.error.message}</p>}{calculateMutation.isSuccess && <p className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary"><CheckCircle2 /> Dividend records saved for fiscal year {fiscalYear}.</p>}
    <Card><CardHeader><CardTitle>Saved dividend records</CardTitle><CardDescription>Member-level records already calculated for fiscal year {fiscalYear}.</CardDescription></CardHeader><CardContent className="p-0">{historyQuery.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading saved records…</p>}{historyQuery.error && <p className="p-6 text-sm text-destructive">{historyQuery.error.message}</p>}{!historyQuery.isLoading && !historyQuery.error && history.length === 0 && <div className="flex flex-col items-center gap-3 p-12 text-center"><RefreshCw className="text-muted-foreground" /><p className="text-sm text-muted-foreground">No dividend records have been saved for this fiscal year.</p></div>}{!historyQuery.isLoading && !historyQuery.error && history.length > 0 && <Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Savings dividend</TableHead><TableHead>Share dividend</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{history.map((record) => <TableRow key={record.id}><TableCell className="font-medium">{memberNames.get(record.member_id) || record.member_id}</TableCell><TableCell>{amount(record.savings_dividend)}</TableCell><TableCell>{amount(record.share_dividend)}</TableCell><TableCell className="text-right font-medium">{amount(Number(record.savings_dividend) + Number(record.share_dividend))}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </main>
}

function MetricCard({ label, value, icon: Icon }) { return <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardDescription>{label}</CardDescription><CardTitle className="mt-2 text-2xl">{typeof value === "number" ? value.toLocaleString() : value}</CardTitle></div><div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon /></div></CardHeader></Card> }

export default DividendsPage
