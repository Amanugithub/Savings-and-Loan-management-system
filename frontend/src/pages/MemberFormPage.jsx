import { useState } from "react"
import { ArrowLeft, Save } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateMember, useMember, useUpdateMember } from "@/hooks/use-members"

const emptyForm = { name: "", gender: "male", address: "", age: "", heir_info: "", id_card_number: "", phone_number: "", date_joined: "" }

function toForm(member) {
  return Object.fromEntries(Object.keys(emptyForm).map((key) => [key, member?.[key] ?? emptyForm[key]]))
}

function MemberForm({ member }) {
  const navigate = useNavigate()
  const isEditing = Boolean(member)
  const [form, setForm] = useState(() => toForm(member))
  const createMutation = useCreateMember()
  const updateMutation = useUpdateMember()
  const mutation = isEditing ? updateMutation : createMutation
  const [confirmOpen, setConfirmOpen] = useState(false)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    const payload = { ...form, age: form.age ? Number(form.age) : null }
    if (!isEditing) { setConfirmOpen(true); return }
    mutation.mutate({ id: member.id, ...payload }, { onSuccess: (saved) => navigate(`/members/${saved.id}`) })
  }
  const confirmCreate = () => { setConfirmOpen(false); mutation.mutate({ ...form, age: form.age ? Number(form.age) : null }, { onSuccess: (saved) => navigate(`/members/${saved.id}`) }) }

  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
    <section><Button variant="ghost" render={<Link to={isEditing ? `/members/${member.id}` : "/members"} />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to members</Button><Badge variant="secondary" className="mb-3">{isEditing ? "Member update" : "Registration"}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{isEditing ? "Edit member" : "Register a member"}</h1><p className="mt-2 text-muted-foreground">{isEditing ? "Keep this member’s information accurate and up to date." : "Add a new member to the cooperative directory."}</p></section>
    <Card><CardHeader><CardTitle>Member information</CardTitle><CardDescription>Fields marked required must be completed before saving.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="name">Full name<Input id="name" name="name" value={form.name} onChange={updateField} required /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="gender">Gender<Select value={form.gender} onValueChange={(value) => setForm((current) => ({ ...current, gender: value }))}><SelectTrigger id="gender" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectGroup></SelectContent></Select></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="age">Age<Input id="age" name="age" type="number" min="1" value={form.age} onChange={updateField} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="phone_number">Phone number<Input id="phone_number" name="phone_number" value={form.phone_number} onChange={updateField} required /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="id_card_number">ID card number<Input id="id_card_number" name="id_card_number" value={form.id_card_number} onChange={updateField} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="address">Address<Input id="address" name="address" value={form.address} onChange={updateField} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="heir_info">Heir information<Input id="heir_info" name="heir_info" value={form.heir_info} onChange={updateField} /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="date_joined">Date joined<DatePicker value={form.date_joined} onChange={(date_joined) => setForm((current) => ({ ...current, date_joined }))} placeholder="Select join date" aria-label="Date joined" /></label>
      </div>
      {mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{mutation.error.message}</p>}
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" render={<Link to={isEditing ? `/members/${member.id}` : "/members"} />}>Cancel</Button><Button type="submit" disabled={mutation.isPending}><Save data-icon="inline-start" />{mutation.isPending ? "Saving…" : "Save member"}</Button></div>
    </form></CardContent></Card>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Create this member?" description={`This will register ${form.name || "this person"} in the cooperative directory.`} confirmLabel="Create member" onConfirm={confirmCreate} disabled={mutation.isPending} />
  </main>
}

function MemberFormPage() {
  const { id } = useParams()
  const { data: member, isLoading, error } = useMember(id)
  if (!id) return <MemberForm />
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading member…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  return <MemberForm key={member.id} member={member} />
}

export default MemberFormPage
