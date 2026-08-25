import { ArrowUpRight, BriefcaseBusiness, CircleDollarSign, TrendingUp, Users, WalletCards } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const summaryCards = [
  { label: "Total savings", value: "ETB 2.48M", detail: "+12.8% from last month", icon: WalletCards },
  { label: "Active members", value: "369", detail: "+18 this month", icon: Users },
  { label: "Active loans", value: "84", detail: "ETB 1.16M outstanding", icon: BriefcaseBusiness },
  { label: "This month’s income", value: "ETB 184.6K", detail: "+8.4% from last month", icon: CircleDollarSign },
]

const recentTransactions = [
  { member: "Hana Tadesse", type: "Savings deposit", amount: "+ ETB 2,000", time: "12 minutes ago" },
  { member: "Mekonnen Alemu", type: "Loan installment", amount: "+ ETB 4,500", time: "38 minutes ago" },
  { member: "Rahel Bekele", type: "Share purchase", amount: "+ ETB 1,200", time: "1 hour ago" },
  { member: "Dawit Girma", type: "Loan disbursement", amount: "− ETB 25,000", time: "2 hours ago" },
]

function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="secondary" className="mb-3">Tuesday, August 25, 2026</Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Dashboard</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">A clear view of your cooperative&apos;s savings, members, and lending activity.</p>
        </div>
        <Button>
          Record transaction
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="mt-2 text-2xl">{card.value}</CardTitle>
                </div>
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon />
                </div>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><TrendingUp className="text-primary" /> {card.detail}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-end justify-between gap-4 border-b">
            <div>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription className="mt-1">The latest activity across your cooperative.</CardDescription>
            </div>
            <Button variant="link" className="h-auto p-0">View all</Button>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {recentTransactions.map((transaction) => (
              <div key={`${transaction.member}-${transaction.time}`} className="flex items-center justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{transaction.member}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{transaction.type} · {transaction.time}</p>
                </div>
                <p className="shrink-0 text-sm font-medium">{transaction.amount}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loan portfolio</CardTitle>
            <CardDescription className="mt-1">Current loan distribution by status.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {[['Active', '84', 'bg-primary'], ['Pending review', '12', 'bg-chart-2'], ['Closed this month', '18', 'bg-muted-foreground/40']].map(([label, value, color]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3"><span className={`size-2.5 rounded-full ${color}`} /><span className="text-sm">{label}</span></div>
                <span className="font-heading text-sm font-semibold">{value}</span>
              </div>
            ))}
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-[72%] rounded-full bg-primary" /></div>
            <p className="text-xs text-muted-foreground">72% of the portfolio is currently active and being repaid.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

export default DashboardPage
