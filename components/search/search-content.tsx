"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Search, Package, PackageCheck, XCircle, RotateCcw, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface SearchResult {
  trackingCode: string
  status: "exported" | "imported" | "cancelled" | "returned" | "not_found"
  exportDate: string | null
  importDate: string | null
  statusLabel: string
}

const statusConfig = {
  exported: {
    icon: Package,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    label: "Đã Xuất - Chưa Về Kho",
  },
  imported: {
    icon: PackageCheck,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    label: "Đã Về Kho",
  },
  cancelled: {
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    label: "Đơn Hủy",
  },
  returned: {
    icon: RotateCcw,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    label: "Trả Hàng Hoàn Tiền",
  },
  not_found: {
    icon: AlertCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Không Tìm Thấy",
  },
}

export function SearchContent() {
  const [input, setInput] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async () => {
    const codes = input
      .split(/[\n,;]+/)
      .map((code) => code.trim())
      .filter((code) => code.length > 0)

    if (codes.length === 0) return

    setIsLoading(true)
    setHasSearched(true)

    try {
      const response = await fetch("/api/orders/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCodes: codes }),
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data.results)
      }
    } catch (error) {
      console.error("[v0] Search error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSearch()
    }
  }

  // Thống kê kết quả
  const stats = {
    total: results.length,
    exported: results.filter((r) => r.status === "exported").length,
    cancelled: results.filter((r) => r.status === "cancelled").length,
    returned: results.filter((r) => r.status === "returned").length,
    notFound: results.filter((r) => r.status === "not_found").length,
  }

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Nhập mã vận đơn</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Nhập hoặc dán nhiều mã vận đơn, mỗi mã trên một dòng hoặc phân cách bằng dấu phẩy.
        </p>
        <Textarea
          placeholder="VD:&#10;MVD001&#10;MVD002&#10;MVD003"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={8}
          className="font-mono text-sm mb-4"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Nhấn Ctrl + Enter để tra cứu nhanh
          </p>
          <Button onClick={handleSearch} disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Tra cứu
          </Button>
        </div>
      </Card>

      {/* Results Section */}
      {hasSearched && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Kết quả tra cứu</h2>
            {results.length > 0 && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Tổng: <strong>{stats.total}</strong></span>
                <span className="text-blue-600">Chưa về: <strong>{stats.exported}</strong></span>
                <span className="text-red-600">Hủy: <strong>{stats.cancelled}</strong></span>
                <span className="text-orange-600">Hoàn: <strong>{stats.returned}</strong></span>
                <span className="text-muted-foreground">Không thấy: <strong>{stats.notFound}</strong></span>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Không tìm thấy kết quả nào
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Mã Vận Đơn</TableHead>
                    <TableHead>Trạng Thái</TableHead>
                    <TableHead>Ngày Xuất</TableHead>
                    <TableHead>Ngày Về</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, index) => {
                    const config = statusConfig[result.status]
                    const Icon = config.icon
                    
                    return (
                      <TableRow key={result.trackingCode + index}>
                        <TableCell className="font-mono text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {result.trackingCode}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-6 h-6 rounded flex items-center justify-center",
                              config.bgColor
                            )}>
                              <Icon className={cn("w-3.5 h-3.5", config.color)} />
                            </div>
                            <span className={cn("text-sm font-medium", config.color)}>
                              {result.statusLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {result.exportDate || "-"}
                        </TableCell>
                        <TableCell>
                          {result.importDate || "-"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
