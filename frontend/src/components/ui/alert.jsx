import { cn } from "@/lib/utils"

function Alert({ className, variant = "default", ...props }) {
  return <div role="status" data-slot="alert" data-variant={variant} className={cn("relative grid w-full gap-1 rounded-2xl border px-4 py-3 text-sm", variant === "destructive" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-card text-card-foreground", className)} {...props} />
}

function AlertTitle({ className, ...props }) {
  return <h5 data-slot="alert-title" className={cn("font-medium leading-none tracking-tight", className)} {...props} />
}

function AlertDescription({ className, ...props }) {
  return <div data-slot="alert-description" className={cn("text-sm opacity-90", className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
