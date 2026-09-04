import { useMemo, useState } from "react"
import { ArrowUpRight, CalendarClock, DoorOpen, ShieldAlert } from "lucide-react"
import { Link } from "react-router-dom"

import { AlertDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMembers } from "@/hooks/use-members"
import { useMemberExitPreview, useMemberExits, useProcessMemberExit } from "@/hooks/use-member-exits"
import { cn } from "@/lib/utils"
import { formatEthiopianDate, todayGregorianIso } from "@/lib/ethiopian-calendar"

function amount(value) {
  return `ETB ${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`
}

function MemberExitsPage() {
  const today = todayGregorianIso()

  const [memberId, setMemberId] = useState("")
  const [exitDate, setExitDate] = useState(today)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: members = [] } = useMembers()
  const { data: exits = [], isLoading, error } = useMemberExits({})
  const previewQuery = useMemberExitPreview({ memberId, exitDate })
  const processMutation = useProcessMemberExit()

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  )

  const memberNames = useMemo(
    () => new Map(members.map((member) => [member.id, member.name])),
    [members],
  )

  const preview = previewQuery.data

  const processExit = () => {
    processMutation.mutate(
      {
        member_id: memberId,
        exit_date: exitDate,
      },
      {
        onSuccess: () => {
          setMemberId("")
          setExitDate(today)
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <section>
        <Badge variant="secondary" className="mb-3">
          Member lifecycle
        </Badge>

        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Member exits
        </h1>

        <p className="mt-2 max-w-2xl text-muted-foreground">
          Review a member&apos;s balance and dividend entitlement before processing their resignation payout.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Process a member exit</CardTitle>
          <CardDescription>
            The backend checks active loans, guarantor obligations, and calculates the final payout.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label
              className="flex flex-col gap-2 text-sm font-medium"
              htmlFor="exit-member"
            >
              Member

              <Select
                value={memberId || undefined}
                onValueChange={setMemberId}
              >
                <SelectTrigger id="exit-member" className="w-full">
                  <SelectValue placeholder="Select an active member" />
                </SelectTrigger>

                <SelectContent>
                  <SelectGroup>
                    {activeMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} · {member.phone_number}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>

            <label
              className="flex flex-col gap-2 text-sm font-medium"
              htmlFor="exit-date"
            >
              Exit date

              <DatePicker
                value={exitDate}
                onChange={setExitDate}
                placeholder="Select exit date"
                aria-label="Exit date"
                calendarDisabled={{ after: new Date() }}
              />
            </label>
          </div>

          {previewQuery.isLoading && (
            <p className="text-sm text-muted-foreground">
              Calculating payout preview…
            </p>
          )}

          {previewQuery.error && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <ShieldAlert />
              {previewQuery.error.message}
            </p>
          )}

          {preview && (
            <div className="grid gap-4 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Payout label="Savings returned" value={preview.savings_returned} />
              <Payout label="Shares returned" value={preview.shares_returned} />
              <Payout label="Dividend owed" value={preview.dividend_owed} />
              <Payout label="Withholding" value={preview.government_withholding} />
              <Payout
                label="Net payout"
                value={preview.net_amount_paid}
                emphasis
              />
            </div>
          )}

          {processMutation.error && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {processMutation.error.message}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={!preview || processMutation.isPending}
            >
              <DoorOpen data-icon="inline-start" />
              {processMutation.isPending
                ? "Processing…"
                : "Process member exit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exit history</CardTitle>
          <CardDescription>Completed resignation payouts.</CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading && (
            <p className="p-6 text-sm text-muted-foreground">
              Loading exit records…
            </p>
          )}

          {error && (
            <p className="p-6 text-sm text-destructive">
              {error.message}
            </p>
          )}

          {!isLoading && !error && exits.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <CalendarClock className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No member exits have been processed.
              </p>
            </div>
          )}

          {!isLoading && !error && exits.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Exit date</TableHead>
                  <TableHead>Dividend owed</TableHead>
                  <TableHead>Withholding</TableHead>
                  <TableHead className="text-right">Net payout</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {exits.map((exit) => (
                  <TableRow key={exit.id}>
                    <TableCell className="font-medium">
                      {memberNames.get(exit.member_id) || exit.member_id}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {formatEthiopianDate(exit.exit_date)}
                    </TableCell>

                    <TableCell>
                      {amount(exit.dividend_owed)}
                    </TableCell>

                    <TableCell>
                      {amount(exit.government_withholding)}
                    </TableCell>

                    <TableCell className="text-right font-medium">
                      {amount(exit.net_amount_paid)}
                    </TableCell>

                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        render={<Link to={`/member-exits/${exit.id}`} />}
                        aria-label="Open exit record"
                      >
                        <ArrowUpRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Process member exit?"
        description="This will process the member's resignation payout and complete their exit. This action cannot be undone."
        confirmLabel={
          processMutation.isPending ? "Processing…" : "Confirm exit"
        }
        cancelLabel="Cancel"
        onConfirm={processExit}
        destructive
        disabled={processMutation.isPending}
      />
    </main>
  )
}

function Payout({ label, value, emphasis }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-medium",
          emphasis && "text-primary",
        )}
      >
        {amount(value)}
      </p>
    </div>
  )
}

export default MemberExitsPage