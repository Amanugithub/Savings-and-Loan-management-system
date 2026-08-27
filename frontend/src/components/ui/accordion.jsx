import * as AccordionPrimitive from "@base-ui/react/accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({ className, ...props }) { return <AccordionPrimitive.Accordion.Root data-slot="accordion" className={cn("w-full", className)} {...props} /> }
function AccordionItem({ className, ...props }) { return <AccordionPrimitive.Accordion.Item data-slot="accordion-item" className={cn("border-b border-border last:border-b-0", className)} {...props} /> }
function AccordionTrigger({ className, children, ...props }) { return <AccordionPrimitive.Accordion.Trigger data-slot="accordion-trigger" className={cn("group flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-colors hover:text-primary", className)} {...props}>{children}<ChevronDown className="text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180" /></AccordionPrimitive.Accordion.Trigger> }
function AccordionContent({ className, ...props }) { return <AccordionPrimitive.Accordion.Panel data-slot="accordion-content" className={cn("overflow-hidden pb-4 text-sm text-muted-foreground", className)} {...props} /> }

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
