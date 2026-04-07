"use client"

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"

interface CarrierChartData {
  carrier: string
  count: number
}

interface CarrierChartProps {
  data?: CarrierChartData[]
  isLoading?: boolean
}

const cardClassName = "rounded-xl border border-border bg-card p-6 shadow-sm"
const skeletonClassName = "bg-muted/70"

const carrierColors: Record<string, string> = {
  SPX: "#2563eb",
  GHN: "#3b82f6",
  "J&T": "#60a5fa",
  BEST: "#93c5fd",
  VTP: "#bfdbfe",
  NJV: "#1d4ed8",
  GHTK: "#1e40af",
  "DV Khac": "#94a3b8",
}

const orderLabels = ["SPX", "GHN", "J&T", "BEST", "VTP", "NJV", "GHTK", "DV Khac"]

export function CarrierChart({ data = [], isLoading }: CarrierChartProps) {
  const chartData = useMemo(() => {
    const normalizedRows = data.map((item) => ({
      ...item,
      carrier: item.carrier.toLowerCase().includes("dv kh") ? "DV Khac" : item.carrier,
    }))

    const rows = normalizedRows
      .filter((item) => orderLabels.includes(item.carrier))
      .sort((a, b) => orderLabels.indexOf(a.carrier) - orderLabels.indexOf(b.carrier))

    const others = normalizedRows.filter((item) => !orderLabels.includes(item.carrier)).sort((a, b) => b.count - a.count)
    return [...rows, ...others]
  }, [data])

  const total = chartData.reduce((sum, item) => sum + item.count, 0)

  if (isLoading) {
    return (
      <Card className={cardClassName}>
        <div className="mb-5 space-y-2">
          <Skeleton className={`h-6 w-44 ${skeletonClassName}`} />
          <Skeleton className={`h-4 w-28 ${skeletonClassName}`} />
        </div>
        <Skeleton className={`h-[350px] w-full rounded-xl ${skeletonClassName}`} />
      </Card>
    )
  }

  return (
    <Card className={cardClassName}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <h3 className="text-xl font-semibold leading-8 text-foreground">Đơn Vị Vận Chuyển</h3>
          <p className="text-sm leading-6 text-muted-foreground">Tổng số đơn theo từng đơn vị giao nhận.</p>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="text-muted-foreground">Tổng: </span>
          <span className="font-semibold text-foreground">{total.toLocaleString("vi-VN")}</span>
        </div>
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.24)" />
            <XAxis
              dataKey="carrier"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 12 }}
              interval={0}
              height={40}
              className="text-muted-foreground"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 12 }}
              domain={[0, "auto"]}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid rgba(226,232,240,0.9)",
                borderRadius: "0.75rem",
                boxShadow: "0 1px 3px rgba(15,23,42,0.1)",
              }}
              formatter={(value: number) => [`${value.toLocaleString("vi-VN")} đơn`, "Số lượng"]}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={45}>
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
