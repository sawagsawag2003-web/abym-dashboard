"use client"

import { Package, PackageCheck, RotateCcw, ShoppingBag, Store, TrendingDown, TrendingUp, XCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export type MetricType = "totalExport" | "totalImport" | "returned" | "cancelled"

interface OrderStatsData {
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

interface OrderStatsCardsProps {
  data: OrderStatsData
  comparisons: Record<MetricType, MetricComparison>
  selectedMetric: MetricType
  onMetricSelect: (metric: MetricType) => void
  platformBreakdown: { TikTok: number; Shopee: number }
  categoryBreakdown: Array<{ category: string; quantity: number }>
  isLoading?: boolean
}

const dashboardCardClassName = "rounded-xl border border-border bg-card p-5 shadow-sm"
const dashboardSkeletonClassName = "bg-muted/70"

const metrics: {
  key: MetricType
  label: string
  icon: typeof Package
  iconClass: string
  activeClass: string
  badgeClass: string
}[] = [
  {
    key: "totalExport",
    label: "Tổng đơn xuất",
    icon: Package,
    iconClass: "bg-primary/10 text-primary",
    activeClass: "border-primary bg-primary text-primary-foreground shadow-md",
    badgeClass: "bg-primary-foreground/15 text-primary-foreground",
  },
  {
    key: "totalImport",
    label: "Tổng đơn về",
    icon: PackageCheck,
    iconClass: "bg-primary/10 text-primary",
    activeClass: "border-primary bg-primary text-primary-foreground shadow-md",
    badgeClass: "bg-primary-foreground/15 text-primary-foreground",
  },
  {
    key: "cancelled",
    label: "Đơn hủy",
    icon: XCircle,
    iconClass: "bg-primary/10 text-primary",
    activeClass: "border-primary bg-primary text-primary-foreground shadow-md",
    badgeClass: "bg-primary-foreground/15 text-primary-foreground",
  },
  {
    key: "returned",
    label: "Trả hàng hoàn tiền",
    icon: RotateCcw,
    iconClass: "bg-primary/10 text-primary",
    activeClass: "border-primary bg-primary text-primary-foreground shadow-md",
    badgeClass: "bg-primary-foreground/15 text-primary-foreground",
  },
]

const platformCards = [
  { key: "TikTok", label: "TikTok", icon: ShoppingBag },
  { key: "Shopee", label: "Shopee", icon: Store },
] as const

function ProductShirtIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path
        d="M8.25 5.25 10.7 7a2 2 0 0 0 2.6 0l2.45-1.75L19 7.5l-2 3-1.5-.75V19.5h-7V9.75L7 10.5l-2-3 3.25-2.25Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ProductPantsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path
        d="M8 4.5h8l-1.25 15h-2.3L12 13l-1.45 6.5h-2.3L8 4.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.4 8.5h7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ProductSweaterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path
        d="M9 5.25 12 3l3 2.25 2.75 2.25-1.75 3-1.75-1V19.5h-4.5V14h-1.5v5.5H6.75V9.5L5 10.5l-1.75-3L6 5.25h3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function getCategoryPresentation(category: string) {
  const normalized = category.trim().toLowerCase()

  if (normalized.includes("quan") || normalized.includes("pant")) {
    return ProductPantsIcon
  }

  if (normalized.includes("sweater") || normalized.includes("hoodie") || normalized.includes("jacket")) {
    return ProductSweaterIcon
  }

  return ProductShirtIcon
}

function PlatformCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof ShoppingBag
}) {
  return (
    <Card className={cn(dashboardCardClassName, "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-2xl font-bold tracking-tight text-foreground">{value.toLocaleString("vi-VN")}</p>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </Card>
  )
}

function MetricCard({
  metric,
  value,
  comparison,
  isSelected,
  onSelect,
}: {
  metric: (typeof metrics)[number]
  value: number
  comparison: MetricComparison
  isSelected: boolean
  onSelect: () => void
}) {
  const Icon = metric.icon
  const TrendIcon = comparison.trend === "down" ? TrendingDown : TrendingUp
  const comparisonText =
    comparison.changePercent === 0 ? "0%" : `${comparison.changePercent > 0 ? "+" : ""}${comparison.changePercent}%`

  return (
    <button type="button" onClick={onSelect} className="text-left">
      <Card
        className={cn(
          dashboardCardClassName,
          "cursor-pointer p-5 transition-all hover:border-primary hover:shadow-md",
          isSelected ? metric.activeClass : "text-card-foreground"
        )}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              isSelected ? "bg-primary-foreground/12 text-primary-foreground" : metric.iconClass
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              isSelected
                ? metric.badgeClass
                : comparison.trend === "up"
                  ? "bg-primary/10 text-primary"
                  : comparison.trend === "down"
                    ? "bg-muted text-foreground"
                    : "bg-muted text-muted-foreground"
            )}
          >
            {comparison.trend !== "neutral" && <TrendIcon className="h-3 w-3" />}
            {comparisonText}
          </span>
        </div>

        <p className="text-3xl font-bold tracking-tight">{value.toLocaleString("vi-VN")}</p>
        <p className={cn("mt-2 text-sm font-medium", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {metric.label}
        </p>
      </Card>
    </button>
  )
}

function CategoryCard({ category, quantity }: { category: string; quantity: number }) {
  const Icon = getCategoryPresentation(category)

  return (
    <Card className={cn(dashboardCardClassName, "p-5 transition-all hover:border-primary hover:shadow-md")}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon />
      </div>
      <p className="text-3xl font-bold tracking-tight text-foreground">{quantity.toLocaleString("vi-VN")}</p>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{category}</p>
    </Card>
  )
}

function OverviewSkeleton() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className={cn("h-7 w-56", dashboardSkeletonClassName)} />
          <Skeleton className={cn("h-4 w-72 max-w-full", dashboardSkeletonClassName)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className={cn(dashboardCardClassName, "p-4")}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className={cn("h-8 w-20", dashboardSkeletonClassName)} />
                  <Skeleton className={cn("h-4 w-16", dashboardSkeletonClassName)} />
                </div>
                <Skeleton className={cn("h-9 w-9 rounded-lg", dashboardSkeletonClassName)} />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className={dashboardCardClassName}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <Skeleton className={cn("h-10 w-10 rounded-lg", dashboardSkeletonClassName)} />
              <Skeleton className={cn("h-6 w-16 rounded-full", dashboardSkeletonClassName)} />
            </div>
            <Skeleton className={cn("h-10 w-24", dashboardSkeletonClassName)} />
            <Skeleton className={cn("mt-3 h-4 w-28", dashboardSkeletonClassName)} />
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className={cn("h-6 w-40", dashboardSkeletonClassName)} />
        <Skeleton className={cn("h-4 w-80 max-w-full", dashboardSkeletonClassName)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className={dashboardCardClassName}>
            <Skeleton className={cn("mb-4 h-10 w-10 rounded-lg", dashboardSkeletonClassName)} />
            <Skeleton className={cn("h-10 w-24", dashboardSkeletonClassName)} />
            <Skeleton className={cn("mt-3 h-4 w-28", dashboardSkeletonClassName)} />
          </Card>
        ))}
      </div>
    </section>
  )
}

export function OrderStatsCards({
  data,
  comparisons,
  selectedMetric,
  onMetricSelect,
  platformBreakdown,
  categoryBreakdown,
  isLoading,
}: OrderStatsCardsProps) {
  if (isLoading) {
    return <OverviewSkeleton />
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold leading-8 text-foreground">Tổng Quan Đơn Hàng</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Theo dõi KPI chính, kênh bán và sản phẩm nổi bật trong khoảng thời gian đã chọn.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {platformCards.map((platform) => (
            <PlatformCard
              key={platform.key}
              label={platform.label}
              value={platformBreakdown[platform.key]}
              icon={platform.icon}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            value={data[metric.key]}
            comparison={comparisons[metric.key]}
            isSelected={selectedMetric === metric.key}
            onSelect={() => onMetricSelect(metric.key)}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold leading-7 text-foreground">Sản Phẩm Nổi Bật</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Các nhóm sản phẩm được đồng bộ style card với hệ thống và sử dụng cùng logic nhóm như tab sản lượng.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
        {categoryBreakdown.map((item) => (
          <CategoryCard key={item.category} category={item.category} quantity={item.quantity} />
        ))}
      </div>
    </section>
  )
}
