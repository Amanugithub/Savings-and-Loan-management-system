import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ETHIOPIAN_MONTHS, ethiopianToGregorianIso, formatEthiopianDate, gregorianToEthiopian, todayGregorianIso } from "@/lib/ethiopian-calendar"

const WEEKDAYS = ["እሁ", "ሰኞ", "ማክ", "ረቡ", "ሐሙ", "ዓር", "ቅዳ"]

function daysInMonth(year, month) {
  return month === 13 ? ((year + 1) % 4 === 0 ? 6 : 5) : 30
}

function DatePicker({ value, onChange, placeholder = "ቀን ይምረጡ", className, calendarDisabled, "aria-label": ariaLabel }) {
  const selected = useMemo(() => {
    try { return value ? gregorianToEthiopian(value) : null } catch { return null }
  }, [value])
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(selected || gregorianToEthiopian(todayGregorianIso()))

  const firstDay = new Date(`${ethiopianToGregorianIso(view.year, view.month, 1)}T00:00:00Z`).getUTCDay()
  const cells = Array.from({ length: firstDay + daysInMonth(view.year, view.month) }, (_, index) => index < firstDay ? null : index - firstDay + 1)
  const disabledAfter = calendarDisabled?.after instanceof Date
    ? `${calendarDisabled.after.getFullYear()}-${String(calendarDisabled.after.getMonth() + 1).padStart(2, "0")}-${String(calendarDisabled.after.getDate()).padStart(2, "0")}`
    : null
  const isDisabled = (day) => disabledAfter && ethiopianToGregorianIso(view.year, view.month, day) > disabledAfter
  const selectDate = (day) => {
    if (!isDisabled(day)) {
      onChange(ethiopianToGregorianIso(view.year, view.month, day))
      setOpen(false)
    }
  }
  const moveMonth = (amount) => {
    const absolute = view.year * 13 + view.month - 1 + amount
    setView({ year: Math.floor(absolute / 13), month: absolute % 13 + 1, day: 1 })
  }

  const handleOpenChange = (nextOpen) => {
    if (nextOpen && selected) setView(selected)
    setOpen(nextOpen)
  }

  return <Popover open={open} onOpenChange={handleOpenChange}>
    <PopoverTrigger render={<Button variant="outline" className={className} aria-label={ariaLabel} />}>
      <CalendarDays data-icon="inline-start" />
      <span className="font-amharic">{value ? formatEthiopianDate(value) : placeholder}</span>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-auto p-3">
      <div className="flex items-center justify-between gap-3 pb-3">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveMonth(-1)} aria-label="Previous Ethiopian month"><ChevronLeft /></Button>
        <div className="font-amharic text-center text-sm font-semibold">{ETHIOPIAN_MONTHS[view.month - 1]} {view.year}</div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveMonth(1)} aria-label="Next Ethiopian month"><ChevronRight /></Button>
      </div>
      <div className="font-amharic grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((day, index) => <div key={`${day}-${index}`} className="flex size-8 items-center justify-center font-medium">{day}</div>)}
        {cells.map((day, index) => day === null ? <div key={`empty-${index}`} /> : <button key={day} type="button" disabled={isDisabled(day)} onClick={() => selectDate(day)} className={`flex size-8 items-center justify-center rounded-lg text-sm hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30 ${selected?.year === view.year && selected?.month === view.month && selected?.day === day ? "bg-primary text-primary-foreground" : ""}`}>{day}</button>)}
      </div>
    </PopoverContent>
  </Popover>
}

export { DatePicker }
