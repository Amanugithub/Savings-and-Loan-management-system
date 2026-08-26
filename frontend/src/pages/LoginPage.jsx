import { useState } from "react"
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Moon, Sparkles, Sun, UserRound } from "lucide-react"
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

  return <main className="relative grid min-h-svh w-full grid-cols-1 overflow-hidden bg-background text-foreground md:grid-cols-2">
    <Button variant="ghost" size="icon" className="absolute right-4 top-4 z-10 rounded-full md:right-8 md:top-8" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
    <section className="flex items-center justify-center px-6 py-16 sm:px-10">
      <Card className="w-full max-w-sm border-0 bg-transparent shadow-none ring-0">
        <CardHeader className="px-0">
          <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary md:hidden"><Building2 /></div>
          <CardTitle className="font-heading text-2xl font-bold tracking-tight">Sign in to Amanuel SACCO</CardTitle>
          <CardDescription className="text-sm">Welcome back. Enter your administrator credentials to continue.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <form onSubmit={submit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="username">Username
              <span className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="username" name="username" value={credentials.username} onChange={updateField} className="pl-10" autoComplete="username" required /></span>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="password">Password
              <span className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="password" name="password" type={showPassword ? "text" : "password"} value={credentials.password} onChange={updateField} className="pr-10 pl-10" autoComplete="current-password" required /><Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff /> : <Eye />}</Button></span>
            </label>
            {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}<ArrowRight data-icon="inline-end" /></Button>
          </form>
        </CardContent>
      </Card>
    </section>
    <section className="dark relative hidden overflow-hidden border-l border-border bg-background text-foreground md:block">
      <div aria-hidden="true" className="absolute inset-0 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:40px_40px] opacity-[0.07]" />
      <div aria-hidden="true" className="absolute -right-24 -top-24 size-80 rounded-full bg-foreground/10 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 -left-16 size-96 rounded-full bg-foreground/10 blur-3xl" />
      <div className="relative flex h-full flex-col justify-between p-10 lg:p-14">
        <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-foreground/10"><Building2 className="size-5" /></div><span className="text-lg font-semibold tracking-tight">Amanuel SACCO</span></div>
        <div className="max-w-md"><span className="inline-flex items-center gap-1.5 rounded-md border border-foreground/30 bg-foreground/10 px-2.5 py-1 text-xs font-medium"><Sparkles className="size-3.5" /> Cooperative management</span><h1 className="mt-6 font-heading text-4xl font-bold leading-tight tracking-tight">Keep your cooperative moving forward.</h1><p className="mt-4 text-base text-foreground/80">One secure workspace for members, savings, lending, transactions, and the daily work that keeps your community growing.</p></div>
        <p className="text-sm text-foreground/70">Secure access for authorized administrators.</p>
      </div>
    </section>
  </main>
}

export default LoginPage
