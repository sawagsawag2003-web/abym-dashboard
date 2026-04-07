"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns"
import { vi } from "date-fns/locale"
import { cn } from "@/lib/utils"
import type { DateRange } from "react-day-picker"

export type DateRangeOption = "today" | "yesterday" | "thisWeek" | "last7Days" | "thisMonth" | "custom"

interface DateRangeSelectorProps {
  selectedRange: DateRangeOption
  onRangeChange: (range: DateRangeOption, dates?: { from: Date; to: Date }) => void
  customDateRange?: { from: Date; to: Date }
}

const rangeOptions: { value: DateRangeOption; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "thisWeek", label: "Tuần này" },
  { value: "last7Days", label: "7 ngày trước" },
  { value: "thisMonth", label: "Tháng này" },
]

export function DateRangeSelector({ selectedRange, onRangeChange, customDateRange }: DateRangeSelectorProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    customDateRange ? { from: customDateRange.from, to: customDateRange.to } : undefined
  )

  const handleCustomDateSelect = (range: DateRange | undefined) => {
    setDateRange(range)

    if (range?.from && range?.to && range.from.getTime() !== range.to.getTime()) {
      onRangeChange("custom", { from: range.from, to: range.to })
      setCalendarOpen(false)
    }
  }

  const handleApplyCustomRange = () => {
    if (dateRange?.from) {
      const to = dateRange.to || dateRange.from
      onRangeChange("custom", { from: dateRange.from, to })
      setCalendarOpen(false)
    }
  }

  const getDateRangeLabel = () => {
    if (selectedRange === "custom" && customDateRange) {
      return `${format(customDateRange.from, "dd/MM/yyyy")} - ${format(customDateRange.to, "dd/MM/yyyy")}`
    }
    return "Tùy chọn"
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {rangeOptions.map((option) => (
        <Button
          key={option.value}
          variant={selectedRange === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => onRangeChange(option.value)}
          className={cn(
            "h-8 rounded-full border-border/70 px-3 text-xs shadow-sm transition-all duration-200",
            selectedRange === option.value && "border-green-700 bg-green-700 text-white hover:bg-green-700/90"
          )}
        >
          {option.label}
        </Button>
      ))}

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={selectedRange === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-8 rounded-full border-border/70 px-3 text-xs shadow-sm transition-all duration-200",
              selectedRange === "custom" && "border-green-700 bg-green-700 text-white hover:bg-green-700/90"
            )}
          >
            <Calendar className="mr-1 h-3.5 w-3.5" />
            {getDateRangeLabel()}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto rounded-[18px] p-0" align="end">
          <CalendarComponent mode="range" selected={dateRange} onSelect={handleCustomDateSelect} numberOfMonths={2} locale={vi} />

          <div className="flex justify-end gap-2 border-t p-3">
            <Button variant="outline" size="sm" onClick={() => setCalendarOpen(false)}>
              Hủy
            </Button>
            <Button size="sm" onClick={handleApplyCustomRange} disabled={!dateRange?.from}>
              Áp dụng
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function getDateRangeFromOption(
  option: DateRangeOption,
  customRange?: { from: Date; to: Date }
): { from: Date; to: Date } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (option) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const yesterday = subDays(today, 1)
      return { from: yesterday, to: yesterday }
    }
    case "thisWeek":
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) }
    case "last7Days":
      return { from: subDays(today, 6), to: today }
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) }
    case "custom":
      return customRange || { from: today, to: today }
    default:
      return { from: today, to: today }
  }
}
