import { format, isValid, parseISO } from "date-fns"
import { CalendarDays } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function DatePicker({ value, onChange, placeholder = "Pick a date", className, "aria-label": ariaLabel }) {
  const [open, setOpen] = useState(false)
  const selectedDate = value ? parseISO(value) : undefined
  const validDate = selectedDate && isValid(selectedDate) ? selectedDate : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className={className} aria-label={ariaLabel} />}>
        <CalendarDays data-icon="inline-start" />
        {validDate ? format(validDate, "MMM d, yyyy") : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar className="rounded-2xl border" mode="single" selected={validDate} onSelect={(date) => { if (date) { onChange(format(date, "yyyy-MM-dd")); setOpen(false) } }} />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
