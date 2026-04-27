"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { endOfMonth, format, startOfMonth } from "date-fns"
import { Boxes, ChevronDown, ChevronUp, Layers3, Package, Sparkles, TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CalendarHeatmap } from "@/components/dashboard/CalendarHeatmap"
import {
  DateRangeSelector,
  getDateRangeFromOption,
  type DateRangeOption,
} from "@/components/dashboard/date-range-selector"
import { Header } from "@/components/dashboard/header"
import { ShopFilter } from "@/components/dashboard/shop-filter"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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

type TimeSeriesPoint = {
  date: string
  total: number
}

type ApiResponse = {
  startDate: string
  endDate: string
  data: ProductionCategory[]
  timeSeries?: Record<string, TimeSeriesPoint[]>
}

type ShopsResponse = {
  shops: string[]
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  helper: string
  icon: typeof Package
  tone: "emerald" | "blue" | "amber" | "slate"
}) {
  const toneClass = {
    emerald: {
      shell: "border-emerald-100 bg-white",
      icon: "bg-emerald-50 text-emerald-600",
    },
    blue: {
      shell: "border-sky-100 bg-white",
      icon: "bg-sky-50 text-sky-600",
    },
    amber: {
      shell: "border-amber-100 bg-white",
      icon: "bg-amber-50 text-amber-600",
    },
    slate: {
      shell: "border-slate-200 bg-white",
      icon: "bg-slate-100 text-slate-700",
    },
  }[tone]

  return (
    <Card className={cn("rounded-2xl p-5 shadow-sm", toneClass.shell)}>
      <div className="flex items-start justify-between gap-4">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", toneClass.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6 space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="text-xs leading-5 text-muted-foreground">{helper}</p>
      </div>
    </Card>
  )
}

export default function ProductionClonePage() {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("yesterday")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [availableShops, setAvailableShops] = useState<string[]>([])
  const [draftSelectedShops, setDraftSelectedShops] = useState<string[]>([])
  const [appliedSelectedShops, setAppliedSelectedShops] = useState<string[]>([])
  const [data, setData] = useState<ProductionCategory[]>([])
  const [currentMonthTimeSeries, setCurrentMonthTimeSeries] = useState<Record<string, TimeSeriesPoint[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingShops, setIsLoadingShops] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllLeaders, setShowAllLeaders] = useState(false)

  const dateRange = useMemo(
    () => getDateRangeFromOption(selectedRange, customDateRange),
    [selectedRange, customDateRange]
  )

  useEffect(() => {
    async function fetchShops() {
      setIsLoadingShops(true)

      try {
        const response = await fetch("/api/orders/shops", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Không thể tải danh sách shop")
        }

        const json = (await response.json()) as ShopsResponse
        setAvailableShops(json.shops ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
      } finally {
        setIsLoadingShops(false)
      }
    }

    fetchShops()
  }, [])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const selectedParams = new URLSearchParams({
        startDate: format(dateRange.from, "yyyy-MM-dd"),
        endDate: format(dateRange.to, "yyyy-MM-dd"),
      })
      const currentMonth = new Date()
      const monthParams = new URLSearchParams({
        startDate: format(startOfMonth(currentMonth), "yyyy-MM-dd"),
        endDate: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
      })

      for (const shop of appliedSelectedShops) {
        selectedParams.append("shop", shop)
        monthParams.append("shop", shop)
      }

      const [selectedResponse, monthResponse] = await Promise.all([
        fetch(`/api/production?${selectedParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/production?${monthParams.toString()}`, { cache: "no-store" }),
      ])

      if (!selectedResponse.ok || !monthResponse.ok) {
        throw new Error("Không thể tải dữ liệu sản lượng")
      }

      const [selectedResult, monthResult] = (await Promise.all([
        selectedResponse.json(),
        monthResponse.json(),
      ])) as [ApiResponse, ApiResponse]

      setData(selectedResult.data)
      setCurrentMonthTimeSeries(monthResult.timeSeries ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setIsLoading(false)
    }
  }, [appliedSelectedShops, dateRange.from, dateRange.to])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (selectedCategory && !data.some((item) => item.category === selectedCategory)) {
      setSelectedCategory(null)
    }
  }, [data, selectedCategory])

  useEffect(() => {
    if (data.length === 0) {
      setSelectedCategory(null)
      return
    }

    setSelectedCategory((current) => {
      if (current && data.some((item) => item.category === current)) {
        return current
      }

      return data[0]?.category ?? null
    })
  }, [data])

  useEffect(() => {
    setShowAllLeaders(false)
  }, [selectedCategory])

  const selectedCategoryData = useMemo(
    () => data.find((item) => item.category === selectedCategory) ?? null,
    [data, selectedCategory]
  )

  const heatmapCounts = useMemo(() => {
    if (selectedCategoryData) {
      return Object.fromEntries(
        (currentMonthTimeSeries[selectedCategoryData.category] ?? []).map((point) => [point.date, point.total])
      )
    }

    const grouped = new Map<string, number>()
    for (const series of Object.values(currentMonthTimeSeries)) {
      for (const point of series) {
        grouped.set(point.date, (grouped.get(point.date) || 0) + Number(point.total || 0))
      }
    }

    return Object.fromEntries(grouped)
  }, [currentMonthTimeSeries, selectedCategoryData])

  const totalProduction = useMemo(() => data.reduce((sum, item) => sum + item.total_production, 0), [data])
  const totalDetailGroups = useMemo(() => data.reduce((sum, item) => sum + item.details.length, 0), [data])
  const averagePerCategory = useMemo(
    () => (data.length > 0 ? Math.round(totalProduction / data.length) : 0),
    [data, totalProduction]
  )

  const rankedDetails = useMemo(
    () => [...(selectedCategoryData?.details ?? [])].sort((a, b) => b.quantity - a.quantity),
    [selectedCategoryData]
  )
  const visibleLeaderDetails = useMemo(
    () => (showAllLeaders ? rankedDetails : rankedDetails.slice(0, 6)),
    [rankedDetails, showAllLeaders]
  )
  const heatmapMonth = useMemo(() => new Date(), [])

  const handleRangeChange = (range: DateRangeOption, dates?: { from: Date; to: Date }) => {
    setSelectedRange(range)
    if (range === "custom" && dates) {
      setCustomDateRange(dates)
    }
  }

  const handleApplyShops = () => {
    setAppliedSelectedShops([...draftSelectedShops])
  }

  const handleClearShops = () => {
    setDraftSelectedShops([])
    setAppliedSelectedShops([])
  }

  const handleRemoveShop = (shop: string) => {
    const nextDraft = draftSelectedShops.filter((item) => item !== shop)
    const nextApplied = appliedSelectedShops.filter((item) => item !== shop)
    setDraftSelectedShops(nextDraft)
    setAppliedSelectedShops(nextApplied)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header
          title="Sản Phẩm Xuất Kho"
          description="Tổng quan sản phẩm xuất kho với các chỉ số sản lượng, xu hướng vận hành và phân bổ theo shop."
          actions={
            <DateRangeSelector
              selectedRange={selectedRange}
              onRangeChange={handleRangeChange}
              customDateRange={customDateRange}
            />
          }
        />

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5">
          <ShopFilter
            shops={availableShops}
            draftSelectedShops={draftSelectedShops}
            appliedSelectedShops={appliedSelectedShops}
            isLoading={isLoading || isLoadingShops}
            onDraftChange={setDraftSelectedShops}
            onApply={handleApplyShops}
            onClear={handleClearShops}
            onRemoveShop={handleRemoveShop}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Tổng sản lượng"
            value={totalProduction.toLocaleString("vi-VN")}
            helper="Tổng số lượng xuất kho trong kỳ đang chọn"
            icon={Package}
            tone="emerald"
          />
          <SummaryCard
            label="Danh mục"
            value={data.length.toLocaleString("vi-VN")}
            helper="Số nhóm sản phẩm đang có dữ liệu"
            icon={Layers3}
            tone="blue"
          />
          <SummaryCard
            label="Phân loại cấp 2"
            value={totalDetailGroups.toLocaleString("vi-VN")}
            helper="Tổng số nhóm chi tiết trong toàn bộ danh mục"
            icon={Boxes}
            tone="amber"
          />
          <SummaryCard
            label="Bình quân / danh mục"
            value={averagePerCategory.toLocaleString("vi-VN")}
            helper="Sản lượng trung bình trên mỗi danh mục"
            icon={TrendingUp}
            tone="slate"
          />
        </div>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.85fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">
                Tổng quan danh mục
              </p>
              <h2 className="text-2xl font-semibold text-foreground">Bản đồ sản lượng theo danh mục</h2>
              <p className="text-sm text-muted-foreground">
                Mỗi ô đại diện cho một danh mục. Chỉ ô đang chọn mới được tô xanh để xem chi tiết bên phải.
              </p>
            </div>

            {isLoading ? (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {data.map((item) => {
                  const isActive = selectedCategory === item.category
                  const share = totalProduction > 0 ? Math.round((item.total_production / totalProduction) * 100) : 0

                  return (
                    <button
                      key={item.category}
                      type="button"
                      onClick={() => setSelectedCategory((current) => (current === item.category ? null : item.category))}
                      className={cn(
                        "flex min-h-28 flex-col justify-between rounded-2xl border p-4 text-left shadow-sm transition",
                        isActive
                          ? "border-emerald-300 bg-emerald-100 ring-2 ring-emerald-300 ring-offset-2"
                          : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn("h-2.5 w-10 rounded-full", isActive ? "bg-emerald-700" : "bg-slate-300")} />
                        <div className="text-xs font-medium text-muted-foreground">{share}%</div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground">
                          {item.category}
                        </p>
                        <p className="text-2xl font-bold tracking-tight text-foreground">
                          {item.total_production.toLocaleString("vi-VN")}
                        </p>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{item.details.length.toLocaleString("vi-VN")} nhóm</span>
                        <span>Tổng phần {share}%</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {selectedCategoryData ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Spotlight</p>
                    <h2 className="text-2xl font-semibold text-foreground">{selectedCategoryData.category}</h2>
                    <p className="text-sm text-muted-foreground">
                      Tập trung vào một danh mục để đọc nhanh số lượng và cấu trúc cấp 2.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">Góc nhìn nhanh</p>
                        <p className="mt-1 text-sm leading-6 text-emerald-800">
                          {selectedCategoryData.category} hiện có{" "}
                          <strong>{selectedCategoryData.total_production.toLocaleString("vi-VN")}</strong> sản phẩm,
                          trải trên <strong>{selectedCategoryData.details.length}</strong> nhóm cấp 2.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tổng sản lượng</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                        {selectedCategoryData.total_production.toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Phân loại cấp 2</p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                        {selectedCategoryData.details.length.toLocaleString("vi-VN")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Nhóm dẫn đầu</p>
                      {rankedDetails.length > 6 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => setShowAllLeaders((current) => !current)}
                        >
                          {showAllLeaders ? (
                            <>
                              <ChevronUp className="mr-1 h-3.5 w-3.5" />
                              Thu gọn
                            </>
                          ) : (
                            <>
                              <ChevronDown className="mr-1 h-3.5 w-3.5" />
                              Xem thêm
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {visibleLeaderDetails.map((detail, index) => {
                        const topQuantity = rankedDetails[0]?.quantity ?? 1
                        const progress = Math.max(8, Math.round((detail.quantity / topQuantity) * 100))

                        return (
                          <div key={`${detail.level_2}-${index}`} className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-foreground">{detail.level_2}</p>
                              <span className="text-sm font-semibold text-foreground">
                                {detail.quantity.toLocaleString("vi-VN")}
                              </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-slate-100">
                              <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-center">
                  <div className="max-w-sm">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Spotlight</p>
                    <div className="mx-auto mb-4 mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                      <Package className="h-6 w-6" />
                    </div>
                    <p className="text-base font-medium text-foreground">Chưa có danh mục nào được chọn</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Bấm vào một ô trong bản đồ danh mục để xem chi tiết và biểu đồ của danh mục đó.
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Theo thời gian</p>
              <h3 className="text-xl font-semibold text-foreground">
                {selectedCategoryData
                  ? `${selectedCategoryData.category} trong tháng hiện tại`
                  : "Biểu đồ sản lượng trong tháng hiện tại"}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                Đường biểu diễn tổng sản lượng theo từng ngày trong toàn bộ tháng hiện tại, bám theo bộ lọc shop và danh mục.
              </p>
            </div>

            <div className="mt-6 h-[360px]">
              {selectedCategoryData && (currentMonthTimeSeries[selectedCategoryData.category] ?? []).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={currentMonthTimeSeries[selectedCategoryData.category] ?? []}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.24)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "currentColor", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString("vi-VN"), "Số lượng"]}
                      labelFormatter={(label) => `Ngày: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#10b981" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-muted-foreground">
                  {selectedCategoryData
                    ? "Danh mục này chưa có dữ liệu trong tháng hiện tại"
                    : "Chọn danh mục để hiển thị biểu đồ đường của tháng hiện tại"}
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Lịch vận hành</p>
              <h3 className="text-xl font-semibold text-foreground">
                {selectedCategoryData ? `${selectedCategoryData.category} trong tháng hiện tại` : "Tổng sản lượng tháng hiện tại"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Heatmap này luôn hiển thị toàn bộ tháng hiện tại và chỉ bám theo bộ lọc shop, danh mục đang chọn.
              </p>
            </div>

            <div className="mt-6">
              <CalendarHeatmap month={heatmapMonth} counts={heatmapCounts} onSelectDate={() => {}} />
            </div>
          </Card>
        </section>
      </main>
    </div>
  )
}
