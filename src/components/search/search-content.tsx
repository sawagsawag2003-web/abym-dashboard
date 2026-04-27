"use client"

import { useMemo, useState } from "react"
import { isValid, parse } from "date-fns"
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowUpZA,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Store,
  Truck,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface SearchResult {
  trackingCode: string
  status: "exported" | "imported" | "cancelled" | "returned" | "not_found"
  exportDate: string | null
  importDate: string | null
  statusLabel: string
  orderDetails: {
    platform: string | null
    shopName: string | null
    carrier: string | null
    createdAt: string | null
    shipDate: string | null
    items: Array<{
      name: string
      sku: string | null
      quantity: number
    }>
    timeline: Array<{
      label: string
      time: string | null
      completed: boolean
    }>
  } | null
}

const statusConfig = {
  exported: {
    icon: Package,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  imported: {
    icon: PackageCheck,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  cancelled: {
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
  },
  returned: {
    icon: RotateCcw,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  not_found: {
    icon: AlertCircle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
}

type SortColumn = "status" | "exportDate" | "importDate"
type SortDirection = "asc" | "desc"

function parseTrackingCodes(rawInput: string) {
  return rawInput
    .split(/[\n,;]+/)
    .map((code) => code.trim())
    .filter((code) => code.length > 0)
}

function parseSortableDate(dateStr: string | null): number | null {
  if (!dateStr) return null

  const formats = ["yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy", "yyyy-MM-dd HH:mm:ss"]
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date())
    if (isValid(parsed)) {
      return parsed.getTime()
    }
  }

  const nativeParsed = new Date(dateStr)
  return Number.isNaN(nativeParsed.getTime()) ? null : nativeParsed.getTime()
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string
  active: boolean
  direction?: SortDirection
  onClick: () => void
}) {
  const Icon = active && direction === "desc" ? ArrowUpZA : ArrowDownAZ

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-medium transition hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function compactItemLabel(item: { sku: string | null; name: string; quantity: number }) {
  return `${item.sku || item.name} • SL: ${item.quantity}`
}

export function SearchContent() {
  const [input, setInput] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [expandedTrackingCode, setExpandedTrackingCode] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: "exportDate",
    direction: "asc",
  })

  const parsedCodes = parseTrackingCodes(input)

  const handleSearch = async () => {
    if (parsedCodes.length === 0) return

    setIsLoading(true)
    setHasSearched(true)

    try {
      const response = await fetch("/api/orders/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCodes: parsedCodes }),
      })

      if (response.ok) {
        const data = await response.json()
        setResults(data.results)
        setExpandedTrackingCode(null)
      }
    } catch (error) {
      console.error("[search] Search error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSearch()
    }
  }

  const handleSort = (column: SortColumn) => {
    setSortConfig((current) => ({
      column,
      direction: current.column === column && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  const stats = {
    total: results.length,
    exported: results.filter((r) => r.status === "exported").length,
    cancelled: results.filter((r) => r.status === "cancelled").length,
    returned: results.filter((r) => r.status === "returned").length,
    notFound: results.filter((r) => r.status === "not_found").length,
  }

  const sortedResults = useMemo(() => {
    const sorted = [...results]

    sorted.sort((left, right) => {
      if (sortConfig.column === "status") {
        const comparison = left.statusLabel.localeCompare(right.statusLabel, "vi")
        return sortConfig.direction === "asc" ? comparison : -comparison
      }

      const leftDate = parseSortableDate(left[sortConfig.column])
      const rightDate = parseSortableDate(right[sortConfig.column])

      if (leftDate === null && rightDate === null) {
        return left.trackingCode.localeCompare(right.trackingCode)
      }
      if (leftDate === null) return 1
      if (rightDate === null) return -1
      if (leftDate === rightDate) {
        return left.trackingCode.localeCompare(right.trackingCode)
      }

      return sortConfig.direction === "asc" ? leftDate - rightDate : rightDate - leftDate
    })

    return sorted
  }, [results, sortConfig])

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] xl:items-start">
      <div className="xl:sticky xl:top-6">
        <Card className="overflow-hidden border-emerald-100 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(255,255,255,0.96))] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Search Workspace</p>
                <h2 className="text-2xl font-semibold text-foreground">Nhập mã vận đơn</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Dán nhiều mã, mỗi mã trên một dòng hoặc ngăn cách bằng dấu phẩy, chấm phẩy.
                </p>
              </div>
              <div className="flex min-w-[148px] items-center justify-between gap-3 rounded-2xl bg-white/90 px-3 py-2 shadow-sm">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Mã hợp lệ</p>
                <p className="text-xl font-semibold text-foreground">{parsedCodes.length}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <Textarea
              placeholder="VD:&#10;MVD001&#10;MVD002&#10;MVD003"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={12}
              className="min-h-[280px] border-slate-200 bg-slate-50 font-mono text-sm shadow-none"
            />

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Ctrl + Enter để tra cứu nhanh</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Hỗ trợ nhiều mã cùng lúc</span>
            </div>

            <Button
              onClick={handleSearch}
              disabled={isLoading || parsedCodes.length === 0}
              className="h-11 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Tra cứu {parsedCodes.length > 0 ? `${parsedCodes.length} mã` : ""}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="min-h-[420px] border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Results</p>
            <h2 className="text-2xl font-semibold text-foreground">Kết quả tra cứu</h2>
            <p className="text-sm text-muted-foreground">
              {hasSearched
                ? `Hiển thị ${results.length.toLocaleString("vi-VN")} kết quả theo danh sách mã bạn nhập.`
                : "Kết quả sẽ hiển thị ở đây sau khi bạn gửi danh sách mã."}
            </p>
          </div>

          {hasSearched && results.length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                Tổng <strong>{stats.total}</strong>
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">
                Chưa về <strong>{stats.exported}</strong>
              </span>
              <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">
                Hủy <strong>{stats.cancelled}</strong>
              </span>
              <span className="rounded-full bg-orange-50 px-3 py-1.5 text-orange-700">
                Hoàn <strong>{stats.returned}</strong>
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                Không thấy <strong>{stats.notFound}</strong>
              </span>
            </div>
          )}
        </div>

        {!hasSearched ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-base font-medium text-foreground">Chưa có lần tra cứu nào</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Nhập danh sách mã ở khung bên trái để xem trạng thái xuất, về kho, hủy hoặc hoàn hàng.
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center text-center">
            <div>
              <p className="text-base font-medium text-foreground">Không tìm thấy kết quả nào</p>
              <p className="mt-2 text-sm text-muted-foreground">Kiểm tra lại mã vận đơn hoặc thử với danh sách khác.</p>
            </div>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Mã vận đơn</TableHead>
                  <TableHead>
                    <SortButton
                      label="Trạng thái"
                      active={sortConfig.column === "status"}
                      direction={sortConfig.column === "status" ? sortConfig.direction : undefined}
                      onClick={() => handleSort("status")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label="Ngày xuất"
                      active={sortConfig.column === "exportDate"}
                      direction={sortConfig.column === "exportDate" ? sortConfig.direction : undefined}
                      onClick={() => handleSort("exportDate")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label="Ngày về"
                      active={sortConfig.column === "importDate"}
                      direction={sortConfig.column === "importDate" ? sortConfig.direction : undefined}
                      onClick={() => handleSort("importDate")}
                    />
                  </TableHead>
                  <TableHead className="w-16 text-right">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedResults.flatMap((result, index) => {
                  const config = statusConfig[result.status]
                  const Icon = config.icon
                  const isExpanded = expandedTrackingCode === result.trackingCode
                  const timeline = (result.orderDetails?.timeline || []).filter((step) => step.label !== "Đã in đơn")

                  const rows = [
                    <TableRow
                      key={result.trackingCode + index}
                      className={cn("cursor-pointer transition", isExpanded && "bg-emerald-50/60")}
                      onClick={() =>
                        setExpandedTrackingCode((current) => (current === result.trackingCode ? null : result.trackingCode))
                      }
                    >
                      <TableCell className="font-mono text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-mono font-medium">{result.trackingCode}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn("flex h-6 w-6 items-center justify-center rounded", config.bgColor)}>
                            <Icon className={cn("h-3.5 w-3.5", config.color)} />
                          </div>
                          <span className={cn("text-sm font-medium", config.color)}>{result.statusLabel}</span>
                        </div>
                      </TableCell>
                      <TableCell>{result.exportDate || "-"}</TableCell>
                      <TableCell>{result.importDate || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-500">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>,
                  ]

                  if (isExpanded) {
                    rows.push(
                      <TableRow key={`${result.trackingCode}-detail`} className="bg-slate-50/70 hover:bg-slate-50/70">
                        <TableCell colSpan={6} className="p-0">
                          <div className="grid gap-5 border-t border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.55),rgba(255,255,255,1))] p-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                            <div className="space-y-5">
                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <div className="flex items-center gap-2 text-slate-500">
                                    <Store className="h-4 w-4" />
                                    <p className="text-xs uppercase tracking-[0.14em]">Shop</p>
                                  </div>
                                  <p className="mt-2 text-sm font-medium text-foreground">
                                    {result.orderDetails?.shopName || "Chưa có dữ liệu"}
                                  </p>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <div className="flex items-center gap-2 text-slate-500">
                                    <Truck className="h-4 w-4" />
                                    <p className="text-xs uppercase tracking-[0.14em]">Vận chuyển</p>
                                  </div>
                                  <p className="mt-2 text-sm font-medium text-foreground">
                                    {result.orderDetails?.carrier || "Chưa có dữ liệu"}
                                  </p>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                  <div className="flex items-center gap-2 text-slate-500">
                                    <Package className="h-4 w-4" />
                                    <p className="text-xs uppercase tracking-[0.14em]">Sản phẩm</p>
                                  </div>
                                  <p className="mt-2 text-sm font-medium text-foreground">
                                    {result.orderDetails?.items.length ? `${result.orderDetails.items.length} sản phẩm` : "Chưa có dữ liệu"}
                                  </p>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                <p className="text-sm font-semibold text-foreground">Hành trình đơn hàng</p>
                                <div className="mt-5 grid gap-4 md:grid-cols-3">
                                  {timeline.map((step) => (
                                    <div key={step.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className={cn(
                                            "flex h-8 w-8 items-center justify-center rounded-full border",
                                            step.completed
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-slate-200 bg-slate-100 text-slate-400"
                                          )}
                                        >
                                          {step.completed ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                        </div>
                                        <p className="text-sm font-medium text-foreground">{step.label}</p>
                                      </div>
                                      <p className="mt-3 text-sm text-muted-foreground">{step.time || "Chưa ghi nhận"}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-foreground">Thông tin nhanh</p>
                                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                    {result.orderDetails?.platform || "Chưa rõ sàn"}
                                  </Badge>
                                </div>
                                <div className="mt-4 space-y-3 text-sm">
                                  <div>
                                    <p className="text-muted-foreground">Ngày xuất</p>
                                    <p className="mt-1 font-medium text-foreground">
                                      {result.exportDate || result.orderDetails?.shipDate || "Chưa có dữ liệu"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Ngày về kho</p>
                                    <p className="mt-1 font-medium text-foreground">{result.importDate || "Chưa ghi nhận"}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                <p className="text-sm font-semibold text-foreground">Sản phẩm liên quan</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {result.orderDetails?.items.length ? (
                                    result.orderDetails.items.map((item, itemIndex) => (
                                      <span
                                        key={`${result.trackingCode}-item-${itemIndex}`}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                                      >
                                        {compactItemLabel(item)}
                                      </span>
                                    ))
                                  ) : (
                                    <p className="text-sm text-muted-foreground">Chưa có dữ liệu sản phẩm trong database.</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  }

                  return rows
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
