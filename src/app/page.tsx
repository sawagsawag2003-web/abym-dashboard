"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { endOfMonth, format, isSameDay, startOfMonth } from "date-fns"
import { ArrowRightLeft, Box, CircleX, PackagePlus, X } from "lucide-react"
import { CalendarHeatmap } from "@/components/dashboard/CalendarHeatmap"
import { CarrierChart } from "@/components/dashboard/carrier-bar-chart"
import { DateRangeSelector, getDateRangeFromOption, type DateRangeOption } from "@/components/dashboard/date-range-selector"
import { Header } from "@/components/dashboard/header"
import { KpiCard } from "@/components/dashboard/KpiCard"
import { ShopFilter } from "@/components/dashboard/shop-filter"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type MetricType = "totalExport" | "totalImport" | "returned" | "cancelled"

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

interface ApiResponse {
  stats: StatsData
  comparisons: Record<MetricType, MetricComparison>
  chartData: Record<MetricType, Record<string, number>>
  carrierCounts: Record<MetricType, Record<string, number>>
  shopBreakdown: Array<{
    shop: string
    totalExport: number
    totalImport: number
    cancelled: number
    returned: number
  }>
  categoryBreakdown: Record<MetricType, Record<string, number>>
  categoryVariantBreakdown: Record<MetricType, Record<string, VariantBreakdownItem[]>>
  shopInsights: Array<{
    shop: string
    totalExport: number
    totalImport: number
    cancelled: number
    returned: number
    returnRate: number
    cancelRate: number
    exportProducts: Array<{
      originalName: string
      normalizedSku: string
      quantity: number
    }>
  }>
  operations: {
    returnRate: number
  }
}

interface VariantBreakdownItem {
  variant: string
  sku: string
  color: string
  quantity: number
}

interface ShopsResponse {
  shops: string[]
}

interface FeaturedCategory {
  category: string
  code: string
  fullName: string
  totalQuantity: number
}

interface FeaturedVariant extends VariantBreakdownItem {
  progress: number
}

const metricMeta: Record<
  MetricType,
  {
    label: string
    sectionTitle: string
    sectionSummary: string
    chartTitle: string
    chartDescription: string
    totalLabel: string
  }
> = {
  totalExport: {
    label: "Đơn xuất",
    sectionTitle: "Tổng xuất kho",
    sectionSummary: "Tổng số sản phẩm xuất kho theo loại sản phẩm trong khoảng ngày đã chọn.",
    chartTitle: "Lượng đơn theo đơn vị vận chuyển",
    chartDescription: "Biểu đồ thay đổi theo khoảng ngày và thẻ Đơn xuất đang được chọn.",
    totalLabel: "Tổng đơn xuất",
  },
  totalImport: {
    label: "Đơn về",
    sectionTitle: "Tổng đơn về",
    sectionSummary: "Tổng số sản phẩm đơn về theo loại sản phẩm trong khoảng ngày đã chọn.",
    chartTitle: "Lượng đơn về theo đơn vị vận chuyển",
    chartDescription: "Biểu đồ thay đổi theo khoảng ngày và thẻ Đơn về đang được chọn.",
    totalLabel: "Tổng đơn về",
  },
  cancelled: {
    label: "Đơn hủy",
    sectionTitle: "Tổng đơn hủy",
    sectionSummary: "Tổng số sản phẩm thuộc các đơn hủy theo loại sản phẩm trong khoảng ngày đã chọn.",
    chartTitle: "Lượng đơn hủy theo đơn vị vận chuyển",
    chartDescription: "Biểu đồ thay đổi theo khoảng ngày và thẻ Đơn hủy đang được chọn.",
    totalLabel: "Tổng đơn hủy",
  },
  returned: {
    label: "Đơn hoàn",
    sectionTitle: "Tổng đơn hoàn",
    sectionSummary: "Tổng số sản phẩm thuộc các đơn hoàn theo loại sản phẩm trong khoảng ngày đã chọn.",
    chartTitle: "Lượng đơn hoàn theo đơn vị vận chuyển",
    chartDescription: "Biểu đồ thay đổi theo khoảng ngày và thẻ Đơn hoàn đang được chọn.",
    totalLabel: "Tổng đơn hoàn",
  },
}

const categoryMetadata: Record<string, { code: string; fullName: string }> = {
  SU: { code: "SU", fullName: "Ao Su" },
  "SHORT A Ni": { code: "QDA1", fullName: "Short A Ni" },
  "QN Ong Rong": { code: "QN", fullName: "Quan Ong Rong" },
  SWEATER: { code: "SWT", fullName: "Sweater" },
  "QN Baggy": { code: "BG", fullName: "Quan Baggy" },
  "JEAN THUONG": { code: "JT", fullName: "Jean Thuong" },
  "JEAN GK": { code: "JGK", fullName: "Jean GK" },
  "BoP Kids Tici": { code: "BOP", fullName: "BoP Kids Tici" },
  "Bo Kids Tici": { code: "BO", fullName: "Bo Kids Tici" },
  "Ao Kids Tici": { code: "KT", fullName: "Ao Kids Tici" },
  "Short Kids Tici": { code: "KQ", fullName: "Short Kids Tici" },
  "Raglan Kids Tici": { code: "KP", fullName: "Raglan Kids Tici" },
}

function buildQueryString(from: Date, to: Date, shops: string[] = []) {
  const params = new URLSearchParams({
    from: format(from, "yyyy-MM-dd"),
    to: format(to, "yyyy-MM-dd"),
  })

  for (const shop of shops) {
    params.append("shop", shop)
  }

  return params.toString()
}

function getCategoryMeta(category: string): { code: string; fullName: string } {
  const knownMeta = categoryMetadata[category]
  if (knownMeta) return knownMeta

  const fallbackCode =
    category
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 4)
      .toUpperCase() || "SKU"

  return { code: fallbackCode, fullName: category }
}

function buildFeaturedCategories(
  breakdown: Record<string, number> | undefined,
  selectedMetric: MetricType
): FeaturedCategory[] {
  return Object.entries(breakdown ?? {})
    .map(([category, totalQuantity]) => {
      const meta = getCategoryMeta(category)
      return {
        category,
        code: meta.code,
        fullName: meta.fullName,
        totalQuantity: Number(totalQuantity || 0),
      }
    })
    .filter((item) => item.totalQuantity > 0)
    .sort((left, right) => {
      if (right.totalQuantity !== left.totalQuantity) {
        return right.totalQuantity - left.totalQuantity
      }

      if (selectedMetric === "totalExport") {
        return left.code.localeCompare(right.code)
      }

      return left.fullName.localeCompare(right.fullName)
    })
    .slice(0, 8)
}

function buildCarrierData(carrierCounts: Record<string, number> | undefined) {
  return Object.entries(carrierCounts ?? {})
    .map(([carrier, count]) => ({
      carrier,
      count: Number(count || 0),
    }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.carrier.localeCompare(right.carrier))
}

function buildFeaturedVariants(variants: VariantBreakdownItem[] | undefined): FeaturedVariant[] {
  const normalizedVariants = (variants ?? []).filter((item) => Number(item.quantity || 0) > 0)
  const maxQuantity = Math.max(1, ...normalizedVariants.map((item) => Number(item.quantity || 0)))

  return normalizedVariants.map((item) => ({
    ...item,
    progress: Math.max(8, Math.min(100, Math.round((Number(item.quantity || 0) / maxQuantity) * 100))),
  }))
}

function buildPlatformTotals(carrierCounts: Record<string, number> | undefined) {
  const normalizedCounts = Object.fromEntries(
    Object.entries(carrierCounts ?? {}).map(([carrier, count]) => [
      carrier.toLowerCase().includes("dv kh") ? "DV Khac" : carrier,
      Number(count || 0),
    ])
  )

  const tiktok = (normalizedCounts["J&T"] || 0) + (normalizedCounts.BEST || 0) + (normalizedCounts.VTP || 0)
  const shopee = (normalizedCounts.SPX || 0) + (normalizedCounts.GHN || 0) + (normalizedCounts["DV Khac"] || 0)

  return { tiktok, shopee }
}

function getComparisonLabel(
  selectedRange: DateRangeOption,
  customDateRange?: { from: Date; to: Date }
): string {
  switch (selectedRange) {
    case "today":
      return "hôm qua"
    case "yesterday":
      return "hôm kia"
    case "thisWeek":
      return "tuần trước"
    case "last7Days":
      return "7 ngày trước đó"
    case "thisMonth":
      return "tháng trước"
    case "custom":
      if (customDateRange && isSameDay(customDateRange.from, customDateRange.to)) {
        return "ngày trước đó"
      }
      return "kỳ trước"
    default:
      return "kỳ trước"
  }
}

function OperationsCard({
  title,
  helper,
  value,
  progressValue,
  suffix = "%",
  indicatorClassName,
}: {
  title: string
  helper: string
  value: string
  progressValue: number
  suffix?: string
  indicatorClassName: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
        <span className="text-sm font-semibold text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Progress
        value={progressValue}
        className={`h-2.5 rounded-full bg-slate-100 [&_[data-slot=progress-indicator]]:rounded-full ${indicatorClassName}`}
      />
    </div>
  )
}

function ProductStatRow({
  code,
  fullName,
  totalQuantity,
  maxQuantity,
}: {
  code: string
  fullName: string
  totalQuantity: number
  maxQuantity: number
}) {
  const progressValue = Math.max(6, Math.min(100, Math.round((totalQuantity / Math.max(maxQuantity, 1)) * 100)))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            {code} - {fullName}
          </p>
          <p className="text-xs text-muted-foreground">
            {code} - {fullName}: {totalQuantity.toLocaleString("vi-VN")}
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground">{totalQuantity.toLocaleString("vi-VN")}</span>
      </div>
      <Progress
        value={progressValue}
        className="h-2.5 rounded-full bg-slate-100 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-emerald-500"
      />
    </div>
  )
}

function VariantStatRow({ item }: { item: FeaturedVariant }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{item.variant}</p>
          <p className="text-xs text-muted-foreground">
            SKU: {item.sku} | Màu: {item.color}
          </p>
        </div>
        <span className="text-sm font-semibold text-foreground">{item.quantity.toLocaleString("vi-VN")}</span>
      </div>
      <Progress
        value={item.progress}
        className="h-2.5 rounded-full bg-slate-100 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-sky-500"
      />
    </div>
  )
}

function ShopStatRow({
  rank,
  shop,
  totalExport,
  totalImport,
  cancelled,
  returned,
  returnRate,
  cancelRate,
  maxReference,
}: {
  rank: number
  shop: string
  totalExport: number
  totalImport: number
  cancelled: number
  returned: number
  returnRate: number
  cancelRate: number
  maxReference: number
}) {
  const exportProgress = Math.max(0, Math.min(100, Math.round((totalExport / Math.max(maxReference, 1)) * 100)))
  const importProgress = Math.max(0, Math.min(100, (totalImport / Math.max(maxReference, 1)) * 100))
  const returnedShare = totalImport > 0 ? (returned / totalImport) * 100 : 0
  const cancelledShare = totalImport > 0 ? (cancelled / totalImport) * 100 : 0

  const getRateClassName = (rate: number) => {
    if (rate < 5) return "text-emerald-600"
    if (rate <= 7) return "text-amber-600"
    return "text-red-600"
  }

  let statusLabel = "Ổn định"
  let statusClassName = "border-emerald-200 bg-emerald-50 text-emerald-700"

  if (cancelRate > 7 || returnRate > 7) {
    statusLabel = "Cần xem"
    statusClassName = "border-red-200 bg-red-50 text-red-700"
  } else if (cancelRate >= 5 || returnRate >= 5) {
    statusLabel = "Theo dõi"
    statusClassName = "border-amber-200 bg-amber-50 text-amber-700"
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
            #{rank}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{shop}</p>
            <p className="text-[11px] text-muted-foreground">
              <span className={cn("font-medium", getRateClassName(returnRate))}>
                Hoàn {returnRate.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>{" "}
              |{" "}
              <span className={cn("font-medium", getRateClassName(cancelRate))}>
                Hủy {cancelRate.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            </p>
          </div>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", statusClassName)}>{statusLabel}</span>
      </div>

      <div className="space-y-1.5">
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-3 text-xs">
            <span className="font-semibold text-foreground">{totalExport.toLocaleString("vi-VN")}</span>
          </div>
          <Progress
            value={exportProgress}
            className="h-2 rounded-full bg-slate-100 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-end gap-3 text-xs">
            <span className="font-semibold text-foreground">{totalImport.toLocaleString("vi-VN")}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="flex h-full rounded-full" style={{ width: `${importProgress}%` }}>
              <div className="h-full bg-amber-500" style={{ width: `${returnedShare}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${cancelledShare}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("yesterday")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date; to: Date } | undefined>()
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("totalExport")
  const [availableShops, setAvailableShops] = useState<string[]>([])
  const [draftSelectedShops, setDraftSelectedShops] = useState<string[]>([])
  const [appliedSelectedShops, setAppliedSelectedShops] = useState<string[]>([])
  const [rangeData, setRangeData] = useState<ApiResponse | null>(null)
  const [heatmapData, setHeatmapData] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingShops, setIsLoadingShops] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFeaturedCategory, setActiveFeaturedCategory] = useState<string | null>(null)
  const [showAllFeaturedProducts, setShowAllFeaturedProducts] = useState(false)
  const [showAllFeaturedVariants, setShowAllFeaturedVariants] = useState(false)
  const [activeShopInsight, setActiveShopInsight] = useState<string | null>(null)
  const [showAllShopInsights, setShowAllShopInsights] = useState(false)
  const [showAllShopProducts, setShowAllShopProducts] = useState(false)
  const activeRequestIdRef = useRef(0)

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

  useEffect(() => {
    const requestId = activeRequestIdRef.current + 1
    activeRequestIdRef.current = requestId

    async function fetchDashboardData() {
      setIsLoading(true)
      setError(null)

      try {
        const currentMonthFrom = startOfMonth(new Date())
        const currentMonthTo = endOfMonth(new Date())
        const rangeQuery = buildQueryString(dateRange.from, dateRange.to, appliedSelectedShops)
        const heatmapQuery = buildQueryString(currentMonthFrom, currentMonthTo, appliedSelectedShops)

        const [rangeResponse, heatmapResponse] = await Promise.all([
          fetch(`/api/orders?${rangeQuery}`, { cache: "no-store" }),
          fetch(`/api/orders?${heatmapQuery}`, { cache: "no-store" }),
        ])

        if (!rangeResponse.ok || !heatmapResponse.ok) {
          throw new Error("Không thể tải dữ liệu dashboard")
        }

        const [rangeJson, heatmapJson] = (await Promise.all([
          rangeResponse.json(),
          heatmapResponse.json(),
        ])) as [ApiResponse, ApiResponse]

        if (requestId !== activeRequestIdRef.current) return

        setRangeData(rangeJson)
        setHeatmapData(heatmapJson)
      } catch (err) {
        if (requestId === activeRequestIdRef.current) {
          setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
        }
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsLoading(false)
        }
      }
    }

    fetchDashboardData()
  }, [appliedSelectedShops, dateRange.from, dateRange.to])

  const handleRangeChange = (range: DateRangeOption, dates?: { from: Date; to: Date }) => {
    setSelectedRange(range)
    if (range === "custom" && dates) {
      setCustomDateRange(dates)
    }
  }

  const handleCalendarDateSelect = (date: Date) => {
    const normalizedDate = new Date(date)
    normalizedDate.setHours(0, 0, 0, 0)
    setSelectedRange("custom")
    setCustomDateRange({ from: normalizedDate, to: normalizedDate })
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

  const handleSelectShopInsight = (shop: string) => {
    const isSameShopSelected = appliedSelectedShops.length === 1 && appliedSelectedShops[0] === shop

    if (isSameShopSelected) {
      setActiveShopInsight(null)
      setDraftSelectedShops([])
      setAppliedSelectedShops([])
      return
    }

    setActiveShopInsight(shop)
    setDraftSelectedShops([shop])
    setAppliedSelectedShops([shop])
  }

  const stats = rangeData?.stats ?? {
    totalExport: 0,
    totalImport: 0,
    returned: 0,
    cancelled: 0,
  }

  const comparisons = rangeData?.comparisons ?? {
    totalExport: { previous: 0, changePercent: 0, trend: "neutral" as const },
    totalImport: { previous: 0, changePercent: 0, trend: "neutral" as const },
    returned: { previous: 0, changePercent: 0, trend: "neutral" as const },
    cancelled: { previous: 0, changePercent: 0, trend: "neutral" as const },
  }

  const operations = rangeData?.operations ?? {
    returnRate: 0,
  }

  const featuredProducts = useMemo(
    () => buildFeaturedCategories(rangeData?.categoryBreakdown?.[selectedMetric], selectedMetric),
    [rangeData, selectedMetric]
  )
  const featuredVariantsByCategory = useMemo(
    () => rangeData?.categoryVariantBreakdown?.[selectedMetric] ?? {},
    [rangeData, selectedMetric]
  )

  const maxFeaturedProductQuantity = useMemo(
    () => Math.max(0, ...featuredProducts.map((product) => product.totalQuantity)),
    [featuredProducts]
  )
  const activeFeaturedProduct = useMemo(
    () => featuredProducts.find((product) => product.category === activeFeaturedCategory) ?? null,
    [activeFeaturedCategory, featuredProducts]
  )
  const activeFeaturedVariants = useMemo(
    () =>
      buildFeaturedVariants(
        activeFeaturedProduct ? featuredVariantsByCategory[activeFeaturedProduct.category] : undefined
      ),
    [activeFeaturedProduct, featuredVariantsByCategory]
  )
  const visibleFeaturedProducts = useMemo(
    () => (showAllFeaturedProducts ? featuredProducts : featuredProducts.slice(0, 5)),
    [featuredProducts, showAllFeaturedProducts]
  )
  const visibleFeaturedVariants = useMemo(
    () => (showAllFeaturedVariants ? activeFeaturedVariants : activeFeaturedVariants.slice(0, 6)),
    [activeFeaturedVariants, showAllFeaturedVariants]
  )

  const carrierChartData = useMemo(
    () => buildCarrierData(rangeData?.carrierCounts?.[selectedMetric]),
    [rangeData, selectedMetric]
  )
  const platformTotals = useMemo(
    () => buildPlatformTotals(rangeData?.carrierCounts?.[selectedMetric]),
    [rangeData, selectedMetric]
  )
  const heatmapCounts = useMemo(
    () => heatmapData?.chartData?.[selectedMetric] ?? {},
    [heatmapData, selectedMetric]
  )
  const shopInsights = useMemo(
    () => rangeData?.shopInsights ?? [],
    [rangeData]
  )

  const selectedCalendarDate = useMemo(
    () => (isSameDay(dateRange.from, dateRange.to) ? dateRange.from : undefined),
    [dateRange.from, dateRange.to]
  )

  const currentMetricMeta = metricMeta[selectedMetric]
  const comparisonLabel = useMemo(
    () => getComparisonLabel(selectedRange, customDateRange),
    [customDateRange, selectedRange]
  )

  useEffect(() => {
    setActiveFeaturedCategory((current) =>
      current && featuredProducts.some((product) => product.category === current) ? current : null
    )
  }, [featuredProducts])

  useEffect(() => {
    setShowAllFeaturedVariants(false)
  }, [activeFeaturedCategory])

  useEffect(() => {
    setActiveShopInsight((current) => (current && shopInsights.some((shop) => shop.shop === current) ? current : null))
  }, [shopInsights])

  useEffect(() => {
    setShowAllShopProducts(false)
  }, [activeShopInsight])

  const maxShopExport = useMemo(
    () => Math.max(0, ...shopInsights.map((shop) => shop.totalExport)),
    [shopInsights]
  )
  const activeShop = useMemo(
    () => shopInsights.find((shop) => shop.shop === activeShopInsight) ?? null,
    [activeShopInsight, shopInsights]
  )
  const topExportShop = useMemo(
    () => shopInsights[0] ?? null,
    [shopInsights]
  )
  const visibleShopInsights = useMemo(
    () => (showAllShopInsights ? shopInsights : shopInsights.slice(0, 5)),
    [shopInsights, showAllShopInsights]
  )
  const visibleShopProducts = useMemo(
    () => (showAllShopProducts ? activeShop?.exportProducts ?? [] : (activeShop?.exportProducts ?? []).slice(0, 5)),
    [activeShop, showAllShopProducts]
  )

  const kpiCards = [
    {
      key: "totalExport" as const,
      label: "Đơn xuất",
      value: stats.totalExport,
      comparison: comparisons.totalExport,
      tone: "emerald" as const,
      icon: PackagePlus,
    },
    {
      key: "totalImport" as const,
      label: "Đơn về",
      value: stats.totalImport,
      comparison: comparisons.totalImport,
      tone: "emerald" as const,
      icon: ArrowRightLeft,
    },
    {
      key: "returned" as const,
      label: "Đơn hoàn",
      value: stats.returned,
      comparison: comparisons.returned,
      tone: "amber" as const,
      icon: Box,
    },
    {
      key: "cancelled" as const,
      label: "Đơn hủy",
      value: stats.cancelled,
      comparison: comparisons.cancelled,
      tone: "red" as const,
      icon: CircleX,
    },
  ]

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 px-4 pb-8 pt-6 md:px-6 lg:ml-64 lg:px-8">
        <Header
          title="Dashboard XMKN"
          description="Đơn xuất đang được dùng làm bộ lọc chính cho biểu đồ vận chuyển và nhóm sản phẩm nổi bật."
          actions={
            <>
              <DateRangeSelector
                selectedRange={selectedRange}
                onRangeChange={handleRangeChange}
                customDateRange={customDateRange}
              />
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <div className="rounded-full border border-sky-100 bg-sky-50 px-4 py-3 text-lg font-semibold text-sky-700 shadow-sm">
                  TikTok: {platformTotals.tiktok.toLocaleString("vi-VN")}
                </div>
                <div className="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-700 shadow-sm">
                  Shopee: {platformTotals.shopee.toLocaleString("vi-VN")}
                </div>
              </div>
            </>
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
          {kpiCards.map((card) => (
            <KpiCard
              key={card.key}
              label={card.label}
              value={card.value}
              changePercent={card.comparison.changePercent}
              comparisonLabel={comparisonLabel}
              trend={card.comparison.trend}
              tone={card.tone}
              icon={card.icon}
              active={selectedMetric === card.key}
              onClick={() => setSelectedMetric(card.key)}
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <CarrierChart
            data={carrierChartData}
            isLoading={isLoading}
            title={currentMetricMeta.chartTitle}
            description={currentMetricMeta.chartDescription}
            totalLabel={currentMetricMeta.totalLabel}
          />

          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">
                {currentMetricMeta.sectionTitle}
              </p>
              <h2 className="text-2xl font-semibold text-foreground">Sản phẩm nổi bật</h2>
              <p className="text-sm text-muted-foreground">
                Bấm vào loại sản phẩm để xem top 6 biến thể SKU + màu có số lượng cao nhất.
              </p>
            </div>

            <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className={cn("grid grid-cols-1 gap-6", activeFeaturedProduct && "xl:grid-cols-[1.15fr_0.95fr]")}>
                {activeFeaturedProduct && (
                  <div className="space-y-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Preview</p>
                        <h3 className="text-xl font-semibold text-foreground">{activeFeaturedProduct.fullName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {`${activeFeaturedProduct.code} | ${activeFeaturedProduct.totalQuantity.toLocaleString("vi-VN")} sản phẩm`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveFeaturedCategory(null)}
                        className="rounded-full border border-sky-200 bg-white/80 p-2 text-sky-700 transition hover:bg-white"
                        aria-label="Ẩn preview"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {activeFeaturedVariants.length > 0 ? (
                      <div className="space-y-4">
                        {visibleFeaturedVariants.map((item) => (
                          <VariantStatRow key={item.variant} item={item} />
                        ))}

                        {activeFeaturedVariants.length > 6 && (
                          <button
                            type="button"
                            onClick={() => setShowAllFeaturedVariants((current) => !current)}
                            className="rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-white"
                          >
                            {showAllFeaturedVariants ? "Thu gọn biến thể" : "Xem tất cả biến thể"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-sky-200 bg-white/70 px-4 py-8 text-sm text-muted-foreground">
                        Không có dữ liệu biến thể SKU + màu cho loại sản phẩm này trong khoảng ngày đã chọn.
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-5">
                  {visibleFeaturedProducts.map((product) => {
                    const isActive = activeFeaturedProduct?.category === product.category

                    return (
                      <button
                        key={product.category}
                        type="button"
                        onClick={() =>
                          setActiveFeaturedCategory((current) =>
                            current === product.category ? null : product.category
                          )
                        }
                        className={cn(
                          "block w-full rounded-2xl border border-transparent p-2 text-left transition",
                          isActive && "bg-slate-50"
                        )}
                      >
                        <ProductStatRow
                          code={product.code}
                          fullName={product.fullName}
                          totalQuantity={product.totalQuantity}
                          maxQuantity={maxFeaturedProductQuantity}
                        />
                      </button>
                    )
                  })}

                  {featuredProducts.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllFeaturedProducts((current) => !current)}
                      className="w-full rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                    >
                      {showAllFeaturedProducts ? "Thu gọn loại sản phẩm" : "Xem tất cả loại sản phẩm"}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>

        <section className="mt-6 space-y-4">
          <div className={cn("grid grid-cols-1 gap-4", activeShop ? "xl:grid-cols-[0.92fr_1.08fr]" : "xl:grid-cols-[1fr_1fr]")}>
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Shop nổi bật</p>
                <h2 className="text-2xl font-semibold text-foreground">Vận hành theo shop</h2>
                <p className="text-sm text-muted-foreground">
                  Top 5 shop theo số lượng đơn đi. Bấm vào một shop để xem chi tiết.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span>Đơn đi</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <span>Đơn về</span>
                    </span>
                  </div>
                  {topExportShop && (
                    <span>
                      Đi nhiều nhất: <span className="font-semibold text-foreground">{topExportShop.shop}</span>
                    </span>
                  )}
                </div>
              </div>

              <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="space-y-3.5">
                  {visibleShopInsights.map((shop) => {
                    const isActive = activeShop?.shop === shop.shop

                    return (
                      <button
                        key={shop.shop}
                        type="button"
                        onClick={() => handleSelectShopInsight(shop.shop)}
                        className={cn(
                          "block w-full rounded-2xl border border-transparent p-2 text-left transition",
                          isActive && "bg-slate-50"
                        )}
                      >
                        <ShopStatRow
                          rank={shopInsights.findIndex((item) => item.shop === shop.shop) + 1}
                          shop={shop.shop}
                          totalExport={shop.totalExport}
                          totalImport={shop.totalImport}
                          cancelled={shop.cancelled}
                          returned={shop.returned}
                          returnRate={shop.returnRate}
                          cancelRate={shop.cancelRate}
                          maxReference={maxShopExport}
                        />
                      </button>
                    )
                  })}

                  {shopInsights.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAllShopInsights((current) => !current)}
                      className="w-full rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                    >
                      {showAllShopInsights ? "Thu gọn shop" : "Xem tất cả shop"}
                    </button>
                  )}
                </div>
              </Card>
            </div>

            {activeShop ? (
              <div className="space-y-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">Preview</p>
                      <h3 className="text-xl font-semibold text-foreground">{activeShop.shop}</h3>
                      <p className="text-sm text-muted-foreground">
                        Đơn đi {activeShop.totalExport.toLocaleString("vi-VN")} | Đơn về {activeShop.totalImport.toLocaleString("vi-VN")}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveShopInsight(null)}
                      className="rounded-full border border-amber-200 bg-white/80 p-2 text-amber-700 transition hover:bg-white"
                      aria-label="Ẩn preview shop"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Đơn đi</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {activeShop.totalExport.toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Đơn về</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {activeShop.totalImport.toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Đơn hoàn</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-600">
                        {activeShop.returned.toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Đơn hủy</p>
                      <p className="mt-2 text-2xl font-semibold text-red-600">
                        {activeShop.cancelled.toLocaleString("vi-VN")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5 rounded-2xl border border-white/70 bg-white/80 p-4">
                    <OperationsCard
                      title="Tỷ lệ hoàn"
                      helper="Đơn hoàn / đơn đi trong khoảng thời gian đã chọn"
                      value={activeShop.returnRate.toLocaleString("vi-VN", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      progressValue={Math.max(0, Math.min(100, activeShop.returnRate))}
                      indicatorClassName="[&_[data-slot=progress-indicator]]:bg-amber-500"
                    />

                    <OperationsCard
                      title="Tỷ lệ hủy"
                      helper="Đơn hủy / đơn đi trong khoảng thời gian đã chọn"
                      value={activeShop.cancelRate.toLocaleString("vi-VN", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      progressValue={Math.max(0, Math.min(100, activeShop.cancelRate))}
                      indicatorClassName="[&_[data-slot=progress-indicator]]:bg-red-500"
                    />
                  </div>

                  <div className="space-y-4 rounded-2xl border border-white/70 bg-white/80 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">Sản phẩm xuất đi</p>
                      <p className="text-xs text-muted-foreground">Top sản phẩm xuất theo khoảng ngày đang chọn.</p>
                    </div>

                    {activeShop.exportProducts.length > 0 ? (
                      <div className="space-y-3">
                        {visibleShopProducts.map((product) => (
                          <div key={`${product.originalName}-${product.normalizedSku}`} className="space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {product.normalizedSku || product.originalName || "Chưa chuẩn hóa SKU"}
                                </p>
                              </div>
                              <span className="text-sm font-semibold text-foreground">
                                {product.quantity.toLocaleString("vi-VN")}
                              </span>
                            </div>
                            <Progress
                              value={Math.max(
                                8,
                                Math.min(
                                  100,
                                  Math.round(
                                    (product.quantity /
                                      Math.max(1, activeShop.exportProducts[0]?.quantity ?? 1)) *
                                      100
                                  )
                                )
                              )}
                              className="h-2.5 rounded-full bg-slate-100 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-sky-500"
                            />
                          </div>
                        ))}

                        {activeShop.exportProducts.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setShowAllShopProducts((current) => !current)}
                            className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
                          >
                            {showAllShopProducts ? "Thu gọn sản phẩm" : "Xem tất cả sản phẩm"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-muted-foreground">
                        Không có dữ liệu sản phẩm xuất đi cho shop này trong khoảng ngày đã chọn.
                      </div>
                    )}
                  </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Lịch vận hành</p>
                  <h2 className="text-2xl font-semibold text-foreground">Theo ngày trong tháng</h2>
                  <p className="text-sm text-muted-foreground">
                    Màu càng đậm, sản lượng đơn theo bộ lọc hiện tại càng cao.
                  </p>
                </div>

                <CalendarHeatmap
                  month={new Date()}
                  counts={heatmapCounts}
                  selectedDate={selectedCalendarDate}
                  onSelectDate={handleCalendarDateSelect}
                />
              </div>
            )}
          </div>

          {activeShop && (
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Lịch vận hành</p>
              <h2 className="text-2xl font-semibold text-foreground">Theo ngày trong tháng</h2>
              <p className="text-sm text-muted-foreground">
                Màu càng đậm, sản lượng đơn theo bộ lọc hiện tại càng cao.
              </p>
            </div>
          )}

          {activeShop && (
            <CalendarHeatmap
              month={new Date()}
              counts={heatmapCounts}
              selectedDate={selectedCalendarDate}
              onSelectDate={handleCalendarDateSelect}
            />
          )}
        </section>

        <section className="mt-6">
          <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Tình trạng kho</p>
              <h3 className="text-xl font-semibold text-foreground">Operations snapshot</h3>
            </div>

            <div className="mt-6 space-y-5">
              <OperationsCard
                title="Tỷ lệ đơn hoàn"
                helper="Đơn về / đơn xuất trong khoảng thời gian đã chọn"
                value={operations.returnRate.toLocaleString("vi-VN", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
                progressValue={Math.max(0, Math.min(100, operations.returnRate))}
                indicatorClassName="[&_[data-slot=progress-indicator]]:bg-emerald-500"
              />
            </div>
          </Card>
        </section>

        {isLoading && <div className="mt-4 text-sm text-muted-foreground">Đang tải dữ liệu dashboard...</div>}
      </main>
    </div>
  )
}
