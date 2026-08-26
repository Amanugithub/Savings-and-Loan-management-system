import { ArrowLeft, CircleDollarSign } from "lucide-react"
import { Link, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMember } from "@/hooks/use-members"
import { useMemberExit } from "@/hooks/use-member-exits"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

function amount(value) { return `ETB ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}` }

function MemberExitDetailPage() {
  const { id } = useParams()
  const { data: exit, isLoading, error } = useMemberExit(id)
  const { data: member } = useMember(exit?.member_id)
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading exit record…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-8"><section><Button variant="ghost" render={<Link to="/member-exits" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to member exits</Button><Badge variant="outline" className="mb-3">Completed payout</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{member?.name || "Member exit"}</h1><p className="mt-2 text-muted-foreground">Exit processed on {formatEthiopianDate(exit.exit_date)}</p></section><Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign /> {amount(exit.net_amount_paid)}</CardTitle><CardDescription>Net amount paid to the member after government withholding.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Savings returned" value={amount(exit.savings_returned)} /><Info label="Shares returned" value={amount(exit.shares_returned)} /><Info label="Dividend owed" value={amount(exit.dividend_owed)} /><Info label="Government withholding" value={amount(exit.government_withholding)} /><Info label="Exit record ID" value={exit.id} /></CardContent></Card></main>
}

function Info({ label, value }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div> }

export default MemberExitDetailPage
