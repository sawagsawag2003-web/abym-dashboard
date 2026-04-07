"use client"

import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Package, Truck, RotateCcw, XCircle, ArrowUpRight } from "lucide-react"
import { useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts"

const stats = [
  { title: "Tổng Đơn Xuất", value: "2,847", change: "+12%", trend: "up", icon: Package },
  { title: "Đơn Đã Giao", value: "2,456", change: "+8%", trend: "up", icon: Truck },
  { title: "Tỷ Lệ Trả Hàng", value: "3.2%", change: "-0.5%", trend: "up", icon: RotateCcw },
  { title: "Tỷ Lệ Hủy", value: "1.8%", change: "+0.2%", trend: "down", icon: XCircle },
]

const monthlyData = [
  { month: "T1", xuat: 450, nhap: 380, tra: 15, huy: 8 },
  { month: "T2", xuat: 520, nhap: 410, tra: 18, huy: 12 },
  { month: "T3", xuat: 480, nhap: 390, tra: 14, huy: 9 },
  { month: "T4", xuat: 610, nhap: 520, tra: 22, huy: 15 },
  { month: "T5", xuat: 550, nhap: 480, tra: 19, huy: 11 },
  { month: "T6", xuat: 670, nhap: 560, tra: 25, huy: 14 },
]

const orderStatusData = [
  { name: "Đang xử lý", count: 156, color: "bg-blue-500" },
  { name: "Đang vận chuyển", count: 234, color: "bg-amber-500" },
  { name: "Đã giao", count: 1892, color: "bg-emerald-500" },
  { name: "Trả hàng", count: 45, color: "bg-orange-500" },
  { name: "Đã hủy", count: 28, color: "bg-red-500" },
]

export function AnalyticsContent() {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-foreground text-background px-3 py-2 rounded-lg text-xs shadow-lg">
          <p className="font-bold mb-1">Tháng {label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat, index) => (
          <Card
            key={stat.title}
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
            style={{ animationDelay: `${index * 100}ms` }}
            className={`bg-card text-foreground p-4 transition-all duration-500 ease-out animate-slide-in-up cursor-pointer ${
              hoveredCard === index ? "scale-105 shadow-2xl" : "shadow-lg"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-full">
                  <stat.icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-xs font-medium opacity-90">{stat.title}</h3>
              </div>
              <div
                className={`w-6 h-6 rounded-full bg-primary flex items-center justify-center transition-transform duration-300 ${
                  hoveredCard === index ? "rotate-45" : ""
                }`}
              >
                <ArrowUpRight className="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
            <p className="text-3xl font-bold mb-2">{stat.value}</p>
            <div className="flex items-center gap-1.5 text-xs opacity-80">
              {stat.trend === "up" ? (
                <TrendingUp className="w-3 h-3 text-emerald-600" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-600" />
              )}
              <span className={stat.trend === "up" ? "text-emerald-600" : "text-red-600"}>{stat.change}</span>
              <span className="text-muted-foreground">so với tháng trước</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-6">Xu hướng Đơn hàng theo Tháng</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 12 }} domain={[0, "auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="xuat" name="Don xuat" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb" }} />
                <Line type="monotone" dataKey="nhap" name="Don nhap" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-6">Trang thai Don hang</h3>
          <div className="space-y-4">
            {orderStatusData.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:shadow-md transition-all duration-300 animate-slide-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="font-medium">{item.name}</span>
                </div>
                <span className="text-2xl font-bold text-foreground">{item.count.toLocaleString("vi-VN")}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-lg mb-6">So sanh Don Tra hang & Don Huy</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "currentColor", fontSize: 12 }} domain={[0, "auto"]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="tra" name="Tra hang" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="huy" name="Don huy" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
