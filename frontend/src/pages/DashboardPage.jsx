import { useMemo } from "react"
import { ArrowDownLeft, ArrowUpRight, BriefcaseBusiness, CircleDollarSign, TrendingUp, Users, WalletCards } from "lucide-react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useExpenses } from "@/hooks/use-expenses"
import { formatEthiopianDate, todayGregorianIso } from "@/lib/ethiopian-calendar"
import { useLoans } from "@/hooks/use-loans"
import { useMembers } from "@/hooks/use-members"
import { useTransactionBalances, useTransactions } from "@/hooks/use-transactions"

const incomeTypes = new Set(["savings_deposit", "share_purchase", "penalty_payment", "registration_fee", "card_fee", "loan_installment", "loan_interest", "loan_insurance", "bank_interest_income"])
const outflowTypes = new Set(["loan_disbursement", "member_exit_payout"])

function formatAmount(value) { return `ETB ${Number(value || 0).toLocaleString()}` }

function DashboardPage() {
  const membersQuery = useMembers()
  const loansQuery = useLoans({})
  const transactionsQuery = useTransactions({ limit: 100, offset: 0 })
  const balancesQuery = useTransactionBalances()
  const expensesQuery = useExpenses({})
  const members = useMemo(() => membersQuery.data || [], [membersQuery.data])
  const loans = loansQuery.data || []
  const transactions = transactionsQuery.data?.data || []
  const expenses = expensesQuery.data || []
  const isLoading = [membersQuery, loansQuery, transactionsQuery, balancesQuery, expensesQuery].some((query) => query.isLoading)
  const error = [membersQuery, loansQuery, transactionsQuery, balancesQuery, expensesQuery].find((query) => query.error)?.error
  const memberNames = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members])
  const monthKey = new Date().toISOString().slice(0, 7)
  const activeMembers = members.filter((member) => member.status === "active")
  const activeLoans = loans.filter((loan) => loan.status === "active")
  const pendingLoans = loans.filter((loan) => loan.status === "pending")
  const activeLoanPrincipal = activeLoans.reduce((sum, loan) => sum + Number(loan.principal_amount), 0)
  const totalSavings = Number(balancesQuery.data?.total_savings || 0)
  const totalShares = Number(balancesQuery.data?.total_shares || 0)
  const monthlyIncome = transactions.filter((transaction) => transaction.date?.slice(0, 7) === monthKey && incomeTypes.has(transaction.type)).reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const monthlyExpenses = expenses.filter((expense) => expense.date?.slice(0, 7) === monthKey).reduce((sum, expense) => sum + Number(expense.amount), 0)
  const recentTransactions = transactions.slice(0, 5)

  if (error) return <main className="mx-auto flex w-full max-w-7xl flex-col gap-4"><Badge variant="destructive">Dashboard unavailable</Badge><p className="text-sm text-muted-foreground">{error.status === 401 ? "Sign in again to load the dashboard." : error.message}</p></main>

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary" className="mb-3 font-amharic">{formatEthiopianDate(todayGregorianIso())}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Dashboard</h1><p className="mt-2 max-w-xl text-muted-foreground">A live view of your cooperative&apos;s savings, members, lending, and operating activity.</p></div><Button render={<Link to="/transactions/new" />}>Record transaction <ArrowUpRight data-icon="inline-end" /></Button></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><SummaryCard label="Total savings" value={formatAmount(totalSavings)} detail="Opening balance plus deposits" icon={WalletCards} isLoading={isLoading} /><SummaryCard label="Total shares" value={formatAmount(totalShares)} detail="Opening balance plus purchases" icon={WalletCards} isLoading={isLoading} /><SummaryCard label="Active members" value={activeMembers.length.toLocaleString()} detail={`${members.length.toLocaleString()} total members`} icon={Users} isLoading={isLoading} /><SummaryCard label="Active loans" value={activeLoans.length.toLocaleString()} detail={`${formatAmount(activeLoanPrincipal)} principal outstanding`} icon={BriefcaseBusiness} isLoading={isLoading} /><SummaryCard label="This month’s income" value={formatAmount(monthlyIncome)} detail={`${formatAmount(monthlyExpenses)} operating expenses`} icon={CircleDollarSign} isLoading={isLoading} /></section>
    <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"><Card><CardHeader className="flex flex-row items-end justify-between gap-4 border-b"><div><CardTitle>Recent transactions</CardTitle><CardDescription className="mt-1">The latest activity across your cooperative.</CardDescription></div><Button variant="link" className="h-auto p-0" render={<Link to="/transactions" />}>View all</Button></CardHeader><CardContent className="p-0">{isLoading ? <div className="flex flex-col gap-4 p-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> : recentTransactions.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No transactions have been recorded yet.</p> : recentTransactions.map((transaction) => { const isOutflow = outflowTypes.has(transaction.type); return <div key={transaction.id} className="flex items-center justify-between gap-4 border-b px-6 py-4 last:border-b-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.member_id ? memberNames.get(transaction.member_id) || "Unknown member" : "Organization"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{transaction.type.replaceAll("_", " ")} · <span className="font-amharic">{formatEthiopianDate(transaction.date)}</span></p></div><p className="flex shrink-0 items-center gap-1 text-sm font-medium">{isOutflow ? <ArrowDownLeft className="text-destructive" /> : <ArrowUpRight className="text-primary" />}{isOutflow ? "−" : "+"} {formatAmount(transaction.amount)}</p></div> })}</CardContent></Card><Card><CardHeader><CardTitle>Loan portfolio</CardTitle><CardDescription className="mt-1">Current loan distribution by status.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><PortfolioRow label="Active" value={activeLoans.length} /><PortfolioRow label="Pending review" value={pendingLoans.length} /><PortfolioRow label="Closed" value={loans.filter((loan) => loan.status === "closed").length} /><div className="flex items-center justify-between border-t pt-4"><span className="text-sm text-muted-foreground">Portfolio principal</span><span className="font-heading text-sm font-semibold">{formatAmount(activeLoanPrincipal)}</span></div><Button variant="outline" render={<Link to="/loans" />}>Open loan portfolio</Button></CardContent></Card></section>
  </main>
}

function SummaryCard({ label, value, detail, icon: Icon, isLoading }) { return <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardDescription>{label}</CardDescription>{isLoading ? <Skeleton className="mt-2 h-8 w-28" /> : <CardTitle className="mt-2 text-2xl">{value}</CardTitle>}</div><div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon /></div></CardHeader><CardContent><p className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="text-primary" /> {detail}</p></CardContent></Card> }
function PortfolioRow({ label, value }) { return <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="size-2.5 rounded-full bg-primary" /><span className="text-sm">{label}</span></div><span className="font-heading text-sm font-semibold">{value}</span></div> }

export default DashboardPage
