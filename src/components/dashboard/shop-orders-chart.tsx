"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface ShopOrdersChartRow {
  shop: string
  totalExport: number
  cancelled: number
  returned: number
  totalImport: number
}

interface ShopOrdersChartProps {
  data?: ShopOrdersChartRow[]
  isLoading?: boolean
}

const chartConfig = {
  totalExport: {
    label: "Đơn xuất",
    color: "#16a34a",
  },
  cancelled: {
    label: "Đơn hủy",
    color: "#dc2626",
  },
  returned: {
    label: "Đơn hoàn",
    color: "#f97316",
  },
} satisfies ChartConfig

export function ShopOrdersChart({ data = [], isLoading = false }: ShopOrdersChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    totalImport: item.totalImport || item.cancelled + item.returned,
  }))

  if (isLoading) {
    return (
      <Card className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <div className="mb-5 space-y-2">
          <Skeleton className="h-6 w-52 bg-muted/70" />
          <Skeleton className="h-4 w-96 max-w-full bg-muted/70" />
        </div>
        <Skeleton className="h-[360px] w-full rounded-xl bg-muted/70" />
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">BIẾN ĐỘNG ĐƠN THEO SHOP</p>
          <h3 className="text-xl font-semibold text-foreground">Đơn xuất, đơn hủy và đơn hoàn</h3>
          <p className="text-sm text-muted-foreground">Theo khoảng ngày đang chọn. Đơn về được tính bằng đơn hoàn + đơn hủy.</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Số shop: </span>
          <span className="font-semibold text-foreground">{chartData.length.toLocaleString("vi-VN")}</span>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-[360px] w-full">
        <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} barGap={10}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="shop"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
            interval={0}
            angle={chartData.length > 6 ? -18 : 0}
            textAnchor={chartData.length > 6 ? "end" : "middle"}
            height={chartData.length > 6 ? 72 : 42}
          />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
            content={
              <ChartTooltipContent
                formatter={(_, __, item) => {
                  const payload = item.payload as ShopOrdersChartRow
                  return (
                    <div className="space-y-2">
                      <div className="font-medium text-foreground">{payload.shop}</div>
                      <div className="grid gap-1 text-xs">
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-muted-foreground">Đơn xuất</span>
                          <span className="font-medium text-foreground">{payload.totalExport.toLocaleString("vi-VN")}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-muted-foreground">Đơn hủy</span>
                          <span className="font-medium text-foreground">{payload.cancelled.toLocaleString("vi-VN")}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <span className="text-muted-foreground">Đơn hoàn</span>
                          <span className="font-medium text-foreground">{payload.returned.toLocaleString("vi-VN")}</span>
                        </div>
                        <div className="flex items-center justify-between gap-6 border-t border-slate-200 pt-1">
                          <span className="text-muted-foreground">Đơn về</span>
                          <span className="font-medium text-foreground">{(payload.cancelled + payload.returned).toLocaleString("vi-VN")}</span>
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent verticalAlign="top" />} />
          <Bar dataKey="totalExport" fill="var(--color-totalExport)" radius={[8, 8, 0, 0]} maxBarSize={34} />
          <Bar dataKey="cancelled" fill="var(--color-cancelled)" radius={[8, 8, 0, 0]} maxBarSize={34} />
          <Bar dataKey="returned" fill="var(--color-returned)" radius={[8, 8, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ChartContainer>
    </Card>
  )
}
