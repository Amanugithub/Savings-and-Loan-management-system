import { cn } from "@/lib/utils"

function Empty({ className, ...props }) { return <div data-slot="empty" className={cn("flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-12 text-center", className)} {...props} /> }
function EmptyMedia({ className, ...props }) { return <div data-slot="empty-media" className={cn("flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground", className)} {...props} /> }
function EmptyTitle({ className, ...props }) { return <h3 data-slot="empty-title" className={cn("font-medium text-foreground", className)} {...props} /> }
function EmptyDescription({ className, ...props }) { return <p data-slot="empty-description" className={cn("max-w-sm text-sm text-muted-foreground", className)} {...props} /> }
function EmptyContent({ className, ...props }) { return <div data-slot="empty-content" className={cn("flex items-center gap-2", className)} {...props} /> }

export { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle }
