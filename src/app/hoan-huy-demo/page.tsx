"use client"

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ArrowRight, ArrowUpDown, Eye, Layers3, RefreshCcw, Search, Siren } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Platform = "tiktok" | "shopee"
type OrderType = "don_hoan" | "don_huy"
type WarehouseStatus = "da_ve_kho" | "chua_ve_kho" | "ma_van_don_loi"
type Priority = "cao" | "trung_binh" | "thap"
type ProcessingStatus =
  | "moi"
  | "dang_xac_minh"
  | "da_khieu_nai"
  | "cho_phan_hoi"
  | "da_hoan_tien"
  | "dong_case"
  | "bo_qua"
type QueueView = "can_xu_ly" | "dang_theo_doi" | "da_xong" | "tat_ca"

type HoanHuyCase = {
  id: string
  san: Platform
  shop: string
  loaiDon: OrderType
  sourceStatus: string
  ngaySanDisplay: string
  ageDays: number
  mucDoUuTien: Priority
  warehouseStatus: WarehouseStatus
  maVanDonDi: string
  maVanDonVe: string
  maVanDonKhop: string
  processingStatus: ProcessingStatus
  queueView: Exclude<QueueView, "tat_ca">
  soTien: number | null
  soTienDisplay: string
  sanPham: string
  note: string
  complaintDate: string
}

type ApiResponse = {
  records: HoanHuyCase[]
  summary: {
    total: number
    daVeKho: number
    chuaVeKho: number
    maVanDonLoi: number
    uuTienCao: number
    tiktok: number
    shopee: number
    canXuLy: number
    dangTheoDoi: number
    daXong: number
  }
  options: { shops: string[] }
}

const emptySummary: ApiResponse["summary"] = {
  total: 0,
  daVeKho: 0,
  chuaVeKho: 0,
  maVanDonLoi: 0,
  uuTienCao: 0,
  tiktok: 0,
  shopee: 0,
  canXuLy: 0,
  dangTheoDoi: 0,
  daXong: 0,
}

function processingStatusLabel(value: ProcessingStatus) {
  if (value === "moi") return "Mới"
  if (value === "dang_xac_minh") return "Xác minh"
  if (value === "da_khieu_nai") return "Đã khiếu nại"
  if (value === "cho_phan_hoi") return "Chờ phản hồi"
  if (value === "da_hoan_tien") return "Hoàn tiền"
  if (value === "dong_case") return "Đóng case"
  return "Bỏ qua"
}

function warehouseStatusLabel(value: WarehouseStatus) {
  if (value === "da_ve_kho") return "Đã về kho"
  if (value === "chua_ve_kho") return "Chưa về kho"
  return "Mã lỗi"
}

function queueLabel(value: Exclude<QueueView, "tat_ca">) {
  if (value === "can_xu_ly") return "Cần xử lý"
  if (value === "dang_theo_doi") return "Đang theo dõi"
  return "Đã xong"
}

function priorityLabel(value: Priority) {
  if (value === "cao") return "Cao"
  if (value === "trung_binh") return "Trung bình"
  return "Thấp"
}

function priorityColor(value: Priority) {
  if (value === "cao") return "bg-rose-500"
  if (value === "trung_binh") return "bg-amber-500"
  return "bg-emerald-500"
}

function processBadgeClass(value: ProcessingStatus) {
  if (value === "moi") return "border-slate-300 bg-slate-100 text-slate-800"
  if (value === "dang_xac_minh") return "border-cyan-300 bg-cyan-100 text-cyan-800"
  if (value === "da_khieu_nai") return "border-sky-300 bg-sky-100 text-sky-800"
  if (value === "cho_phan_hoi") return "border-violet-300 bg-violet-100 text-violet-800"
  if (value === "da_hoan_tien") return "border-emerald-300 bg-emerald-100 text-emerald-800"
  if (value === "dong_case") return "border-slate-300 bg-slate-200 text-slate-800"
  return "border-zinc-300 bg-zinc-200 text-zinc-800"
}

function priorityBadgeClass(value: Priority) {
  if (value === "cao") return "border-rose-200 bg-rose-50 text-rose-700"
  if (value === "trung_binh") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

function actionButtonsForQueue(queue: Exclude<QueueView, "tat_ca">) {
  if (queue === "can_xu_ly") return ["dang_xac_minh", "da_khieu_nai"] as ProcessingStatus[]
  if (queue === "dang_theo_doi") return ["cho_phan_hoi", "da_hoan_tien", "dong_case"] as ProcessingStatus[]
  return ["moi"] as ProcessingStatus[]
}

function actionLabel(status: ProcessingStatus) {
  if (status === "dang_xac_minh") return "Xác minh"
  if (status === "da_khieu_nai") return "Khiếu nại"
  if (status === "cho_phan_hoi") return "Chờ phản hồi"
  if (status === "da_hoan_tien") return "Hoàn tiền"
  if (status === "dong_case") return "Đóng case"
  return "Mở lại"
}

function queueFromStatus(status: ProcessingStatus): Exclude<QueueView, "tat_ca"> {
  if (status === "moi" || status === "dang_xac_minh") return "can_xu_ly"
  if (status === "da_khieu_nai" || status === "cho_phan_hoi") return "dang_theo_doi"
  return "da_xong"
}

function priorityDateClass(value: Priority) {
  if (value === "cao") return "text-rose-700"
  if (value === "trung_binh") return "text-amber-700"
  return "text-emerald-700"
}

export default function HoanHuyDemoPage() {
  const [records, setRecords] = useState<HoanHuyCase[]>([])
  const [summary, setSummary] = useState(emptySummary)
  const [shops, setShops] = useState<string[]>([])
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [focusQueue, setFocusQueue] = useState<QueueView>("can_xu_ly")
  const [platform, setPlatform] = useState("all")
  const [warehouseStatus, setWarehouseStatus] = useState("all")
  const [shop, setShop] = useState("all")
  const [quickFilter, setQuickFilter] = useState<"all" | "ma_van_don_loi" | Priority>("all")
  const [sortKey, setSortKey] = useState<"shop" | "warehouseStatus" | "processingStatus" | "priority" | "tracking" | "date">("date")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const params = useMemo(() => {
    const nextParams = new URLSearchParams({ queueView: "tat_ca", platform, warehouseStatus, shop })
    if (deferredSearch.trim()) nextParams.set("search", deferredSearch.trim())
    return nextParams.toString()
  }, [deferredSearch, platform, shop, warehouseStatus])

  async function refreshData() {
    setRefreshing(true)
    try {
      const response = await fetch(`/api/hoan-huy/reconciliation?${params}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Không thể làm mới dữ liệu")
      const result = (await response.json()) as ApiResponse
      setRecords(result.records)
      setSummary(result.summary)
      setShops(result.options.shops)
      setDraftNotes(Object.fromEntries(result.records.map((item) => [item.id, item.note || ""])))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setRefreshing(false)
    }
  }

  async function syncSheetData() {
    setIsSyncing(true)
    setError(null)

    try {
      const response = await fetch("/api/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "all" }),
      })

      if (!response.ok) throw new Error("Không thể cập nhật dữ liệu từ sheet")

      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      setError(null)
      setLoading((current) => current || !records.length)
      setRefreshing(records.length > 0)

      try {
        const response = await fetch(`/api/hoan-huy/reconciliation?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Không thể tải dữ liệu demo")

        const result = (await response.json()) as ApiResponse
        setRecords(result.records)
        setSummary(result.summary)
        setShops(result.options.shops)
        setDraftNotes(Object.fromEntries(result.records.map((item) => [item.id, item.note || ""])))
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    loadData()
    return () => controller.abort()
  }, [params])

  async function updateCaseStatus(item: HoanHuyCase, nextStatus: ProcessingStatus) {
    setPendingCaseId(item.id)
    setError(null)

    try {
      const response = await fetch("/api/hoan-huy/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: item.id,
          processingStatus: nextStatus,
          note: item.note,
          complaintDate:
            nextStatus === "da_khieu_nai" && !item.complaintDate
              ? new Date().toISOString().slice(0, 10)
              : item.complaintDate,
          refundAmount: item.soTien,
        }),
      })
      if (!response.ok) throw new Error("Không thể cập nhật trạng thái")

      startTransition(() => {
        setRecords((current) =>
          current.map((record) =>
            record.id === item.id
              ? {
                  ...record,
                  processingStatus: nextStatus,
                  queueView: queueFromStatus(nextStatus),
                  complaintDate:
                    nextStatus === "da_khieu_nai" && !record.complaintDate
                      ? new Date().toISOString().slice(0, 10)
                      : record.complaintDate,
                }
              : record
          )
        )
      })

      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setPendingCaseId(null)
    }
  }

  async function saveNote(item: HoanHuyCase) {
    setPendingCaseId(item.id)
    setError(null)

    try {
      const response = await fetch("/api/hoan-huy/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: item.id,
          note: draftNotes[item.id] ?? "",
        }),
      })
      if (!response.ok) throw new Error("Không thể lưu ghi chú")

      startTransition(() => {
        setRecords((current) =>
          current.map((record) =>
            record.id === item.id
              ? {
                  ...record,
                  note: draftNotes[item.id] ?? "",
                }
              : record
          )
        )
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setPendingCaseId(null)
    }
  }

  const filtered = useMemo(
    () => records.filter((item) => (focusQueue === "tat_ca" ? true : item.queueView === focusQueue)),
    [focusQueue, records]
  )

  const quickFilterCounts = useMemo(() => {
    const unresolved = filtered.filter((item) => item.warehouseStatus !== "da_ve_kho")
    return {
      all: unresolved.length,
      ma_van_don_loi: unresolved.filter((item) => item.warehouseStatus === "ma_van_don_loi").length,
      cao: unresolved.filter((item) => item.mucDoUuTien === "cao").length,
      trung_binh: unresolved.filter((item) => item.mucDoUuTien === "trung_binh").length,
      thap: unresolved.filter((item) => item.mucDoUuTien === "thap").length,
    }
  }, [filtered])

  const reconciliationRows = useMemo(() => {
    const unresolved = filtered.filter((item) => item.warehouseStatus !== "da_ve_kho")

    const scoped = unresolved.filter((item) => {
      if (quickFilter === "all") return true
      if (quickFilter === "ma_van_don_loi") return item.warehouseStatus === "ma_van_don_loi"
      return item.mucDoUuTien === quickFilter
    })

    const priorityRank = { cao: 3, trung_binh: 2, thap: 1 }
    const warehouseRank = { ma_van_don_loi: 2, chua_ve_kho: 1, da_ve_kho: 0 }
    const processingRank = {
      moi: 1,
      dang_xac_minh: 2,
      da_khieu_nai: 3,
      cho_phan_hoi: 4,
      da_hoan_tien: 5,
      dong_case: 6,
      bo_qua: 7,
    }

    const sorted = [...scoped].sort((left, right) => {
      let compare = 0

      if (sortKey === "shop") compare = left.shop.localeCompare(right.shop, "vi")
      if (sortKey === "warehouseStatus") compare = warehouseRank[left.warehouseStatus] - warehouseRank[right.warehouseStatus]
      if (sortKey === "processingStatus") compare = processingRank[left.processingStatus] - processingRank[right.processingStatus]
      if (sortKey === "priority") compare = priorityRank[left.mucDoUuTien] - priorityRank[right.mucDoUuTien]
      if (sortKey === "tracking") {
        compare = (left.maVanDonVe || left.maVanDonDi || "").localeCompare(right.maVanDonVe || right.maVanDonDi || "", "vi")
      }
      if (sortKey === "date") compare = left.ageDays - right.ageDays

      return sortDirection === "asc" ? compare : -compare
    })

    return sorted
  }, [filtered, quickFilter, sortDirection, sortKey])

  const queues = useMemo(
    () => [
      {
        key: "can_xu_ly" as const,
        title: "Cần xử lý",
        description: "Case mới và đang xác minh",
        count: summary.canXuLy,
        accent: "from-rose-500/20 via-orange-500/10 to-transparent",
        border: "border-rose-200/80",
        items: records.filter((item) => item.queueView === "can_xu_ly").slice(0, 4),
      },
      {
        key: "dang_theo_doi" as const,
        title: "Đang theo dõi",
        description: "Đã khiếu nại hoặc đang chờ phản hồi",
        count: summary.dangTheoDoi,
        accent: "from-sky-500/20 via-emerald-500/10 to-transparent",
        border: "border-sky-200/80",
        items: records.filter((item) => item.queueView === "dang_theo_doi").slice(0, 4),
      },
      {
        key: "da_xong" as const,
        title: "Đã xong",
        description: "Hoàn tiền, đóng case hoặc bỏ qua",
        count: summary.daXong,
        accent: "from-emerald-500/20 via-teal-500/10 to-transparent",
        border: "border-emerald-200/80",
        items: records.filter((item) => item.queueView === "da_xong").slice(0, 4),
      },
    ],
    [records, summary.canXuLy, summary.daXong, summary.dangTheoDoi]
  )

  const agingSegments = useMemo(() => {
    const total = Math.max(filtered.length, 1)
    const under3 = filtered.filter((item) => item.ageDays <= 3).length
    const from4to7 = filtered.filter((item) => item.ageDays >= 4 && item.ageDays <= 7).length
    const over7 = filtered.filter((item) => item.ageDays > 7).length

    return [
      { label: "0-3 ngày", value: under3, percent: Math.round((under3 / total) * 100), tone: "bg-emerald-500" },
      { label: "4-7 ngày", value: from4to7, percent: Math.round((from4to7 / total) * 100), tone: "bg-amber-500" },
      { label: ">7 ngày", value: over7, percent: Math.round((over7 / total) * 100), tone: "bg-rose-500" },
    ]
  }, [filtered])

  function handleSort(nextKey: "shop" | "warehouseStatus" | "processingStatus" | "priority" | "tracking" | "date") {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === "date" ? "desc" : "asc")
  }

  async function exportCurrentRows() {
    setIsExporting(true)
    setError(null)

    try {
      const rows = reconciliationRows.map((item) => ({
        shop: item.shop,
        san: item.san,
        loaiDon: item.loaiDon,
        warehouseStatusLabel: warehouseStatusLabel(item.warehouseStatus),
        processingStatusLabel: processingStatusLabel(item.processingStatus),
        priorityLabel: priorityLabel(item.mucDoUuTien),
        trackingCode: item.maVanDonVe || item.maVanDonDi || "",
        ngaySanDisplay: item.ngaySanDisplay || "",
        ageDays: item.ageDays,
        detailText: item.sanPham || item.sourceStatus || "",
        note: item.note || "",
      }))

      const response = await fetch("/api/hoan-huy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          filename: `don-hoan-huy-${new Date().toISOString().slice(0, 10)}.xlsx`,
        }),
      })

      if (!response.ok) throw new Error("Không thể xuất file Excel")

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `don-hoan-huy-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi xuất Excel")
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header
          title="Đối Soát Hoàn Hủy"
          description="Đối soát đơn hoàn, hủy giữa sàn và kho để theo dõi case chưa về kho, xử lý khiếu nại và hoàn tiền."
        />

        <div className="mt-4 space-y-6">
          <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_80px_-30px_rgba(15,23,42,0.35)] backdrop-blur xl:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,113,133,0.16),transparent_26%),radial-gradient(circle_at_85%_20%,rgba(16,185,129,0.16),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))]" />

            <div className="relative space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="outline" className="rounded-full bg-white/80 px-3 py-1 text-[11px] uppercase tracking-[0.2em]">
                  Ops Board
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {summary.total.toLocaleString("vi-VN")} case
                </Badge>
                {refreshing && (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    <RefreshCcw className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Đang làm mới
                  </Badge>
                )}
                <Button variant="outline" onClick={() => void syncSheetData()} disabled={isSyncing} className="rounded-full bg-white/85">
                  <RefreshCcw className={cn("mr-2 h-4 w-4", isSyncing ? "animate-spin" : "")} />
                  {isSyncing ? "Cập nhật dữ liệu..." : "Cập nhật dữ liệu"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Cần xử lý", value: summary.canXuLy, hint: "Case đang mở", icon: Siren, color: "text-rose-500" },
                  { label: "Quá 7 ngày", value: summary.uuTienCao, hint: "Cần ưu tiên", icon: AlertTriangle, color: "text-amber-500" },
                  { label: "Đang theo dõi", value: summary.dangTheoDoi, hint: "Đã khiếu nại", icon: Eye, color: "text-sky-600" },
                  { label: "Mã lỗi", value: summary.maVanDonLoi, hint: "Cần xử lý dữ liệu", icon: Search, color: "text-slate-500" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</span>
                      <item.icon className={cn("h-4 w-4", item.color)} />
                    </div>
                    <div className="mt-3 text-3xl font-semibold text-slate-950">{item.value}</div>
                    <div className="mt-2 text-sm text-slate-600">{item.hint}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                <Card className="border-slate-200/80 bg-white/90">
                  <CardHeader>
                    <CardTitle className="text-slate-900">Tuổi backlog</CardTitle>
                    <CardDescription>Hiển thị ngay trong Ops Board để nhìn độ già của backlog mà không phải cuộn trang.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {loading ? (
                      <Skeleton className="h-24 rounded-2xl" />
                    ) : (
                      <>
                        <div className="overflow-hidden rounded-full bg-slate-200">
                          <div className="flex h-3 w-full">
                            {agingSegments.map((segment) => (
                              <div
                                key={segment.label}
                                className={cn(segment.tone, segment.percent === 0 ? "hidden" : "")}
                                style={{ width: `${segment.percent}%` }}
                                aria-label={`${segment.label}: ${segment.percent}%`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {agingSegments.map((segment) => (
                            <div key={segment.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2.5 w-2.5 rounded-full", segment.tone)} />
                                <span className="text-xs font-medium text-slate-600">{segment.label}</span>
                              </div>
                              <div className="mt-2 text-xl font-semibold text-slate-950">{segment.value}</div>
                              <div className="text-xs text-slate-500">{segment.percent}% tổng case</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-slate-200/80 bg-white/90">
                  <CardHeader className="border-b border-slate-100 bg-slate-50/80">
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                      <Layers3 className="h-5 w-5 text-slate-700" />
                      Queue Board
                    </CardTitle>
                    <CardDescription>Đặt ngay dưới KPI để chọn nhanh nhóm công việc trọng tâm.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 p-4 xl:grid-cols-3">
                    {loading
                      ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-3xl" />)
                      : queues.map((queue) => (
                          <button
                            key={queue.key}
                            type="button"
                            onClick={() => setFocusQueue(queue.key)}
                            className={cn(
                              "group relative overflow-hidden rounded-3xl border p-4 text-left transition-all duration-300",
                              queue.border,
                              focusQueue === queue.key
                                ? "scale-[1.01] bg-[linear-gradient(135deg,rgba(6,95,70,0.98),rgba(5,150,105,0.94))] text-white shadow-2xl"
                                : "bg-white hover:-translate-y-1 hover:shadow-xl"
                            )}
                          >
                            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80", queue.accent)} />
                            <div className="relative">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className={cn("text-xs uppercase tracking-[0.2em]", focusQueue === queue.key ? "text-emerald-50/80" : "text-slate-500")}>
                                    {queue.title}
                                  </div>
                                  <div className="mt-2 text-4xl font-semibold">{queue.count}</div>
                                </div>
                                <ArrowRight className={cn("h-5 w-5 transition-transform group-hover:translate-x-1", focusQueue === queue.key ? "text-white" : "text-slate-400")} />
                              </div>
                              <p className={cn("mt-3 text-sm leading-6", focusQueue === queue.key ? "text-emerald-50/80" : "text-slate-600")}>
                                {queue.description}
                              </p>
                              <div className="mt-5 flex items-center justify-between">
                                <div className={cn("text-xs", focusQueue === queue.key ? "text-emerald-50/75" : "text-slate-500")}>
                                  Nhấn để lọc danh sách theo queue này
                                </div>
                                <div
                                  className={cn(
                                    "rounded-full px-3 py-1 text-xs font-medium",
                                    focusQueue === queue.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"
                                  )}
                                >
                                  {queue.count.toLocaleString("vi-VN")} case
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <Card className="border-slate-200/80 bg-white/90">
            <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle>Bộ lọc</CardTitle>
                <CardDescription>Giữ nhẹ phần lọc, tập trung vào queue và danh sách xử lý bên dưới.</CardDescription>
              </div>
              <div className="grid w-full gap-3 md:grid-cols-2 xl:max-w-4xl xl:grid-cols-4">
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm shop, mã vận đơn..." />
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sàn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả sàn</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={warehouseStatus} onValueChange={setWarehouseStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Trạng thái kho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái kho</SelectItem>
                    <SelectItem value="da_ve_kho">Đã về kho</SelectItem>
                    <SelectItem value="chua_ve_kho">Chưa về kho</SelectItem>
                    <SelectItem value="ma_van_don_loi">Mã vận đơn lỗi</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={shop} onValueChange={setShop}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Shop" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả shop</SelectItem>
                    {shops.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-slate-200/80 bg-white/90">
            <CardHeader className="flex flex-row items-end justify-between gap-4">
              <div>
                <CardTitle>Danh sách đối soát</CardTitle>
                <CardDescription>Ưu tiên theo dõi các đơn chưa về kho và bóc tách nhanh theo mức độ ưu tiên.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setFocusQueue("tat_ca")} className="rounded-full">
                  Xem tất cả
                </Button>
                <Button size="sm" onClick={exportCurrentRows} disabled={isExporting || !reconciliationRows.length} className="rounded-full">
                  {isExporting ? "Đang xuất..." : "Tải xuống Excel"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "Tất cả đơn hàng", count: quickFilterCounts.all },
                  { key: "ma_van_don_loi", label: "Mã lỗi", count: quickFilterCounts.ma_van_don_loi },
                  { key: "cao", label: "Cao", count: quickFilterCounts.cao },
                  { key: "trung_binh", label: "Trung bình", count: quickFilterCounts.trung_binh },
                  { key: "thap", label: "Thấp", count: quickFilterCounts.thap },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setQuickFilter(item.key as "all" | "ma_van_don_loi" | Priority)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-sm transition-all",
                      quickFilter === item.key
                        ? "border-emerald-500 bg-emerald-600 text-white shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {item.label} ({item.count})
                  </button>
                ))}
              </div>

              {loading ? (
                Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button type="button" onClick={() => handleSort("shop")} className="inline-flex items-center gap-1.5 font-medium">
                          Shop / Sàn
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => handleSort("warehouseStatus")} className="inline-flex items-center gap-1.5 font-medium">
                          Kho
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => handleSort("processingStatus")} className="inline-flex items-center gap-1.5 font-medium">
                          Xử lý
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => handleSort("priority")} className="inline-flex items-center gap-1.5 font-medium">
                          Ưu tiên
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => handleSort("tracking")} className="inline-flex items-center gap-1.5 font-medium">
                          Mã vận đơn
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TableHead>
                      <TableHead>
                        <button type="button" onClick={() => handleSort("date")} className="inline-flex items-center gap-1.5 font-medium">
                          Ngày / Tuổi
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      </TableHead>
                      <TableHead>Chi tiết</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reconciliationRows.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium text-slate-950">{item.shop}</div>
                          <div className="text-xs text-slate-500">
                            {item.san === "tiktok" ? "TikTok" : "Shopee"} · {item.loaiDon === "don_huy" ? "Đơn hủy" : "Đơn hoàn"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{warehouseStatusLabel(item.warehouseStatus)}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={processBadgeClass(item.processingStatus)}>
                            {processingStatusLabel(item.processingStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={priorityBadgeClass(item.mucDoUuTien)}>
                            {priorityLabel(item.mucDoUuTien)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium text-slate-900">{item.maVanDonVe || item.maVanDonDi || "Thiếu mã"}</div>
                          {item.maVanDonKhop && <div className="text-xs text-emerald-700">Kho: {item.maVanDonKhop}</div>}
                        </TableCell>
                        <TableCell>
                          <div className={cn("font-medium", priorityDateClass(item.mucDoUuTien))}>{item.ageDays} ngày</div>
                          <div className="text-xs text-slate-900">{item.ngaySanDisplay || "-"}</div>
                        </TableCell>
                        <TableCell className="max-w-[280px] whitespace-normal">
                          <div className="space-y-1">
                            <div className="text-sm text-slate-700">{item.sanPham || item.sourceStatus || "-"}</div>
                            {item.sourceStatus && item.sourceStatus !== item.sanPham && (
                              <div className="text-xs text-slate-500">{item.sourceStatus}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[220px] whitespace-normal">
                          <Input
                            value={draftNotes[item.id] ?? ""}
                            onChange={(event) =>
                              setDraftNotes((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            onBlur={() => {
                              if ((draftNotes[item.id] ?? "") !== (item.note || "")) {
                                void saveNote(item)
                              }
                            }}
                            placeholder="Nhập ghi chú..."
                            className="h-8"
                            disabled={pendingCaseId === item.id}
                          />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-wrap gap-2">
                            {actionButtonsForQueue(item.queueView).map((status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant={status === "da_khieu_nai" || status === "da_hoan_tien" ? "default" : "outline"}
                                onClick={() => updateCaseStatus(item, status)}
                                disabled={pendingCaseId === item.id || item.processingStatus === status}
                                className={cn(item.processingStatus === status ? "opacity-45" : "")}
                              >
                                {actionLabel(status)}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {!reconciliationRows.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">
                          Không có đơn chưa về kho phù hợp với bộ lọc hiện tại.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}
        </div>
      </main>
    </div>
  )
}
