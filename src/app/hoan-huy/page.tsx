"use client"

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Clock3, Eye, RefreshCcw, Search, Truck } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  ngaySan: string
  ngaySanDisplay: string
  ageDays: number
  mucDoUuTien: Priority
  warehouseStatus: WarehouseStatus
  maVanDonDi: string
  maVanDonVe: string
  maVanDonKhop: string
  matchedBy: "ma_van_don_ve" | "ma_van_don_di" | "ma_van_don" | ""
  orderId: string
  returnOrderId: string
  soTien: number | null
  soTienDisplay: string
  lyDo: string
  sanPham: string
  khachHang: string
  processingStatus: ProcessingStatus
  queueView: QueueView
  note: string
  complaintDate: string
  updatedAt: string
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
  options: {
    shops: string[]
  }
  meta: {
    importTrackingCount: number
    totalSourceRecords: number
    defaultQueueView: QueueView
  }
}

const defaultSummary: ApiResponse["summary"] = {
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

function warehouseStatusLabel(value: WarehouseStatus) {
  if (value === "da_ve_kho") return "Đã về kho"
  if (value === "chua_ve_kho") return "Chưa về kho"
  return "Mã lỗi"
}

function priorityLabel(value: Priority) {
  if (value === "cao") return "Cao"
  if (value === "trung_binh") return "Trung bình"
  return "Thấp"
}

function orderTypeLabel(value: OrderType) {
  return value === "don_huy" ? "Đơn hủy" : "Đơn hoàn"
}

function processingStatusLabel(value: ProcessingStatus) {
  if (value === "moi") return "Mới"
  if (value === "dang_xac_minh") return "Đang xác minh"
  if (value === "da_khieu_nai") return "Đã khiếu nại"
  if (value === "cho_phan_hoi") return "Chờ phản hồi"
  if (value === "da_hoan_tien") return "Đã hoàn tiền"
  if (value === "dong_case") return "Đóng case"
  return "Bỏ qua"
}

function matchedByLabel(value: HoanHuyCase["matchedBy"]) {
  if (value === "ma_van_don_ve") return "Khớp mã về"
  if (value === "ma_van_don_di") return "Khớp mã đi"
  if (value === "ma_van_don") return "Khớp mã vận đơn"
  return "Chưa khớp"
}

function getBadgeVariantByWarehouseStatus(value: WarehouseStatus): "default" | "secondary" | "destructive" | "outline" {
  if (value === "da_ve_kho") return "default"
  if (value === "chua_ve_kho") return "secondary"
  return "destructive"
}

function getBadgeVariantByPriority(value: Priority): "default" | "secondary" | "destructive" | "outline" {
  if (value === "cao") return "destructive"
  if (value === "trung_binh") return "secondary"
  return "outline"
}

function getBadgeVariantByProcessingStatus(
  value: ProcessingStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (value === "da_hoan_tien") return "default"
  if (value === "dong_case" || value === "bo_qua") return "outline"
  if (value === "da_khieu_nai" || value === "cho_phan_hoi") return "secondary"
  return "destructive"
}

export default function HoanHuyPage() {
  const [queueView, setQueueView] = useState<QueueView>("can_xu_ly")
  const [platform, setPlatform] = useState("all")
  const [loaiDon, setLoaiDon] = useState("all")
  const [warehouseStatus, setWarehouseStatus] = useState("all")
  const [mucDoUuTien, setMucDoUuTien] = useState("all")
  const [processingStatus, setProcessingStatus] = useState("all")
  const [shop, setShop] = useState("all")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)

  const [records, setRecords] = useState<HoanHuyCase[]>([])
  const [shops, setShops] = useState<string[]>([])
  const [summary, setSummary] = useState(defaultSummary)
  const [meta, setMeta] = useState<ApiResponse["meta"]>({
    importTrackingCount: 0,
    totalSourceRecords: 0,
    defaultQueueView: "can_xu_ly",
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [pendingCaseId, setPendingCaseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const params = useMemo(() => {
    const nextParams = new URLSearchParams({
      queueView,
      platform,
      loaiDon,
      warehouseStatus,
      mucDoUuTien,
      processingStatus,
      shop,
    })

    if (deferredSearch.trim()) nextParams.set("search", deferredSearch.trim())
    return nextParams.toString()
  }, [deferredSearch, loaiDon, mucDoUuTien, platform, processingStatus, queueView, shop, warehouseStatus])

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      setError(null)
      setIsLoading((current) => current || !records.length)
      setIsRefreshing(records.length > 0)

      try {
        const response = await fetch(`/api/hoan-huy/reconciliation?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok) throw new Error("Không thể tải dữ liệu đối soát hoàn hủy")

        const result = (await response.json()) as ApiResponse
        setRecords(result.records)
        setSummary(result.summary)
        setShops(result.options.shops)
        setMeta(result.meta)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi tải dữ liệu")
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
          setIsRefreshing(false)
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
          complaintDate: nextStatus === "da_khieu_nai" && !item.complaintDate ? new Date().toISOString().slice(0, 10) : item.complaintDate,
          refundAmount: item.soTien,
        }),
      })

      if (!response.ok) throw new Error("Không thể cập nhật trạng thái case")

      startTransition(() => {
        setRecords((current) => {
          const next = current
            .map((record) =>
              record.id === item.id
                ? {
                    ...record,
                    processingStatus: nextStatus,
                    complaintDate:
                      nextStatus === "da_khieu_nai" && !record.complaintDate
                        ? new Date().toISOString().slice(0, 10)
                        : record.complaintDate,
                    queueView:
                      nextStatus === "moi" || nextStatus === "dang_xac_minh"
                        ? "can_xu_ly"
                        : nextStatus === "da_khieu_nai" || nextStatus === "cho_phan_hoi"
                          ? "dang_theo_doi"
                          : "da_xong",
                  }
                : record
            )
            .filter((record) => queueView === "tat_ca" || record.queueView === queueView)

          return next
        })
      })

      setIsRefreshing(true)
      const refreshResponse = await fetch(`/api/hoan-huy/reconciliation?${params}`, { cache: "no-store" })
      if (refreshResponse.ok) {
        const refreshed = (await refreshResponse.json()) as ApiResponse
        setRecords(refreshed.records)
        setSummary(refreshed.summary)
        setShops(refreshed.options.shops)
        setMeta(refreshed.meta)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi cập nhật trạng thái")
    } finally {
      setPendingCaseId(null)
      setIsRefreshing(false)
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

      const refreshResponse = await fetch(`/api/hoan-huy/reconciliation?${params}`, { cache: "no-store" })
      if (!refreshResponse.ok) throw new Error("Không thể tải lại dữ liệu đối soát")

      const refreshed = (await refreshResponse.json()) as ApiResponse
      setRecords(refreshed.records)
      setSummary(refreshed.summary)
      setShops(refreshed.options.shops)
      setMeta(refreshed.meta)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi cập nhật dữ liệu")
    } finally {
      setIsSyncing(false)
    }
  }

  const topPendingCases = useMemo(
    () => records.filter((item) => item.queueView === "can_xu_ly" && item.warehouseStatus === "chua_ve_kho").slice(0, 6),
    [records]
  )

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header
          title="Đơn Hoàn, Hủy"
          description="Đối soát dữ liệu TikTok, Shopee với sheet kho nhập và tách riêng nhóm cần xử lý, đang theo dõi, đã xong."
        />

        <div className="mt-4 space-y-5 md:mt-5 md:space-y-6">
          <Tabs value={queueView} onValueChange={(value) => setQueueView(value as QueueView)}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="can_xu_ly">Cần xử lý ({summary.canXuLy})</TabsTrigger>
              <TabsTrigger value="dang_theo_doi">Đang theo dõi ({summary.dangTheoDoi})</TabsTrigger>
              <TabsTrigger value="da_xong">Đã xong ({summary.daXong})</TabsTrigger>
              <TabsTrigger value="tat_ca">Tất cả ({summary.total})</TabsTrigger>
            </TabsList>
          </Tabs>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {isLoading
              ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)
              : [
                  {
                    label: "Cần xử lý",
                    value: summary.canXuLy,
                    hint: "Mới hoặc đang xác minh",
                    icon: AlertCircle,
                  },
                  {
                    label: "Đang theo dõi",
                    value: summary.dangTheoDoi,
                    hint: "Đã khiếu nại hoặc chờ phản hồi",
                    icon: Eye,
                  },
                  {
                    label: "Đã về kho",
                    value: summary.daVeKho,
                    hint: "Tìm thấy trong sheet nhập",
                    icon: CheckCircle2,
                  },
                  {
                    label: "Chưa về kho",
                    value: summary.chuaVeKho,
                    hint: "Case chưa khớp kho",
                    icon: Clock3,
                  },
                  {
                    label: "Mã vận đơn lỗi",
                    value: summary.maVanDonLoi,
                    hint: "Cần kiểm tra dữ liệu nguồn",
                    icon: Search,
                  },
                ].map((item) => (
                  <Card key={item.label} className="gap-4">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-0">
                      <div className="space-y-1">
                        <CardDescription>{item.label}</CardDescription>
                        <CardTitle className="text-3xl">{item.value.toLocaleString("vi-VN")}</CardTitle>
                      </div>
                      <div className="rounded-full border border-border bg-muted p-2">
                        <item.icon className="h-4 w-4 text-foreground" />
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-muted-foreground">{item.hint}</CardContent>
                  </Card>
                ))}
          </section>

          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Bộ lọc đối soát</CardTitle>
              <CardDescription>
                Nguồn kho nhập có {meta.importTrackingCount.toLocaleString("vi-VN")} mã vận đơn. Case đã xong được tách
                riêng khỏi hàng chờ mặc định.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
              <div className="xl:col-span-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm mã vận đơn, shop, ghi chú..."
                />
              </div>

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

              <Select value={loaiDon} onValueChange={setLoaiDon}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Loại đơn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả loại đơn</SelectItem>
                  <SelectItem value="don_hoan">Đơn hoàn</SelectItem>
                  <SelectItem value="don_huy">Đơn hủy</SelectItem>
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

              <Select value={mucDoUuTien} onValueChange={setMucDoUuTien}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Ưu tiên" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả mức độ</SelectItem>
                  <SelectItem value="cao">Cao</SelectItem>
                  <SelectItem value="trung_binh">Trung bình</SelectItem>
                  <SelectItem value="thap">Thấp</SelectItem>
                </SelectContent>
              </Select>

              <Select value={processingStatus} onValueChange={setProcessingStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Trạng thái xử lý" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả trạng thái xử lý</SelectItem>
                  <SelectItem value="moi">Mới</SelectItem>
                  <SelectItem value="dang_xac_minh">Đang xác minh</SelectItem>
                  <SelectItem value="da_khieu_nai">Đã khiếu nại</SelectItem>
                  <SelectItem value="cho_phan_hoi">Chờ phản hồi</SelectItem>
                  <SelectItem value="da_hoan_tien">Đã hoàn tiền</SelectItem>
                  <SelectItem value="dong_case">Đóng case</SelectItem>
                  <SelectItem value="bo_qua">Bỏ qua</SelectItem>
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
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{error}</div>
          )}

          {!!topPendingCases.length && queueView === "can_xu_ly" && (
            <Card className="gap-4">
              <CardHeader>
                <CardTitle>Case cần xử lý trước</CardTitle>
                <CardDescription>Ưu tiên các case chưa về kho, tuổi case lớn và chưa chuyển sang theo dõi.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {topPendingCases.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-xl border p-4 shadow-sm",
                      item.mucDoUuTien === "cao" ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {item.shop} · {item.san === "tiktok" ? "TikTok" : "Shopee"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {orderTypeLabel(item.loaiDon)} · {item.ngaySanDisplay || "Chưa rõ ngày"}
                        </div>
                      </div>
                      <Badge variant={getBadgeVariantByPriority(item.mucDoUuTien)}>{priorityLabel(item.mucDoUuTien)}</Badge>
                    </div>

                    <div className="mt-3 space-y-1 text-sm">
                      <div className="font-medium text-foreground">{item.maVanDonVe || item.maVanDonDi || "Thiếu mã vận đơn"}</div>
                      <div className="text-muted-foreground">{item.sanPham || item.sourceStatus || item.lyDo || "Chưa có chi tiết"}</div>
                      {item.sourceStatus && item.sourceStatus !== item.sanPham && (
                        <div className="text-xs text-muted-foreground">{item.sourceStatus}</div>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateCaseStatus(item, "da_khieu_nai")}
                        disabled={pendingCaseId === item.id}
                      >
                        Đã khiếu nại
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateCaseStatus(item, "dang_xac_minh")}
                        disabled={pendingCaseId === item.id}
                      >
                        Xác minh
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>Danh sách đối soát</CardTitle>
                  <CardDescription>
                    {isRefreshing ? "Đang làm mới dữ liệu..." : `Hiển thị ${records.length.toLocaleString("vi-VN")} case`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => void syncSheetData()} disabled={isSyncing}>
                    <RefreshCcw className={cn("mr-2 h-4 w-4", isSyncing ? "animate-spin" : "")} />
                    {isSyncing ? "Đang cập nhật dữ liệu" : "Cập nhật dữ liệu"}
                  </Button>
                  {isRefreshing && <RefreshCcw className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sàn / Shop</TableHead>
                      <TableHead>Kho</TableHead>
                      <TableHead>Xử lý</TableHead>
                      <TableHead>Ưu tiên</TableHead>
                      <TableHead>Mã vận đơn</TableHead>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Chi tiết</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium text-foreground">{item.shop}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.san === "tiktok" ? "TikTok" : "Shopee"} · {orderTypeLabel(item.loaiDon)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getBadgeVariantByWarehouseStatus(item.warehouseStatus)}>
                            {warehouseStatusLabel(item.warehouseStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <Badge variant={getBadgeVariantByProcessingStatus(item.processingStatus)}>
                            {processingStatusLabel(item.processingStatus)}
                          </Badge>
                          {item.complaintDate && (
                            <div className="mt-1 text-xs text-muted-foreground">KN: {item.complaintDate}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getBadgeVariantByPriority(item.mucDoUuTien)}>{priorityLabel(item.mucDoUuTien)}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium text-foreground">{item.maVanDonVe || item.maVanDonDi || "Thiếu mã"}</div>
                          {item.maVanDonVe && item.maVanDonDi && item.maVanDonVe !== item.maVanDonDi && (
                            <div className="text-xs text-muted-foreground">Mã đi: {item.maVanDonDi}</div>
                          )}
                          <div className="text-xs text-muted-foreground">{matchedByLabel(item.matchedBy)}</div>
                          {item.maVanDonKhop && <div className="text-xs text-emerald-700">Kho: {item.maVanDonKhop}</div>}
                        </TableCell>
                        <TableCell>
                          <div>{item.ngaySanDisplay || "-"}</div>
                          <div className="text-xs text-muted-foreground">{item.ageDays} ngày</div>
                        </TableCell>
                        <TableCell className="max-w-[360px] whitespace-normal">
                          <div className="space-y-1">
                            <div className="text-sm text-foreground">{item.sanPham || item.sourceStatus || item.lyDo || "-"}</div>
                            {item.sourceStatus && item.sourceStatus !== item.sanPham && (
                              <div className="text-xs text-muted-foreground">{item.sourceStatus}</div>
                            )}
                            {item.note && <div className="text-xs text-amber-700">Ghi chú: {item.note}</div>}
                            <div className="text-xs text-muted-foreground">
                              {item.soTienDisplay ? `${item.soTienDisplay}đ` : "Không có số tiền"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-wrap gap-2">
                            {queueView === "can_xu_ly" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateCaseStatus(item, "dang_xac_minh")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Xác minh
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => updateCaseStatus(item, "da_khieu_nai")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Khiếu nại
                                </Button>
                              </>
                            )}

                            {queueView === "dang_theo_doi" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateCaseStatus(item, "cho_phan_hoi")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Chờ phản hồi
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => updateCaseStatus(item, "da_hoan_tien")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Đã hoàn tiền
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => updateCaseStatus(item, "dong_case")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Đóng case
                                </Button>
                              </>
                            )}

                            {queueView === "da_xong" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateCaseStatus(item, "moi")}
                                disabled={pendingCaseId === item.id}
                              >
                                Mở lại
                              </Button>
                            )}

                            {queueView === "tat_ca" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateCaseStatus(item, "moi")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Mới
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateCaseStatus(item, "da_khieu_nai")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Khiếu nại
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => updateCaseStatus(item, "da_hoan_tien")}
                                  disabled={pendingCaseId === item.id}
                                >
                                  Hoàn tiền
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}

                    {!records.length && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                          Không có case phù hợp với nhóm và bộ lọc hiện tại.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
