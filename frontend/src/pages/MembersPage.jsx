import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, Search, UserPlus, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useMembers } from "@/hooks/use-members"

function MembersPage() {
  const { data: members = [], isLoading, error } = useMembers()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return members.filter((member) => {
      const matchesSearch = !term || [member.name, member.phone_number, member.id_card_number].some((value) => value?.toLowerCase().includes(term))
      const matchesStatus = status === "all" || member.status === status
      return matchesSearch && matchesStatus
    })
  }, [members, search, status])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="secondary" className="mb-3">Member management</Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Members</h1>
          <p className="mt-2 text-muted-foreground">Register, update, and review the people in your cooperative.</p>
        </div>
        <Button render={<Link to="/members/new" />}><UserPlus data-icon="inline-start" /> Register member</Button>
      </section>

      <Card>
        <CardHeader className="gap-4 border-b md:flex-row md:items-end md:justify-between">
          <div><CardTitle>Member directory</CardTitle><CardDescription className="mt-1">{filteredMembers.length} of {members.length} members shown.</CardDescription></div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-64"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone" className="pl-9" aria-label="Search members" /></div>
            <div className="flex gap-1 rounded-xl bg-muted p-1" aria-label="Filter by member status">
              {["all", "active", "exited"].map((option) => <Button key={option} type="button" size="sm" variant={status === option ? "default" : "ghost"} onClick={() => setStatus(option)}>{option[0].toUpperCase() + option.slice(1)}</Button>)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading members…</p>}
          {error && <p className="p-6 text-sm text-destructive">{error.status === 401 ? "Sign in to view members." : error.message}</p>}
          {!isLoading && !error && filteredMembers.length === 0 && <div className="flex flex-col items-center gap-3 p-12 text-center"><Users className="text-muted-foreground" /><p className="text-sm text-muted-foreground">No members match the current filters.</p></div>}
          {!isLoading && !error && filteredMembers.length > 0 && <Table>
            <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Phone</TableHead><TableHead>Joined</TableHead><TableHead>Status</TableHead><TableHead className="w-12"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
            <TableBody>{filteredMembers.map((member) => <TableRow key={member.id}>
              <TableCell><Link to={`/members/${member.id}`} className="font-medium hover:text-primary hover:underline">{member.name}</Link><p className="mt-1 text-xs text-muted-foreground">{member.gender}{member.age ? ` · ${member.age} years` : ""}</p></TableCell>
              <TableCell>{member.phone_number}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(member.date_joined).toLocaleDateString()}</TableCell>
              <TableCell><Badge variant={member.status === "active" ? "default" : "secondary"}>{member.status}</Badge></TableCell>
              <TableCell><Button variant="ghost" size="icon-sm" render={<Link to={`/members/${member.id}`} />} aria-label={`Open ${member.name}`}><ArrowUpRight /></Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>}
        </CardContent>
      </Card>
    </main>
  )
}

export default MembersPage
