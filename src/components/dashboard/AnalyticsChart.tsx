"use client"

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card } from "@/components/ui/card"

interface AnalyticsChartProps {
  data: Array<{
    month: string
    exportOrders: number
    importOrders: number
  }>
}

export function AnalyticsChart({ data }: AnalyticsChartProps) {
  return (
    <Card className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="mb-6 space-y-1">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Biểu đồ hiệu suất</p>
        <h3 className="text-xl font-semibold text-foreground">Đơn xuất và đơn về trong 6 tháng</h3>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="4 4" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: "rgba(16, 185, 129, 0.06)" }}
              contentStyle={{
                borderRadius: 16,
                border: "1px solid #d1fae5",
                boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
              }}
            />
            <Bar dataKey="exportOrders" name="Đơn xuất" fill="#10b981" radius={[10, 10, 0, 0]} maxBarSize={42} />
            <Line
              type="monotone"
              dataKey="importOrders"
              name="Đơn về"
              stroke="#0f172a"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#0f172a" }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
