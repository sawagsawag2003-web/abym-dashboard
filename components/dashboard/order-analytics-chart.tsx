"use client"

import { Card } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { MetricType } from "./order-stats-cards"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { Skeleton } from "@/components/ui/skeleton"

interface ChartDataPoint {
  date: string
  value: number
  fullDate: Date
}

interface OrderAnalyticsChartProps {
  data: ChartDataPoint[]
  selectedMetric: MetricType
  isLoading?: boolean
}

const cardClassName = "rounded-xl border border-border bg-card p-6 shadow-sm"
const skeletonClassName = "bg-muted/70"

const metricLabels: Record<MetricType, string> = {
  totalExport: "Tổng Đơn Xuất",
  totalImport: "Tổng Đơn Về",
  returned: "Trả Hàng Hoàn Tiền",
  cancelled: "Đơn Hủy",
}

const metricColors: Record<MetricType, { stroke: string; fill: string }> = {
  totalExport: { stroke: "#2563eb", fill: "#2563eb" },
  totalImport: { stroke: "#2563eb", fill: "#2563eb" },
  returned: { stroke: "#2563eb", fill: "#2563eb" },
  cancelled: { stroke: "#2563eb", fill: "#2563eb" },
}

export function OrderAnalyticsChart({ data, selectedMetric, isLoading }: OrderAnalyticsChartProps) {
  const colors = metricColors[selectedMetric]
  const label = metricLabels[selectedMetric]
  const total = data.reduce((acc, item) => acc + item.value, 0)
  const average = data.length > 0 ? Math.round(total / data.length) : 0

  if (isLoading) {
    return (
      <Card className={cardClassName}>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="space-y-2">
            <Skeleton className={`h-6 w-40 ${skeletonClassName}`} />
            <Skeleton className={`h-4 w-52 ${skeletonClassName}`} />
          </div>
          <div className="flex gap-3">
            <Skeleton className={`h-9 w-24 rounded-lg ${skeletonClassName}`} />
            <Skeleton className={`h-9 w-24 rounded-lg ${skeletonClassName}`} />
          </div>
        </div>
        <Skeleton className={`h-[350px] w-full rounded-xl ${skeletonClassName}`} />
      </Card>
    )
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload
      return (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
          <p className="text-sm font-semibold text-foreground">{payload[0].value.toLocaleString("vi-VN")} đơn</p>
          <p className="text-muted-foreground">{format(dataPoint.fullDate, "EEEE, dd/MM/yyyy", { locale: vi })}</p>
        </div>
      )
    }
    return null
  }

  return (
    <Card className={cardClassName}>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold leading-8 text-foreground">{label}</h2>
          <p className="text-sm leading-6 text-muted-foreground">Biểu đồ theo thời gian trong khoảng ngày đã chọn.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tổng: </span>
            <span className="font-semibold text-foreground">{total.toLocaleString("vi-VN")}</span>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">TB/ngày: </span>
            <span className="font-semibold text-foreground">{average.toLocaleString("vi-VN")}</span>
          </div>
        </div>
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.fill} stopOpacity={0.24} />
                <stop offset="100%" stopColor={colors.fill} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.24)" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 12 }}
              className="text-muted-foreground"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 12 }}
              className="text-muted-foreground"
              domain={[0, "auto"]}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: colors.stroke, strokeWidth: 1, strokeDasharray: "5 5" }} />
            <Area type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2.5} fill={`url(#gradient-${selectedMetric})`} animationDuration={500} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
