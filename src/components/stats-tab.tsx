"use client"

import { useEffect, useMemo, useState } from "react"
import { format, endOfMonth, startOfMonth } from "date-fns"
import { vi } from "date-fns/locale"
import type { DayButtonProps } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ProductionStatsResponse = {
  topProducts: Array<{
    productName: string
    totalQuantity: number
  }>
}

type CalendarStatsResponse = {
  chartData?: {
    totalExport?: Record<string, number>
  }
}

interface StatsTabProps {
  selectedDate?: Date
  onSelectDate: (date: Date) => void
}

export function StatsTab({ selectedDate, onSelectDate }: StatsTabProps) {
  const [data, setData] = useState<ProductionStatsResponse | null>(null)
  const [calendarCounts, setCalendarCounts] = useState<Record<string, number>>({})
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  const currentMonth = useMemo(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [])

  useEffect(() => {
    let mounted = true

    async function fetchProductStats() {
      setIsLoadingProducts(true)
      setProductsError(null)

      try {
        const response = await fetch("/api/production-stats", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Không thể tải thống kê sản phẩm")
        }

        const result = (await response.json()) as ProductionStatsResponse
        if (mounted) {
          setData(result)
        }
      } catch (err) {
        if (mounted) {
          setProductsError(err instanceof Error ? err.message : "Có lỗi xảy ra")
        }
      } finally {
        if (mounted) {
          setIsLoadingProducts(false)
        }
      }
    }

    fetchProductStats()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function fetchCalendarStats() {
      setIsLoadingCalendar(true)
      setCalendarError(null)

      try {
        const params = new URLSearchParams({
          from: format(startOfMonth(currentMonth), "yyyy-MM-dd"),
          to: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
        })

        const response = await fetch(`/api/orders?${params}`, { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Không thể tải dữ liệu lịch")
        }

        const result = (await response.json()) as CalendarStatsResponse
        if (mounted) {
          setCalendarCounts(result.chartData?.totalExport ?? {})
        }
      } catch (err) {
        if (mounted) {
          setCalendarError(err instanceof Error ? err.message : "Có lỗi xảy ra")
        }
      } finally {
        if (mounted) {
          setIsLoadingCalendar(false)
        }
      }
    }

    fetchCalendarStats()
    return () => {
      mounted = false
    }
  }, [currentMonth])

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined
  const calendarCaption = format(currentMonth, "MM/yyyy")

  const CalendarDayContent = ({ day, ...props }: DayButtonProps) => {
    const dateKey = format(day.date, "yyyy-MM-dd")
    const count = calendarCounts[dateKey] ?? 0
    const isSelected = selectedDateKey === dateKey

    return (
      <Button
        {...props}
        variant="ghost"
        size="icon"
        className={cn(
          "flex h-full min-h-[4.5rem] w-full flex-col items-center justify-start gap-1 rounded-lg px-1 py-1.5 text-center hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        )}
      >
        <span className="text-sm font-medium leading-none">{format(day.date, "d")}</span>
        <span
          className={cn(
            "line-clamp-1 text-[11px] leading-none",
            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {count.toLocaleString("vi-VN")} đơn
        </span>
      </Button>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold leading-7 text-foreground">Lịch</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Tháng {calendarCaption}, hiển thị số đơn xuất theo ngày. Chọn một ngày để lọc toàn bộ dashboard.
          </p>
        </div>

        {isLoadingCalendar ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-32 bg-muted/70" />
            <Skeleton className="h-72 w-full bg-muted/70" />
          </div>
        ) : calendarError ? (
          <div className="text-sm text-destructive">{calendarError}</div>
        ) : (
          <div className="overflow-x-auto">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  onSelectDate(date)
                }
              }}
              month={currentMonth}
              locale={vi}
              fixedWeeks
              showOutsideDays={false}
              hideNavigation
              className="w-full p-0"
              classNames={{
                root: "w-full",
                month: "w-full gap-3",
                month_caption: "justify-start px-0",
                caption_label: "text-base font-semibold",
                weekdays: "mb-1 grid grid-cols-7",
                weekday: "flex h-8 items-center justify-center text-xs font-medium uppercase tracking-wide",
                week: "mt-2 grid grid-cols-7 gap-2",
                day: "aspect-auto",
              }}
              components={{
                DayButton: CalendarDayContent,
              }}
            />
          </div>
        )}
      </Card>

      <Card className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold leading-7 text-foreground">Top 20 Sản Phẩm Bán Chạy</h3>
          <p className="text-sm leading-6 text-muted-foreground">Tổng số lượng theo tên sản phẩm gốc</p>
        </div>

        {isLoadingProducts ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full bg-muted/70" />
            <Skeleton className="h-10 w-full bg-muted/70" />
            <Skeleton className="h-10 w-full bg-muted/70" />
          </div>
        ) : productsError ? (
          <div className="text-sm text-destructive">{productsError}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="text-right">Số lượng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.topProducts ?? []).map((row) => (
                <TableRow key={row.productName}>
                  <TableCell className="font-mono">{row.productName}</TableCell>
                  <TableCell className="text-right">{row.totalQuantity.toLocaleString("vi-VN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
