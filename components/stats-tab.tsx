"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ProductionStatsResponse = {
  ordersByPlatform: Array<{
    platform: string
    orderCount: number
  }>
  topProducts: Array<{
    productName: string
    totalQuantity: number
  }>
}

export function StatsTab() {
  const [data, setData] = useState<ProductionStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchStats() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch("/api/production-stats", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("Không thể tải thống kê SQLite")
        }

        const result = (await response.json()) as ProductionStatsResponse
        if (mounted) {
          setData(result)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchStats()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold leading-7 text-foreground">Đơn Hàng Theo Sàn</h3>
          <p className="text-sm leading-6 text-muted-foreground">Đọc từ SQLite `database.db`</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full bg-muted/70" />
            <Skeleton className="h-10 w-full bg-muted/70" />
            <Skeleton className="h-10 w-full bg-muted/70" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Số đơn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.ordersByPlatform ?? []).map((row) => (
                <TableRow key={row.platform}>
                  <TableCell>{row.platform}</TableCell>
                  <TableCell className="text-right">{row.orderCount.toLocaleString("vi-VN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold leading-7 text-foreground">Top 20 SẢN PHẨM BÁN CHẠY</h3>
          <p className="text-sm leading-6 text-muted-foreground">Tổng số lượng theo tên sản phẩm gốc</p>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full bg-muted/70" />
            <Skeleton className="h-10 w-full bg-muted/70" />
            <Skeleton className="h-10 w-full bg-muted/70" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sản phẩm</TableHead>
                <TableHead className="text-right">Số lượng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.topProducts ?? []).map((row) => (
                <TableRow key={row.productName}>
                  <TableCell className="font-mono">{row.productName}</TableCell>
                  <TableCell className="text-right">{row.totalQuantity.toLocaleString("vi-VN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
