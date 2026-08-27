import { useState } from "react"
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/context/AuthContext"
import { useTheme } from "@/context/ThemeContext"

function LoginPage() {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [credentials, setCredentials] = useState({ username: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (event) => setCredentials((current) => ({ ...current, [event.target.name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)
    try {
      await login(credentials)
      const destination = location.state?.from?.pathname || "/"
      navigate(destination, { replace: true })
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-background p-4 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--color-primary)_0,transparent_28%)] opacity-[0.08]" />
      <Button variant="ghost" size="icon" className="absolute right-4 top-4 rounded-full md:right-8 md:top-8" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-2xl md:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex lg:p-14">
          <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary-foreground/15"><Building2 /></div><span className="font-heading text-lg font-semibold">Tokuma Misomaf</span></div>
          <div><p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-primary-foreground/70">Management portal</p><h1 className="font-heading text-4xl font-semibold leading-tight">Keep the cooperative moving forward.</h1><p className="mt-5 max-w-sm text-primary-foreground/75">Manage members, savings, lending, and the daily work that keeps your community growing.</p></div>
          <p className="text-sm text-primary-foreground/60">Secure access for authorized administrators.</p>
        </section>

        <Card className="rounded-none border-0 shadow-none">
          <CardHeader className="gap-3 p-8 pb-4 md:p-12 md:pb-6">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary md:hidden"><Building2 /></div>
            <CardTitle className="font-heading text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your administrator account to continue.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-4 md:p-12 md:pt-6">
            <form onSubmit={submit} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="username">Username
                <span className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="username" name="username" value={credentials.username} onChange={updateField} className="pl-10" autoComplete="username" required /></span>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="password">Password
                <span className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="password" name="password" type={showPassword ? "text" : "password"} value={credentials.password} onChange={updateField} className="pr-10 pl-10" autoComplete="current-password" required /><Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</Button></span>
              </label>
              {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}<ArrowRight data-icon="inline-end" /></Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default LoginPage
