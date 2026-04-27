"use client"

import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, startOfMonth, startOfWeek } from "date-fns"
import { vi } from "date-fns/locale"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface CalendarHeatmapProps {
  month: Date
  counts: Record<string, number>
  selectedDate?: Date
  onSelectDate: (date: Date) => void
}

const weekdayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

function getHeatColor(value: number, maxValue: number) {
  if (value <= 0) return "border-slate-200 bg-slate-100 text-slate-400"
  const ratio = value / Math.max(maxValue, 1)
  if (ratio >= 0.8) return "border-emerald-700 bg-emerald-700 text-white"
  if (ratio >= 0.55) return "border-emerald-500 bg-emerald-500 text-white"
  if (ratio >= 0.3) return "border-emerald-200 bg-emerald-200 text-emerald-900"
  return "border-emerald-100 bg-emerald-100 text-emerald-800"
}

export function CalendarHeatmap({ month, counts, selectedDate, onSelectDate }: CalendarHeatmapProps) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const maxValue = Math.max(0, ...Object.values(counts))

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Lịch vận hành</p>
          <h3 className="text-xl font-semibold capitalize text-foreground">{format(month, "MMMM yyyy", { locale: vi })}</h3>
        </div>
        <p className="text-sm text-muted-foreground">Màu càng đậm, sản lượng đơn càng cao.</p>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekdayLabels.map((label) => (
          <div key={label} className="pb-1 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>
        ))}

        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd")
          const count = counts[key] ?? 0
          const isInMonth = day.getMonth() === month.getMonth()
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false

          return (
            <button
              key={key}
              type="button"
              onClick={() => isInMonth && onSelectDate(day)}
              disabled={!isInMonth}
              className={cn(
                "flex aspect-square min-h-16 flex-col items-start justify-between rounded-xl border p-2 text-left transition",
                isInMonth ? getHeatColor(count, maxValue) : "border-transparent bg-transparent text-transparent",
                isSelected && "ring-2 ring-emerald-400 ring-offset-2"
              )}
            >
              <span className="text-sm font-semibold">{format(day, "d")}</span>
              <span className="text-sm font-semibold leading-none">{count.toLocaleString("vi-VN")}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
