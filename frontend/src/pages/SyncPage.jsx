import { useMemo, useState } from "react"
import { CheckCircle2, Cloud, Database, RefreshCw, TriangleAlert } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress, ProgressIndicator } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useRunSync, useSyncStatus } from "@/hooks/use-settings"
import { formatEthiopianDateTime } from "@/lib/ethiopian-calendar"

function SyncPage() {
  const { data: status, isLoading, error, refetch } = useSyncStatus()
  const syncMutation = useRunSync()
  const [lastRun, setLastRun] = useState(null)
  const tables = useMemo(() => Object.entries(status?.tables || {}), [status?.tables])
  const pendingRows = Number(status?.pending_rows || 0)
  const remote = status?.remote
  const remoteHealthy = remote?.ok === true
  const run = () => {
    setLastRun(null)
    syncMutation.mutate(undefined, { onSuccess: setLastRun })
  }
  const failedCount = lastRun?.summary?.failed || 0
  const pushStats = useMemo(() => {
    if (!lastRun?.details?.length) return null
    return lastRun.details.reduce((totals, detail) => ({
      found: totals.found + Number(detail.found || 0),
      processed: totals.processed + Number(detail.pushed || 0) + Number(detail.skipped || 0) + (detail.failed?.length || 0),
    }), { found: 0, processed: 0 })
  }, [lastRun])
  const progressValue = syncMutation.isPending ? null : pushStats?.found ? Math.min(100, Math.round((pushStats.processed / pushStats.found) * 100)) : status ? pendingRows === 0 ? 100 : null : null
  const progressDescription = syncMutation.isPending
    ? "Pulling remote changes and pushing local changes."
    : lastRun
      ? `${pushStats?.processed || 0} of ${pushStats?.found || 0} local rows processed.`
      : pendingRows === 0 ? "All local changes are synchronized." : `${pendingRows} local row${pendingRows === 1 ? "" : "s"} are ready to synchronize.`
  const progressLabel = syncMutation.isPending ? "Synchronizing…" : progressValue === null ? "Ready to synchronize" : `${progressValue}% processed`

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary" className="mb-3">System operations</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Synchronization</h1><p className="mt-2 max-w-2xl text-muted-foreground">Monitor the local queue, check remote connectivity, and synchronize cooperative data.</p></div><Button onClick={run} disabled={syncMutation.isPending || isLoading}><RefreshCw data-icon="inline-start" />{syncMutation.isPending ? "Synchronizing…" : "Synchronize now"}</Button></section>
    {error && <Alert variant="destructive"><AlertTitle>Unable to check sync status</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert>}{syncMutation.error && <Alert variant="destructive"><AlertTitle>Synchronization failed</AlertTitle><AlertDescription>{syncMutation.error.message}</AlertDescription></Alert>}{lastRun && <Alert variant={lastRun.ok ? undefined : "destructive"}><AlertTitle>{lastRun.ok ? "Synchronization completed" : "Synchronization completed with errors"}</AlertTitle><AlertDescription>{lastRun.summary ? `${lastRun.summary.pushed} pushed, ${lastRun.summary.pulled} pulled, ${lastRun.summary.skipped} skipped, ${failedCount} failed.` : "The synchronization request completed."}</AlertDescription></Alert>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Remote status" value={isLoading ? "Checking…" : error ? "Unavailable" : remoteHealthy ? "Connected" : "Unavailable"} icon={!isLoading && !error && remoteHealthy ? CheckCircle2 : TriangleAlert} /><Metric label="Pending local rows" value={pendingRows} icon={Database} /><Metric label="Last checked" value={remote?.checked_at ? <span className="font-amharic">{formatEthiopianDateTime(remote.checked_at)}</span> : "—"} icon={Cloud} /><Metric label="Tables tracked" value={tables.length || "—"} icon={Database} /></section>
    <Card><CardHeader><CardTitle>Sync progress</CardTitle><CardDescription>{progressDescription}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><Progress value={progressValue} aria-label="Synchronization progress"><ProgressIndicator className={progressValue === null ? "w-1/3 animate-pulse" : undefined} /></Progress><div className="flex justify-between text-xs text-muted-foreground"><span>{remoteHealthy ? "Remote connection ready" : "Remote connection unavailable"}</span><span>{progressLabel}</span></div></CardContent></Card>
    <Card><CardHeader className="flex flex-col gap-4 border-b md:flex-row md:items-end md:justify-between"><div><CardTitle>Local sync queue</CardTitle><CardDescription>Rows with pending changes waiting to be pushed to the remote database.</CardDescription></div><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}><RefreshCw data-icon="inline-start" /> Refresh status</Button></CardHeader><CardContent className="p-0">{isLoading ? <p className="p-6 text-sm text-muted-foreground">Loading synchronization status…</p> : tables.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No table status is available.</p> : <Table><TableHeader><TableRow><TableHead>Table</TableHead><TableHead>Pending rows</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{tables.map(([table, count]) => <TableRow key={table}><TableCell className="flex items-center gap-3 font-medium"><Database className="text-muted-foreground" />{table.replaceAll("_", " ")}</TableCell><TableCell>{count}</TableCell><TableCell><Badge variant={count === 0 ? "secondary" : "outline"}>{count === 0 ? "Up to date" : "Pending"}</Badge></TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
    {lastRun?.details?.length > 0 && <Card><CardHeader><CardTitle>Latest run details</CardTitle><CardDescription>Per-table results from the most recent synchronization.</CardDescription></CardHeader><CardContent><Accordion multiple>{lastRun.details.map((detail) => <AccordionItem key={detail.table} value={detail.table}><AccordionTrigger>{detail.table}<Badge variant={detail.failed?.length ? "destructive" : "secondary"}>{detail.failed?.length ? `${detail.failed.length} failed` : `${detail.pushed} pushed`}</Badge></AccordionTrigger><AccordionContent><div className="grid gap-3 sm:grid-cols-3"><Info label="Found" value={detail.found} /><Info label="Pushed" value={detail.pushed} /><Info label="Skipped" value={detail.skipped} /></div>{detail.failed?.length > 0 && <div className="mt-4 flex flex-col gap-2">{detail.failed.map((failure) => <Alert key={failure.id} variant="destructive"><AlertDescription>{failure.id}: {failure.error}</AlertDescription></Alert>)}</div>}</AccordionContent></AccordionItem>)}</Accordion></CardContent></Card>}
    <Card><CardHeader><CardTitle>Remote connection</CardTitle><CardDescription>The service checks the remote PostgreSQL connection before reporting health.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Status" value={error ? "Unavailable" : isLoading ? "Checking…" : remoteHealthy ? "Connected" : "Unavailable"} /><Info label="Checked at" value={remote?.checked_at ? <span className="font-amharic">{formatEthiopianDateTime(remote.checked_at)}</span> : "—"} /><Info label="Remote response" value={remote?.details ? JSON.stringify(remote.details) : remote?.error || error?.message || "—"} /></CardContent></Card>
  </main>
}

function Metric({ label, value, icon: Icon }) { return <Card><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardDescription>{label}</CardDescription><CardTitle className="mt-2 text-2xl capitalize">{value}</CardTitle></div><div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon /></div></CardHeader></Card> }
function Info({ label, value }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div> }

export default SyncPage
