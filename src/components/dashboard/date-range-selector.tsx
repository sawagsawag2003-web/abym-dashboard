"use client"

import { useEffect, useState } from "react"
import { Calendar } from "lucide-react"
import { format, startOfMonth, startOfWeek, subDays } from "date-fns"
import { vi } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

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

  useEffect(() => {
    if (selectedRange === "custom" && customDateRange) {
      setDateRange({ from: customDateRange.from, to: customDateRange.to })
      return
    }

    if (selectedRange !== "custom") {
      setDateRange(undefined)
    }
  }, [customDateRange, selectedRange])

  const handleCustomDateSelect = (range: DateRange | undefined) => {
    setDateRange(range)
  }

  const handleApplyCustomRange = () => {
    if (dateRange?.from) {
      onRangeChange("custom", { from: dateRange.from, to: dateRange.to || dateRange.from })
      setCalendarOpen(false)
    }
  }

  const handleCalendarOpenChange = (open: boolean) => {
    setCalendarOpen(open)

    if (open) {
      setDateRange(undefined)
      return
    }

    if (selectedRange === "custom" && customDateRange) {
      setDateRange({ from: customDateRange.from, to: customDateRange.to })
    }
  }

  const label =
    selectedRange === "custom" && customDateRange
      ? `${format(customDateRange.from, "dd/MM/yyyy")} - ${format(customDateRange.to, "dd/MM/yyyy")}`
      : "Tùy chọn"

  return (
    <div className="flex flex-wrap items-center gap-2">
      {rangeOptions.map((option) => (
        <Button
          key={option.value}
          variant={selectedRange === option.value ? "default" : "outline"}
          size="sm"
          onClick={() => onRangeChange(option.value)}
          className={cn(
            "h-9 rounded-full border-emerald-100 px-4 text-xs shadow-sm",
            selectedRange === option.value && "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90"
          )}
        >
          {option.label}
        </Button>
      ))}

      <Popover open={calendarOpen} onOpenChange={handleCalendarOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={selectedRange === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-9 rounded-full border-emerald-100 px-4 text-xs shadow-sm",
              selectedRange === "custom" && "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90"
            )}
          >
            <Calendar className="mr-1 h-3.5 w-3.5" />
            {label}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto rounded-2xl p-0" align="end">
          <CalendarComponent
            mode="range"
            selected={dateRange}
            onSelect={handleCustomDateSelect}
            numberOfMonths={2}
            locale={vi}
            initialFocus
          />
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
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today }
    case "last7Days":
      return { from: subDays(today, 6), to: today }
    case "thisMonth":
      return { from: startOfMonth(today), to: today }
    case "custom":
      return customRange || { from: today, to: today }
    default:
      return { from: today, to: today }
  }
}
