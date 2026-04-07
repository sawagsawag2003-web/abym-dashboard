"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { DateRangeSelector, getDateRangeFromOption, type DateRangeOption } from "@/components/dashboard/date-range-selector"
import { OrderStatsCards, type MetricType } from "@/components/dashboard/order-stats-cards"
import { OrderAnalyticsChart } from "@/components/dashboard/order-analytics-chart"
import { CarrierChart } from "@/components/dashboard/carrier-bar-chart"
import { OrderList } from "@/components/dashboard/order-list"
import { StatsTab } from "@/components/stats-tab"
import { format } from "date-fns"

interface StatsData {
  totalExport: number
  totalImport: number
  returned: number
  cancelled: number
}

interface MetricComparison {
  previous: number
  changePercent: number
  trend: "up" | "down" | "neutral"
}

interface ChartDataPoint {
  date: string
  value: number
  fullDate: Date
}

interface OrderItem {
  date: string
  trackingCode: string
}

interface ApiResponse {
  stats: StatsData
  comparisons: Record<MetricType, MetricComparison>
  chartData: Record<MetricType, Record<string, number>>
  carrierCounts: Record<MetricType, Record<string, number>>
  platformBreakdown: Record<MetricType, { TikTok: number; Shopee: number }>
  categoryBreakdown: Record<MetricType, Record<string, number>>
  orderLists: Record<MetricType, OrderItem[]>
  meta?: {
    exportOrdersCount: number
    importOrdersCount: number
    dateRange: { from: string; to: string }
    previousDateRange: { from: string; to: string }
  }
}

export default function DashboardPage() {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("today")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>()
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("totalExport")
  const [showOrderList, setShowOrderList] = useState(false)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
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
        from: format(dateRange.from, "yyyy-MM-dd"),
        to: format(dateRange.to, "yyyy-MM-dd"),
      })

      const response = await fetch(`/api/orders?${params}`)

      if (!response.ok) {
        throw new Error("Không thể tải dữ liệu")
      }

      const result = (await response.json()) as ApiResponse
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setIsLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRangeChange = (range: DateRangeOption, dates?: { from: Date; to: Date }) => {
    setSelectedRange(range)
    if (range === "custom" && dates) {
      setCustomDateRange(dates)
    }
  }

  const handleMetricSelect = (metric: MetricType) => {
    setSelectedMetric(metric)
    if (metric === "cancelled" || metric === "returned") {
      setShowOrderList(true)
    } else {
      setShowOrderList(false)
    }
  }

  const statsData: StatsData = data?.stats ?? {
    totalExport: 0,
    totalImport: 0,
    returned: 0,
    cancelled: 0,
  }

  const comparisons: Record<MetricType, MetricComparison> = data?.comparisons ?? {
    totalExport: { previous: 0, changePercent: 0, trend: "neutral" },
    totalImport: { previous: 0, changePercent: 0, trend: "neutral" },
    cancelled: { previous: 0, changePercent: 0, trend: "neutral" },
    returned: { previous: 0, changePercent: 0, trend: "neutral" },
  }

  const chartData: ChartDataPoint[] = useMemo(() => {
    const rawData = data?.chartData?.[selectedMetric]
    if (!rawData) return []

    return Object.entries(rawData)
      .map(([dateStr, value]) => ({
        date: format(new Date(dateStr), "dd/MM"),
        value,
        fullDate: new Date(dateStr),
      }))
      .sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime())
  }, [data?.chartData, selectedMetric])

  const currentOrderList = data?.orderLists?.[selectedMetric] ?? []

  const carrierChartData = useMemo(() => {
    const counts = data?.carrierCounts?.[selectedMetric] ?? {}
    return Object.entries(counts)
      .map(([carrier, count]) => ({ carrier, count }))
      .sort((a, b) => b.count - a.count)
  }, [data?.carrierCounts, selectedMetric])

  const platformBreakdown = data?.platformBreakdown?.[selectedMetric] ?? { TikTok: 0, Shopee: 0 }

  const categoryBreakdown = useMemo(() => {
    const categories = data?.categoryBreakdown?.[selectedMetric] ?? {}
    return Object.entries(categories)
      .map(([category, quantity]) => ({ category, quantity }))
      .sort((a, b) => b.quantity - a.quantity || a.category.localeCompare(b.category))
  }, [data?.categoryBreakdown, selectedMetric])

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileNav />

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header title="Dashboard" description="Quản lý và theo dõi đơn hàng kho XMKN." />

        <div className="mt-4 space-y-5 md:mt-5 md:space-y-6">
          <div className="animate-slide-in-up rounded-xl border border-border bg-card p-4 shadow-sm">
            <DateRangeSelector
              selectedRange={selectedRange}
              onRangeChange={handleRangeChange}
              customDateRange={customDateRange}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
              <button onClick={fetchData} className="ml-2 underline hover:no-underline">
                Thử lại
              </button>
            </div>
          )}

          <OrderStatsCards
            data={statsData}
            comparisons={comparisons}
            selectedMetric={selectedMetric}
            onMetricSelect={handleMetricSelect}
            platformBreakdown={platformBreakdown}
            categoryBreakdown={categoryBreakdown}
            isLoading={isLoading}
          />

          <section className="space-y-3">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold leading-8 text-foreground">Phân Tích Vận Hành</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Biểu đồ được đặt trong grid 2 cột trên desktop và tự động xếp lại trên màn hình nhỏ.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <OrderAnalyticsChart data={chartData} selectedMetric={selectedMetric} isLoading={isLoading} />
              <CarrierChart data={carrierChartData} isLoading={isLoading} />
            </div>
          </section>

          <StatsTab />

          {showOrderList && (selectedMetric === "cancelled" || selectedMetric === "returned") && (
            <OrderList
              metric={selectedMetric}
              orders={currentOrderList}
              isLoading={isLoading}
              onClose={() => setShowOrderList(false)}
            />
          )}

          {data?.meta && !isLoading && (
            <div className="text-center text-xs text-muted-foreground">
              Dữ liệu từ Google Sheets - Đơn xuất: {data.meta.exportOrdersCount.toLocaleString()} dòng, Đơn về:{" "}
              {data.meta.importOrdersCount.toLocaleString()} dòng
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
