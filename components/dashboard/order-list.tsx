"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { X, Download } from "lucide-react"
import type { MetricType } from "./order-stats-cards"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

interface OrderItem {
  date: string
  trackingCode: string
}

interface OrderListProps {
  metric: MetricType
  orders: OrderItem[]
  isLoading?: boolean
  onClose: () => void
}

const metricLabels: Record<MetricType, string> = {
  totalExport: "Tổng Đơn Xuất",
  totalImport: "Tổng Đơn Về",
  cancelled: "Đơn Hủy",
  returned: "Trả Hàng Hoàn Tiền",
}

export function OrderList({ metric, orders, isLoading, onClose }: OrderListProps) {
  const handleExport = () => {
    if (orders.length === 0) return

    const csvContent = ["STT,Mã Vận Đơn,Ngày", ...orders.map((order, index) => `${index + 1},${order.trackingCode},${order.date}`)].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${metric}_orders.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="animate-slide-in-up rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold leading-7 text-foreground">{metricLabels[metric]}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{orders.length.toLocaleString("vi-VN")} đơn hàng</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={orders.length === 0}>
            <Download className="mr-1 h-4 w-4" />
            Xuất CSV
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full bg-muted/70" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">Không có đơn hàng nào trong khoảng thời gian này</div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Mã Vận Đơn</TableHead>
                <TableHead>Ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order, index) => (
                <TableRow key={order.trackingCode + index}>
                  <TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-mono font-medium text-foreground">{order.trackingCode}</TableCell>
                  <TableCell>{order.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}
