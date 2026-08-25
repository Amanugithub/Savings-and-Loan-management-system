import * as ProgressPrimitive from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

function Progress({ className, ...props }) {
  return <ProgressPrimitive.Progress.Root data-slot="progress" className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} {...props} />
}

function ProgressIndicator({ className, ...props }) {
  return <ProgressPrimitive.Progress.Indicator data-slot="progress-indicator" className={cn("h-full bg-primary transition-[width]", className)} {...props} />
}

export { Progress, ProgressIndicator }
