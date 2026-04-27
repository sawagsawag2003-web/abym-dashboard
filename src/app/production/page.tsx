"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { BarChart3, RefreshCcw } from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  DateRangeSelector,
  getDateRangeFromOption,
  type DateRangeOption,
} from "@/components/dashboard/date-range-selector"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ProductionDetail = {
  level_2: string
  quantity: number
}

type ProductionCategory = {
  category: string
  total_production: number
  details: ProductionDetail[]
}

type ApiResponse = {
  startDate: string
  endDate: string
  data: ProductionCategory[]
}

export default function ProductionPage() {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("today")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [data, setData] = useState<ProductionCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateRange = useMemo(
    () => getDateRangeFromOption(selectedRange, customDateRange),
    [selectedRange, customDateRange]
  )

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        startDate: format(dateRange.from, "yyyy-MM-dd"),
        endDate: format(dateRange.to, "yyyy-MM-dd"),
      })

      const response = await fetch(`/api/production?${params}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error("Không thể tải dữ liệu sản lượng")
      }

      const result = (await response.json()) as ApiResponse
      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setIsLoading(false)
    }
  }, [dateRange.from, dateRange.to])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (selectedCategory && !data.some((item) => item.category === selectedCategory)) {
      setSelectedCategory(null)
    }
  }, [data, selectedCategory])

  const selectedCategoryData = useMemo(
    () => data.find((item) => item.category === selectedCategory) ?? null,
    [data, selectedCategory]
  )

  const handleRangeChange = (range: DateRangeOption, dates?: { from: Date; to: Date }) => {
    setSelectedRange(range)
    if (range === "custom" && dates) {
      setCustomDateRange(dates)
    }
  }

  async function syncSheetData() {
    setIsSyncing(true)
    setError(null)

    try {
      const response = await fetch("/api/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "sheet_cache" }),
      })

      if (!response.ok) {
        throw new Error("Không thể cập nhật dữ liệu từ sheet")
      }

      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setIsSyncing(false)
    }
  }

  const detailChartData = selectedCategoryData?.details ?? []

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header
          title="Sản Phẩm Xuất Kho"
          description="Theo dõi sản phẩm xuất kho theo danh mục sản phẩm và phân loại cấp 2 trong khoảng thời gian đã chọn."
        />

        <div className="mt-4 space-y-5 md:mt-5 md:space-y-6">
          <div className="animate-slide-in-up flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <DateRangeSelector
              selectedRange={selectedRange}
              onRangeChange={handleRangeChange}
              customDateRange={customDateRange}
            />
            <Button variant="outline" onClick={() => void syncSheetData()} disabled={isSyncing}>
              <RefreshCcw className={cn("mr-2 h-4 w-4", isSyncing ? "animate-spin" : "")} />
              {isSyncing ? "Đang cập nhật dữ liệu" : "Cập nhật dữ liệu"}
            </Button>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
              {error}
            </div>
          )}

          <section className="space-y-3">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold leading-8 text-foreground">Tổng Quan Loại Sản Phẩm</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Chọn một danh mục để xem biểu đồ chi tiết theo màu sắc và kích thước.
              </p>
            </div>

            {isLoading ? (
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-40 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {data.map((item) => {
                  const isActive = selectedCategory === item.category

                  return (
                    <button
                      key={item.category}
                      type="button"
                      onClick={() =>
                        setSelectedCategory((current) => (current === item.category ? null : item.category))
                      }
                      className={cn(
                        "rounded-xl p-5 text-left transition-all",
                        isActive
                          ? "border border-primary bg-primary text-primary-foreground shadow-md"
                          : "border border-border bg-card shadow-sm hover:border-primary hover:shadow-md"
                      )}
                    >
                      <p
                        className={cn(
                          "mb-2 text-sm font-medium leading-6",
                          isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                      >
                        Tổng
                      </p>
                      <p className="text-3xl font-bold tracking-tight">
                        {item.total_production.toLocaleString("vi-VN")}
                      </p>
                      <p
                        className={cn(
                          "mt-2 text-lg font-semibold leading-7",
                          isActive ? "text-primary-foreground" : "text-foreground"
                        )}
                      >
                        {item.category}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {selectedCategoryData && (
            <section className="animate-slide-in-up space-y-3">
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold leading-8 text-foreground">{selectedCategoryData.category}</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Chi tiết sản lượng cấp 2 trong khoảng thời gian đã chọn.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-5 space-y-2">
                    <div className="flex items-center gap-2 text-base font-semibold leading-7 text-foreground">
                      <BarChart3 className="h-4 w-4 text-foreground" />
                      Biểu Đồ Cột
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Sản lượng theo từng phân loại cấp 2.
                    </p>
                  </div>

                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={detailChartData} margin={{ top: 10, right: 12, left: 0, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.24)" />
                        <XAxis
                          dataKey="level_2"
                          angle={-25}
                          textAnchor="end"
                          height={90}
                          interval={0}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          formatter={(value: number) => [value.toLocaleString("vi-VN"), "Số lượng"]}
                          labelFormatter={(label) => `Phân loại: ${label}`}
                        />
                        <Bar dataKey="quantity" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={52} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <div className="mb-5 space-y-2">
                    <div className="text-base font-semibold leading-7 text-foreground">Biểu Đồ Đường</div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Xu hướng sản lượng của các phân loại cấp 2.
                    </p>
                  </div>

                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={detailChartData} margin={{ top: 10, right: 12, left: 0, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.24)" />
                        <XAxis
                          dataKey="level_2"
                          angle={-25}
                          textAnchor="end"
                          height={90}
                          interval={0}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          formatter={(value: number) => [value.toLocaleString("vi-VN"), "Số lượng"]}
                          labelFormatter={(label) => `Phân loại: ${label}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="quantity"
                          stroke="#16a34a"
                          strokeWidth={3}
                          dot={{ r: 4, fill: "#16a34a" }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
