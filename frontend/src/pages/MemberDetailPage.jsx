import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Edit, KeyRound, Phone, Receipt, UserRound, WalletCards } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useMember, useResetMemberPassword } from "@/hooks/use-members"
import { useLoans } from "@/hooks/use-loans"
import { useTransactions } from "@/hooks/use-transactions"
import { useDividendHistory } from "@/hooks/use-dividends"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

function MemberDetailPage() {
  const { id } = useParams()
  const { data: member, isLoading, error } = useMember(id)
  const transactionsQuery = useTransactions({ member_id: id, limit: 6, offset: 0 })
  const loansQuery = useLoans({ member_id: id })
  const dividendsQuery = useDividendHistory({ member_id: id })
  const [password, setPassword] = useState({ new_password: "", confirm_password: "" })
  const [passwordMessage, setPasswordMessage] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const passwordMutation = useResetMemberPassword()

  const transactions = transactionsQuery.data?.data ?? []
  const loans = loansQuery.data ?? []
  const dividends = dividendsQuery.data ?? []
  const activityLoading = transactionsQuery.isLoading || loansQuery.isLoading || dividendsQuery.isLoading
  const activityError = transactionsQuery.error || loansQuery.error || dividendsQuery.error

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading member…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  const updatePassword = (event) => setPassword((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submitPassword = (event) => {
    event.preventDefault()
    setPasswordMessage(null)
    if (password.new_password.length < 8) {
      setPasswordMessage({ variant: "destructive", title: "Password is too short", description: "Use at least eight characters." })
      return
    }
    if (password.new_password !== password.confirm_password) {
      setPasswordMessage({ variant: "destructive", title: "Passwords do not match", description: "Enter the same password in both fields." })
      return
    }
    setConfirmOpen(true)
  }
  const confirmPasswordReset = () => {
    passwordMutation.mutate(
      { id: member.id, new_password: password.new_password },
      {
        onSuccess: (result) => {
          setConfirmOpen(false)
          setPassword({ new_password: "", confirm_password: "" })
          setPasswordMessage({ title: "Password updated", description: result.message })
        },
        onError: (mutationError) => {
          setConfirmOpen(false)
          setPasswordMessage({ variant: "destructive", title: "Password update failed", description: mutationError.message })
        },
      },
    )
  }

  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <section><Button variant="ghost" render={<Link to="/members" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to members</Button><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant={member.status === "active" ? "default" : "secondary"} className="mb-3">{member.status}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{member.name}</h1><p className="mt-2 flex items-center gap-2 text-muted-foreground"><Phone /> {member.phone_number}</p></div><Button variant="outline" render={<Link to={`/members/${member.id}/edit`} />}><Edit data-icon="inline-start" /> Edit member</Button></div></section>
    <section className="grid items-start gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="h-fit"><CardHeader><CardTitle className="flex items-center gap-2"><UserRound /> Profile</CardTitle><CardDescription>Personal and contact information.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Gender" value={member.gender} /><Info label="Age" value={member.age ? `${member.age} years` : "Not provided"} /><Info label="ID card" value={member.id_card_number || "Not provided"} /><Info label="Date joined" value={<span className="font-amharic">{formatEthiopianDate(member.date_joined)}</span>} /><Info label="Address" value={member.address || "Not provided"} /><Info label="Heir information" value={member.heir_info || "Not provided"} /></CardContent></Card>
      <Card className="md:row-span-2"><CardHeader><CardTitle>Member activity</CardTitle><CardDescription>Recent financial records connected to this member.</CardDescription></CardHeader><CardContent className="space-y-5">
        {activityLoading && <p className="text-sm text-muted-foreground">Loading member activity…</p>}
        {activityError && <p role="alert" className="text-sm text-destructive">Unable to load member activity: {activityError.message}</p>}
        {!activityLoading && !activityError && <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ActivityMetric icon={Receipt} label="Transactions" value={transactionsQuery.data?.pagination?.total ?? transactions.length} />
            <ActivityMetric icon={WalletCards} label="Loans" value={loans.length} />
            <ActivityMetric icon={ArrowUpRight} label="Dividend records" value={dividends.length} />
          </div>
          {transactions.length === 0 && loans.length === 0 && dividends.length === 0 ? <Empty><EmptyMedia><Receipt /></EmptyMedia><EmptyTitle>No activity yet</EmptyTitle><EmptyDescription>This member has no transactions, loans, or dividend history.</EmptyDescription></Empty> : <div className="grid gap-8">
            <ActivityList title="Recent transactions" icon={Receipt}>
              {transactions.slice(0, 4).map((transaction) => <ActivityRow key={transaction.id} label={transaction.type.replaceAll("_", " ")} detail={formatEthiopianDate(transaction.date)} amount={transaction.amount} outflow={["loan_disbursement", "member_exit_payout"].includes(transaction.type)} />)}
              {transactions.length === 0 && <ActivityEmpty text="No transactions" />}
            </ActivityList>
            <ActivityList title="Loans" icon={WalletCards}>
              {loans.slice(0, 4).map((loan) => <ActivityRow key={loan.id} label={loan.type.replaceAll("_", " ")} detail={loan.status} amount={loan.principal_amount} outflow={false} />)}
              {loans.length === 0 && <ActivityEmpty text="No loans" />}
            </ActivityList>
            <ActivityList title="Dividend history" icon={ArrowUpRight}>
              {dividends.slice(0, 4).map((dividend) => <ActivityRow key={dividend.id} label={`Fiscal year ${dividend.fiscal_year}`} detail={formatEthiopianDate(dividend.date_calculated)} amount={Number(dividend.savings_dividend || 0) + Number(dividend.share_dividend || 0)} outflow={false} />)}
              {dividends.length === 0 && <ActivityEmpty text="No dividend records" />}
            </ActivityList>
          </div>}
        </>}
      </CardContent></Card>
      <Card className="h-fit md:col-start-1"><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound /> Member access</CardTitle><CardDescription>Set or reset the password the member uses in the mobile app.</CardDescription></CardHeader><CardContent><form onSubmit={submitPassword} className="flex flex-col gap-5"><div className="grid gap-4 md:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="member-new-password">New password<Input id="member-new-password" name="new_password" type="password" minLength={8} value={password.new_password} onChange={updatePassword} required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="member-confirm-password">Confirm password<Input id="member-confirm-password" name="confirm_password" type="password" minLength={8} value={password.confirm_password} onChange={updatePassword} required /></label></div>{passwordMessage && <Alert variant={passwordMessage.variant}><AlertTitle>{passwordMessage.title}</AlertTitle><AlertDescription>{passwordMessage.description}</AlertDescription></Alert>}<div className="flex justify-end"><Button type="submit" disabled={passwordMutation.isPending}>{passwordMutation.isPending ? "Updating…" : "Update member password"}</Button></div></form></CardContent></Card>
    </section>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Update member password?" description={`This will replace the mobile login password for ${member.name}.`} confirmLabel="Update password" onConfirm={confirmPasswordReset} disabled={passwordMutation.isPending} />
  </main>
}

function Info({ label, value }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div> }

function ActivityMetric({ icon: Icon, label, value }) { return <div className="rounded-xl border bg-muted/30 p-3"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><span className="text-xs">{label}</span></div><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div> }

function ActivityList({ title, icon: Icon, children }) { return <div className="min-w-0"><h3 className="mb-3 flex items-center gap-2 text-sm font-medium capitalize"><Icon className="size-4 text-muted-foreground" />{title}</h3><div className="divide-y rounded-xl border">{children}</div></div> }

function ActivityRow({ label, detail, amount, outflow }) { return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium capitalize">{label}</p><p className="break-words text-xs text-muted-foreground">{detail}</p></div><p className={`flex shrink-0 items-center gap-1 text-right text-sm font-medium ${outflow ? "text-destructive" : "text-primary"}`}>{outflow ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}ETB {Number(amount || 0).toLocaleString()}</p></div> }

function ActivityEmpty({ text }) { return <p className="px-3 py-4 text-xs text-muted-foreground">{text}</p> }

export default MemberDetailPage
