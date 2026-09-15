import { useState } from "react"
import { ArrowLeft, Save, KeyRound, Copy, Check } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertDialog } from "@/components/ui/alert-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateMember, useMember, useUpdateMember, useResetMemberPassword } from "@/hooks/use-members"
import { generatePassword } from "@/lib/password-generator"

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
  const resetPasswordMutation = useResetMemberPassword()
  const mutation = isEditing ? updateMutation : createMutation
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = (event) => {
    event.preventDefault()
    const payload = { ...form, age: form.age ? Number(form.age) : null }
    if (!isEditing) { setConfirmOpen(true); return }
    mutation.mutate({ id: member.id, ...payload }, { onSuccess: (saved) => navigate(`/members/${saved.id}`) })
  }
  const confirmCreate = () => { setConfirmOpen(false); mutation.mutate({ ...form, age: form.age ? Number(form.age) : null }, { onSuccess: (saved) => navigate(`/members/${saved.id}`) }) }

  const handleGeneratePassword = () => {
    const password = generatePassword(12)
    setGeneratedPassword(password)
    setShowPassword(true)
    setCopied(false)
  }

  const handleAssignPassword = () => {
    if (!generatedPassword || !member) return
    resetPasswordMutation.mutate(
      { id: member.id, new_password: generatedPassword },
      {
        onSuccess: () => {
          setGeneratedPassword(null)
          setShowPassword(false)
        }
      }
    )
  }

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
    <section><Button variant="ghost" render={<Link to={isEditing ? `/members/${member.id}` : "/members"} />} className="mb-4 -ml-3"><ArrowLeft data-icon="inline-start" /> Back to members</Button><Badge variant="secondary" className="mb-3">{isEditing ? "Member update" : "Registration"}</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{isEditing ? "Edit member" : "Register a member"}</h1><p className="mt-2 text-muted-foreground">{isEditing ? "Keep this member’s information accurate and up to date." : "Add a new member to the cooperative directory."}</p></section>
    <Card><CardHeader><CardTitle>Member information</CardTitle><CardDescription>Fields marked required must be completed before saving.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2" htmlFor="name">Full name<Input id="name" name="name" value={form.name} onChange={updateField} required /></label>
        <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="gender">Gender<Select items={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} value={form.gender} onValueChange={(value) => setForm((current) => ({ ...current, gender: value }))}><SelectTrigger id="gender" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectGroup></SelectContent></Select></label>
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
    {isEditing && <Card><CardHeader><CardTitle>Password management</CardTitle><CardDescription>Generate a random password for this member. The password is shown once before assignment.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-4">{!showPassword ? <Button type="button" variant="outline" onClick={handleGeneratePassword} className="w-fit"><KeyRound data-icon="inline-start" />Generate password</Button> : <div className="flex flex-col gap-4"><div className="rounded-xl border bg-muted/50 p-4"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">Generated password</p><Button type="button" variant="ghost" size="sm" onClick={handleCopyPassword} className="h-8">{copied ? <><Check data-icon="inline-start" className="h-4 w-4" />Copied</> : <><Copy data-icon="inline-start" className="h-4 w-4" />Copy</>}</Button></div><code className="block rounded bg-background px-3 py-2 font-mono text-sm">{generatedPassword}</code><p className="mt-2 text-xs text-muted-foreground">This password will only be shown once. Make sure to copy it before assigning.</p></div><div className="flex gap-3"><Button type="button" variant="outline" onClick={() => { setShowPassword(false); setGeneratedPassword(null) }}>Cancel</Button><Button type="button" onClick={handleAssignPassword} disabled={resetPasswordMutation.isPending}><Save data-icon="inline-start" />{resetPasswordMutation.isPending ? "Assigning…" : "Assign password"}</Button></div></div>}{resetPasswordMutation.isSuccess && <p className="rounded-xl bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">Password assigned successfully. The member can change it from the mobile app.</p>}{resetPasswordMutation.error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{resetPasswordMutation.error.message}</p>}</div></CardContent></Card>}
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
