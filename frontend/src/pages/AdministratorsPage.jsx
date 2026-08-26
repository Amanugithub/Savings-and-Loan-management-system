import { useState } from "react"
import { KeyRound, Plus, ShieldCheck, UserRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useCreateAdministrator, useAdministrators } from "@/hooks/use-administrators"
import { formatEthiopianDate } from "@/lib/ethiopian-calendar"

const initialForm = { name: "", username: "", password: "" }

function AdministratorsPage() {
  const { data: administrators = [], isLoading, error } = useAdministrators()
  const createAdministrator = useCreateAdministrator()
  const [form, setForm] = useState(initialForm)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    createAdministrator.mutate(form, { onSuccess: () => setForm(initialForm) })
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <section>
        <Badge variant="secondary" className="mb-3">Access control</Badge>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Administrators</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Manage the people who can access and operate the cooperative management portal.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
            <div>
              <CardTitle>Administrator accounts</CardTitle>
              <CardDescription className="mt-1">Only active administrators can sign in.</CardDescription>
            </div>
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck /></div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading administrator accounts…</p>}
            {error && <p className="p-6 text-sm text-destructive">{error.status === 401 ? "Sign in to view administrator accounts." : error.message}</p>}
            {!isLoading && !error && administrators.length === 0 && <p className="p-6 text-sm text-muted-foreground">No administrator accounts found.</p>}
            {!isLoading && !error && administrators.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {administrators.map((administrator) => (
                    <TableRow key={administrator.id}>
                      <TableCell className="font-medium"><span className="flex items-center gap-2"><UserRound className="text-muted-foreground" />{administrator.name}</span></TableCell>
                      <TableCell>{administrator.username}</TableCell>
                      <TableCell><Badge variant={administrator.status === "active" ? "default" : "secondary"}>{administrator.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{formatEthiopianDate(administrator.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus /> New administrator</CardTitle>
            <CardDescription>Create an account for a trusted cooperative operator.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="admin-name">Full name<Input id="admin-name" name="name" value={form.name} onChange={updateField} required /></label>
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="admin-username">Username<Input id="admin-username" name="username" value={form.username} onChange={updateField} required /></label>
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="admin-password">Temporary password<Input id="admin-password" name="password" type="password" value={form.password} onChange={updateField} minLength={8} required /></label>
              {createAdministrator.error && <p className="text-sm text-destructive">{createAdministrator.error.message}</p>}
              {createAdministrator.isSuccess && <p className="text-sm text-primary">Administrator created successfully.</p>}
              <Button type="submit" disabled={createAdministrator.isPending}><KeyRound /> {createAdministrator.isPending ? "Creating…" : "Create administrator"}</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

export default AdministratorsPage
