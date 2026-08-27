import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Calendar({ className, classNames, showOutsideDays = true, captionLayout = "dropdown", formatters, ...props }) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("group/calendar bg-background p-3 [--cell-radius:var(--radius-4xl)] [--cell-size:--spacing(8)]", className)}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString(undefined, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        month_caption: cn("flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", defaultClassNames.month_caption),
        dropdowns: cn("flex h-(--cell-size) items-center justify-center gap-1.5 text-sm font-medium", defaultClassNames.dropdowns),
        dropdown_root: cn("relative rounded-(--cell-radius)", defaultClassNames.dropdown_root),
        dropdown: cn("absolute inset-0 bg-popover opacity-0", defaultClassNames.dropdown),
        caption_label: cn("select-none", captionLayout === "label" ? "text-sm font-medium" : "flex items-center gap-1 rounded-(--cell-radius) text-sm font-medium [&>svg]:size-3.5 [&>svg]:text-muted-foreground", defaultClassNames.caption_label),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between gap-1", defaultClassNames.nav),
        button_previous: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0", defaultClassNames.button_previous),
        button_next: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0", defaultClassNames.button_next),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn("flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground", defaultClassNames.weekday),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn("group/day relative aspect-square h-full w-full p-0 text-center", defaultClassNames.day),
        day_button: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) rounded-(--cell-radius) p-0 font-normal data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary data-[selected-single=true]:hover:text-primary-foreground", defaultClassNames.day_button),
        today: cn("rounded-(--cell-radius) bg-muted text-foreground", defaultClassNames.today),
        outside: cn("text-muted-foreground opacity-50", defaultClassNames.outside),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
        selected: cn("bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground", defaultClassNames.selected),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, ...iconProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown
          return <Icon className={cn("size-4", className)} {...iconProps} />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
