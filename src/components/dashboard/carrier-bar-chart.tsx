"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface CarrierChartData {
  carrier: string
  count: number
}

interface CarrierChartProps {
  data?: CarrierChartData[]
  isLoading?: boolean
  title?: string
  description?: string
  totalLabel?: string
}

const cardClassName = "rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm"
const skeletonClassName = "bg-muted/70"

const carrierColors: Record<string, string> = {
  SPX: "#10b981",
  GHN: "#0ea5e9",
  "J&T": "#f97316",
  BEST: "#f59e0b",
  VTP: "#8b5cf6",
  NJV: "#ec4899",
  GHTK: "#2563eb",
  "DV Khac": "#94a3b8",
}

const preferredOrder = ["SPX", "GHN", "J&T", "BEST", "VTP", "NJV", "GHTK", "DV Khac"]

export function CarrierChart({
  data = [],
  isLoading = false,
  title = "Đơn vị vận chuyển",
  description = "Tổng số đơn theo từng đơn vị giao nhận trong khoảng ngày đã chọn.",
  totalLabel = "Tổng đơn",
}: CarrierChartProps) {
  const chartData = useMemo(() => {
    const normalizedRows = data.map((item) => ({
      ...item,
      carrier: item.carrier.toLowerCase().includes("dv kh") ? "DV Khac" : item.carrier,
    }))

    return normalizedRows.sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left.carrier)
      const rightIndex = preferredOrder.indexOf(right.carrier)

      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      }

      return right.count - left.count || left.carrier.localeCompare(right.carrier)
    })
  }, [data])

  const total = chartData.reduce((sum, item) => sum + item.count, 0)

  if (isLoading) {
    return (
      <Card className={cardClassName}>
        <div className="mb-5 space-y-2">
          <Skeleton className={`h-6 w-52 ${skeletonClassName}`} />
          <Skeleton className={`h-4 w-80 max-w-full ${skeletonClassName}`} />
        </div>
        <Skeleton className={`h-[320px] w-full rounded-xl ${skeletonClassName}`} />
      </Card>
    )
  }

  return (
    <Card className={cardClassName}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">
            BIỂU ĐỒ ĐƠN HÀNG THEO ĐƠN VỊ VẬN CHUYỂN
          </p>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{totalLabel}: </span>
          <span className="font-semibold text-foreground">{total.toLocaleString("vi-VN")}</span>
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="4 4" />
            <XAxis
              dataKey="carrier"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              interval={0}
            />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
              contentStyle={{
                borderRadius: 16,
                border: "1px solid #d1fae5",
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              }}
              formatter={(value: number) => [`${value.toLocaleString("vi-VN")} đơn`, "Số lượng"]}
            />
            <Bar dataKey="count" radius={[10, 10, 0, 0]} maxBarSize={42}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={carrierColors[entry.carrier] ?? carrierColors["DV Khac"]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chartData.map((item) => (
          <div key={item.carrier} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: carrierColors[item.carrier] ?? carrierColors["DV Khac"] }}
            />
            <span className="truncate">
              {item.carrier}: {item.count.toLocaleString("vi-VN")}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
