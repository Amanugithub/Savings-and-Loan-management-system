import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Edit, Phone, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMember } from "@/hooks/use-members"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

function MemberDetailPage() {
  const { id } = useParams()
  const { data: member, isLoading, error } = useMember(id)
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading member…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
    <section><Button variant="ghost" render={<Link to="/members" />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to members</Button><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant={member.status === "active" ? "default" : "secondary"} className="mb-3">{member.status}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{member.name}</h1><p className="mt-2 flex items-center gap-2 text-muted-foreground"><Phone /> {member.phone_number}</p></div><Button variant="outline" render={<Link to={`/members/${member.id}/edit`} />}><Edit data-icon="inline-start" /> Edit member</Button></div></section>
    <section className="grid gap-6 md:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound /> Profile</CardTitle><CardDescription>Personal and contact information.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Info label="Gender" value={member.gender} /><Info label="Age" value={member.age ? `${member.age} years` : "Not provided"} /><Info label="ID card" value={member.id_card_number || "Not provided"} /><Info label="Date joined" value={formatEthiopianDate(member.date_joined)} /><Info label="Address" value={member.address || "Not provided"} /><Info label="Heir information" value={member.heir_info || "Not provided"} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Member activity</CardTitle><CardDescription>Related financial records will appear here.</CardDescription></CardHeader><CardContent className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">Transactions, loans, and dividend history will be connected in their respective modules.</CardContent></Card>
    </section>
  </main>
}

function Info({ label, value }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div> }

export default MemberDetailPage
