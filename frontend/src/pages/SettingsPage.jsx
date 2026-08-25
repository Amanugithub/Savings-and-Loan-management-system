import { useState } from "react"
import { CheckCircle2, Cloud, KeyRound, LogOut, Moon, RefreshCw, ShieldCheck, Sun } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"
import { useChangePassword, useRunSync, useSyncStatus } from "@/hooks/use-settings"

const initialPassword = { current_password: "", new_password: "", confirm_password: "" }

function SettingsPage() {
  const { admin, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [password, setPassword] = useState(initialPassword)
  const [passwordMessage, setPasswordMessage] = useState(null)
  const passwordMutation = useChangePassword()
  const syncQuery = useSyncStatus()
  const syncMutation = useRunSync()
  const ThemeIcon = theme === "dark" ? Sun : Moon

  const updatePassword = (event) => setPassword((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submitPassword = (event) => {
    event.preventDefault()
    setPasswordMessage(null)
    if (password.new_password !== password.confirm_password) {
      setPasswordMessage({ variant: "destructive", title: "Passwords do not match", description: "Enter the same new password in both fields." })
      return
    }
    passwordMutation.mutate(
      { current_password: password.current_password, new_password: password.new_password },
      {
        onSuccess: (result) => { setPassword(initialPassword); setPasswordMessage({ title: "Password updated", description: result.message }) },
        onError: (error) => setPasswordMessage({ variant: "destructive", title: "Password update failed", description: error.message }),
      },
    )
  }

  const syncStatus = syncQuery.data
  const syncHealthy = syncStatus?.ok

  return <main className="mx-auto flex w-full max-w-5xl flex-col gap-8">
    <section><Badge variant="secondary" className="mb-3">Workspace preferences</Badge><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Settings</h1><p className="mt-2 max-w-2xl text-muted-foreground">Manage your administrator account, security, appearance, and data synchronization.</p></section>
    <section className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck /> Account</CardTitle><CardDescription>Your current administrator identity.</CardDescription></CardHeader><CardContent className="grid gap-4"><Info label="Name" value={admin?.name || "Administrator"} /><Info label="Username" value={admin?.username || "—"} /><Info label="Administrator ID" value={admin?.id || "—"} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sun /> Appearance</CardTitle><CardDescription>Choose how the management portal looks on this device.</CardDescription></CardHeader><CardContent className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium">Theme</p><p className="mt-1 text-sm text-muted-foreground">Currently using {theme} mode.</p></div><Button variant="outline" onClick={toggleTheme}><ThemeIcon data-icon="inline-start" />Switch to {theme === "dark" ? "light" : "dark"}</Button></CardContent></Card>
    </section>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound /> Change password</CardTitle><CardDescription>Use at least eight characters and do not reuse your current password.</CardDescription></CardHeader><CardContent><form onSubmit={submitPassword} className="flex flex-col gap-5"><div className="grid gap-4 md:grid-cols-3"><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="current-password">Current password<Input id="current-password" name="current_password" type="password" value={password.current_password} onChange={updatePassword} required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="new-password">New password<Input id="new-password" name="new_password" type="password" minLength={8} value={password.new_password} onChange={updatePassword} required /></label><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="confirm-password">Confirm new password<Input id="confirm-password" name="confirm_password" type="password" minLength={8} value={password.confirm_password} onChange={updatePassword} required /></label></div>{passwordMessage && <Alert variant={passwordMessage.variant}><AlertTitle>{passwordMessage.title}</AlertTitle><AlertDescription>{passwordMessage.description}</AlertDescription></Alert>}<div className="flex justify-end"><Button type="submit" disabled={passwordMutation.isPending}>{passwordMutation.isPending ? "Updating…" : "Update password"}</Button></div></form></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Cloud /> Data synchronization</CardTitle><CardDescription>Check remote connectivity and synchronize local changes.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3">{syncHealthy ? <CheckCircle2 className="text-primary" /> : <RefreshCw className="text-muted-foreground" />}<div><p className="text-sm font-medium">{syncQuery.isLoading ? "Checking connection…" : syncHealthy ? "Sync service healthy" : "Sync service unavailable"}</p><p className="mt-1 text-sm text-muted-foreground">{syncStatus?.message || "The latest sync status will appear here."}</p></div></div><Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || syncQuery.isLoading}><RefreshCw data-icon="inline-start" />{syncMutation.isPending ? "Synchronizing…" : "Synchronize now"}</Button></div>{syncQuery.error && <Alert variant="destructive"><AlertTitle>Sync status unavailable</AlertTitle><AlertDescription>{syncQuery.error.message}</AlertDescription></Alert>}{syncMutation.error && <Alert variant="destructive"><AlertTitle>Synchronization failed</AlertTitle><AlertDescription>{syncMutation.error.message}</AlertDescription></Alert>}{syncMutation.isSuccess && <Alert><AlertTitle>Synchronization complete</AlertTitle><AlertDescription>{syncMutation.data?.summary ? `${syncMutation.data.summary.pushed} pushed, ${syncMutation.data.summary.pulled} pulled, ${syncMutation.data.summary.failed} failed.` : "The synchronization request completed."}</AlertDescription></Alert>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><LogOut /> Session</CardTitle><CardDescription>End the current administrator session on this device.</CardDescription></CardHeader><CardContent className="flex justify-end"><Button variant="destructive" onClick={logout}><LogOut data-icon="inline-start" /> Sign out</Button></CardContent></Card>
  </main>
}

function Info({ label, value }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div> }

export default SettingsPage
