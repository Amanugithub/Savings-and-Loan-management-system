import { Toggle } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"

import { cn } from "@/lib/utils"

function ToggleGroup({ className, ...props }) { return <ToggleGroupPrimitive data-slot="toggle-group" className={cn("flex w-fit items-center gap-1 rounded-2xl bg-muted p-1", className)} {...props} /> }
function ToggleGroupItem({ className, ...props }) { return <Toggle data-slot="toggle-group-item" className={cn("rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm", className)} {...props} /> }

export { ToggleGroup, ToggleGroupItem }
