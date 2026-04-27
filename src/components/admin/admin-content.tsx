"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSearch,
  Files,
  FolderArchive,
  LogOut,
  RefreshCcw,
  Search,
  ShieldCheck,
  UploadCloud,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

type LogAction = "all" | "upload" | "done" | "warning" | "error" | "info"

type LogEntry = {
  lineNumber: number
  time: string
  ip: string
  os: string
  browser: string
  action: Exclude<LogAction, "all">
  title: string
  message: string
  fileCount: number | null
  files: string[]
  outputFiles: string[]
  totalOrders: number | null
  raw: string
}

type LogStats = {
  total: number
  uploads: number
  completed: number
  warnings: number
  errors: number
  totalOrders: number | null
  latestTotalOrders: number | null
}

type LogDetail = {
  name: string
  content: string
  entries: LogEntry[]
  stats: LogStats
}

type AdminData = {
  summary: {
    databaseCount: number
    healthyDatabaseCount: number
    logFileCount: number
    savedPdfCount: number
    totalDbSize: number
    totalDbSizeLabel: string
  }
  databases: Array<{
    name: string
    path: string
    size: number
    sizeLabel: string
    updatedAt: string
    status: "ok" | "missing"
  }>
  logs: Array<{
    name: string
    path: string
    size: number
    sizeLabel: string
    updatedAt: string
    updatedAtMs: number
    platform: "Shopee" | "TikTok" | "Other"
    level: "info" | "warning" | "error"
    preview: string
    uploadCount: number
    completedCount: number
    totalOrders: number | null
    latestTotalOrders: number | null
  }>
  latestLogName: string | null
  latestLogContent: string
  paths: {
    backendRoot: string
    logRoot: string
    savedOrdersRoot: string
  }
}

function logLevelClass(level: "info" | "warning" | "error") {
  if (level === "error") return "border-rose-200 bg-rose-50 text-rose-700"
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  return "border-sky-200 bg-sky-50 text-sky-700"
}

function actionClass(action: LogEntry["action"]) {
  if (action === "error") return "border-rose-200 bg-rose-50 text-rose-700"
  if (action === "warning") return "border-amber-200 bg-amber-50 text-amber-700"
  if (action === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (action === "upload") return "border-sky-200 bg-sky-50 text-sky-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function actionLabel(action: LogEntry["action"]) {
  if (action === "upload") return "Tải lên"
  if (action === "done") return "Xử lý xong"
  if (action === "warning") return "Cảnh báo"
  if (action === "error") return "Lỗi"
  return "Thông tin"
}

function platformClass(platform: "Shopee" | "TikTok" | "Other") {
  if (platform === "Shopee") return "border-orange-200 bg-orange-50 text-orange-700"
  if (platform === "TikTok") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function matchesLogSearch(entry: LogEntry, search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return true
  return [entry.title, entry.message, entry.ip, entry.os, entry.browser, ...entry.files, ...entry.outputFiles]
    .join(" ")
    .toLowerCase()
    .includes(keyword)
}

export function AdminContent() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncingSheets, setSyncingSheets] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLogName, setSelectedLogName] = useState<string | null>(null)
  const [selectedLogContent, setSelectedLogContent] = useState("")
  const [selectedLogDetail, setSelectedLogDetail] = useState<LogDetail | null>(null)
  const [loadingLog, setLoadingLog] = useState(false)
  const [logActionFilter, setLogActionFilter] = useState<LogAction>("all")
  const [logSearch, setLogSearch] = useState("")
  const [logViewMode, setLogViewMode] = useState<"timeline" | "raw">("timeline")
  const [visibleLogCount, setVisibleLogCount] = useState(2)

  async function loadData() {
    setError(null)
    setRefreshing(true)

    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" })
      if (!response.ok) throw new Error("Không thể tải dữ liệu quản trị.")

      const json = (await response.json()) as AdminData
      setData(json)
      if (!selectedLogName && json.latestLogName) {
        void loadLogFile(json.latestLogName)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function refreshAllSheetData() {
    setError(null)
    setSyncingSheets(true)

    try {
      const response = await fetch("/api/sheet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "all" }),
      })

      if (!response.ok) throw new Error("Không thể đồng bộ dữ liệu sheet.")
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra khi đồng bộ sheet.")
    } finally {
      setSyncingSheets(false)
    }
  }

  async function loadLogFile(name: string) {
    setSelectedLogName(name)
    setLoadingLog(true)

    try {
      const response = await fetch(`/api/admin/log-file?name=${encodeURIComponent(name)}`, { cache: "no-store" })
      if (!response.ok) throw new Error("Không thể mở file log.")
      const json = (await response.json()) as LogDetail
      setSelectedLogContent(json.content)
      setSelectedLogDetail(json)
      setLogActionFilter("all")
      setLogSearch("")
      setLogViewMode("timeline")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.")
    } finally {
      setLoadingLog(false)
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" })
    window.location.href = "/"
  }

  useEffect(() => {
    void loadData()
  }, [])

  const selectedLogMeta = useMemo(
    () => data?.logs.find((item) => item.name === selectedLogName) || null,
    [data?.logs, selectedLogName]
  )

  const visibleLogs = useMemo(() => data?.logs.slice(0, visibleLogCount) || [], [data?.logs, visibleLogCount])

  const filteredLogEntries = useMemo(() => {
    const entries = selectedLogDetail?.entries || []
    return entries.filter((entry) => {
      const matchesAction = logActionFilter === "all" || entry.action === logActionFilter
      return matchesAction && matchesLogSearch(entry, logSearch)
    })
  }, [logActionFilter, logSearch, selectedLogDetail?.entries])

  const newestLogEntries = useMemo(() => [...filteredLogEntries].reverse(), [filteredLogEntries])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Admin Mode
          </Badge>
          {(refreshing || syncingSheets) && (
            <Badge variant="outline" className="rounded-full">
              <RefreshCcw className="mr-1 h-3.5 w-3.5 animate-spin" />
              Đang làm mới
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refreshAllSheetData()} disabled={syncingSheets || refreshing}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", syncingSheets && "animate-spin")} />
            Làm mới
          </Button>
          <Button variant="outline" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" />
            Thoát admin
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)
          : [
              {
                label: "Cơ sở dữ liệu",
                value: `${data?.summary.healthyDatabaseCount}/${data?.summary.databaseCount}`,
                helper: "DB đang sẵn sàng",
                icon: Database,
                tone: "text-sky-600 bg-sky-50",
              },
              {
                label: "File log",
                value: `${data?.summary.logFileCount || 0}`,
                helper: "Log đang có trong thư mục backend/log",
                icon: FileSearch,
                tone: "text-amber-600 bg-amber-50",
              },
              {
                label: "PDF lưu trữ",
                value: `${data?.summary.savedPdfCount || 0}`,
                helper: "Tổng file trong kho PDF đơn cũ",
                icon: Files,
                tone: "text-emerald-600 bg-emerald-50",
              },
              {
                label: "Dung lượng DB",
                value: data?.summary.totalDbSizeLabel || "0 B",
                helper: "Tổng dung lượng các file SQLite chính",
                icon: FolderArchive,
                tone: "text-slate-700 bg-slate-100",
              },
            ].map((item) => (
              <Card key={item.label} className="rounded-2xl border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{item.label}</span>
                    <div className={cn("rounded-full p-2", item.tone)}>
                      <item.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 text-3xl font-semibold text-slate-950">{item.value}</div>
                  <div className="mt-2 text-sm text-slate-500">{item.helper}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      <Tabs defaultValue="overview" className="gap-5">
        <TabsList className="rounded-2xl bg-slate-100 p-1">
          <TabsTrigger value="overview" className="rounded-xl px-4 py-2">
            Tổng quan
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-xl px-4 py-2">
            Nhật ký hệ thống
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Tình trạng dữ liệu</CardTitle>
                <CardDescription>Kiểm tra nhanh các file DB quan trọng và thời gian cập nhật gần nhất.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading
                  ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
                  : data?.databases.map((item) => (
                      <div key={item.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-950">{item.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.path}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              item.status === "ok"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }
                          >
                            {item.status === "ok" ? "Sẵn sàng" : "Thiếu file"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                          <span>Dung lượng: {item.sizeLabel}</span>
                          <span>Cập nhật: {item.updatedAt}</span>
                        </div>
                      </div>
                    ))}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Đường dẫn quản trị</CardTitle>
                <CardDescription>Các thư mục admin cần dùng thường xuyên để kiểm tra dữ liệu nguồn.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-950">Backend Root</p>
                      <p className="mt-2 break-all text-xs text-slate-500">{data?.paths.backendRoot}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-950">Thư mục log</p>
                      <p className="mt-2 break-all text-xs text-slate-500">{data?.paths.logRoot}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-950">Kho PDF đơn cũ</p>
                      <p className="mt-2 break-all text-xs text-slate-500">{data?.paths.savedOrdersRoot}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Danh sách log</CardTitle>
                <CardDescription>Chọn một file log để xem nhanh nội dung và kiểm tra lỗi.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading
                  ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)
                  : visibleLogs.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => void loadLogFile(item.name)}
                        className={cn(
                          "w-full rounded-2xl border p-4 text-left transition",
                          selectedLogName === item.name
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-950">{item.name}</p>
                            <p className="mt-1 text-xs text-slate-500">{item.updatedAt}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className={platformClass(item.platform)}>
                              {item.platform}
                            </Badge>
                            <Badge variant="outline" className={logLevelClass(item.level)}>
                              {item.level === "error" ? "Error" : item.level === "warning" ? "Warning" : "Info"}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                          <span>{item.sizeLabel}</span>
                          <span>{item.uploadCount} lần tải lên</span>
                          <span>{item.completedCount} lần xử lý</span>
                          {item.totalOrders !== null ? <span>{item.totalOrders} tổng đơn</span> : null}
                          <span className="line-clamp-1">{item.preview || "Không có preview"}</span>
                        </div>
                      </button>
                    ))}
                {!loading && data && data.logs.length > visibleLogCount ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setVisibleLogCount((count) => count + 2)}
                  >
                    Xem thêm
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Chi tiết log</CardTitle>
                <CardDescription>
                  {selectedLogMeta ? `Đang xem ${selectedLogMeta.name}` : "Chọn một file log từ danh sách bên trái."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading || loadingLog ? (
                  <Skeleton className="h-[520px] rounded-2xl" />
                ) : selectedLogMeta ? (
                  <div className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Tổng dòng</p>
                        <p className="mt-1 text-xl font-semibold text-slate-950">{selectedLogDetail?.stats.total || 0}</p>
                      </div>
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                        <p className="text-xs text-sky-700">Tải lên</p>
                        <p className="mt-1 text-xl font-semibold text-sky-950">{selectedLogDetail?.stats.uploads || 0}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs text-emerald-700">Xử lý xong</p>
                        <p className="mt-1 text-xl font-semibold text-emerald-950">{selectedLogDetail?.stats.completed || 0}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-500">Tổng đơn</p>
                        <p className="mt-1 text-xl font-semibold text-slate-950">
                          {selectedLogDetail?.stats.totalOrders ?? "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={platformClass(selectedLogMeta.platform)}>
                          {selectedLogMeta.platform}
                        </Badge>
                        <Badge variant="outline" className={logLevelClass(selectedLogMeta.level)}>
                          {selectedLogMeta.level === "error" ? (
                            <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                          ) : null}
                          {selectedLogMeta.level === "error" ? "Error" : selectedLogMeta.level === "warning" ? "Warning" : "Info"}
                        </Badge>
                        <Badge variant="outline">{selectedLogMeta.sizeLabel}</Badge>
                        <Badge variant="outline">{filteredLogEntries.length} dòng đang hiện</Badge>
                      </div>

                      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            value={logSearch}
                            onChange={(event) => setLogSearch(event.target.value)}
                            placeholder="Tìm tên file, IP, thiết bị hoặc nội dung..."
                            className="pl-9"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "all", label: "Tất cả" },
                            { value: "upload", label: "Tải lên" },
                            { value: "done", label: "Xử lý xong" },
                            { value: "warning", label: "Cảnh báo" },
                            { value: "error", label: "Lỗi" },
                          ].map((item) => (
                            <Button
                              key={item.value}
                              type="button"
                              variant={logActionFilter === item.value ? "default" : "outline"}
                              size="sm"
                              onClick={() => setLogActionFilter(item.value as LogAction)}
                            >
                              {item.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <Tabs value={logViewMode} onValueChange={(value) => setLogViewMode(value as "timeline" | "raw")}>
                        <TabsList className="rounded-xl bg-white p-1">
                          <TabsTrigger value="timeline" className="rounded-lg px-3 py-1.5">
                            Dễ đọc
                          </TabsTrigger>
                          <TabsTrigger value="raw" className="rounded-lg px-3 py-1.5">
                            Raw
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    {logViewMode === "timeline" ? (
                      <ScrollArea className="h-[520px] rounded-2xl border border-slate-200 bg-white">
                        <div className="space-y-3 p-4">
                          {newestLogEntries.length ? (
                            newestLogEntries.map((entry) => (
                              <div key={`${entry.lineNumber}-${entry.raw}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex items-start gap-3">
                                    <div
                                      className={cn(
                                        "mt-0.5 rounded-full border p-2",
                                        entry.action === "done"
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : entry.action === "upload"
                                            ? "border-sky-200 bg-sky-50 text-sky-700"
                                            : "border-slate-200 bg-slate-50 text-slate-600"
                                      )}
                                    >
                                      {entry.action === "done" ? <CheckCircle2 className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                                    </div>
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-medium text-slate-950">{entry.title}</p>
                                        <Badge variant="outline" className={actionClass(entry.action)}>
                                          {actionLabel(entry.action)}
                                        </Badge>
                                      </div>
                                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                        <span>Dòng {entry.lineNumber}</span>
                                        {entry.time ? <span>{entry.time}</span> : null}
                                        {entry.ip ? <span>{entry.ip}</span> : null}
                                        {entry.os ? <span>{entry.os}</span> : null}
                                        {entry.browser ? <span>{entry.browser}</span> : null}
                                      </div>
                                    </div>
                                  </div>
                                  {entry.totalOrders !== null ? (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-right">
                                      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                                        Tổng đơn
                                      </p>
                                      <p className="mt-0.5 text-lg font-semibold leading-none text-emerald-950">
                                        {entry.totalOrders}
                                      </p>
                                    </div>
                                  ) : null}
                                  {entry.totalOrders !== null ? (
                                    <Badge variant="outline" className="hidden">
                                      {entry.totalOrders} đơn
                                    </Badge>
                                  ) : null}
                                </div>

                                {entry.files.length ? (
                                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                                    <p className="text-xs font-medium text-slate-600">
                                      {entry.fileCount ?? entry.files.length} file tải lên
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {entry.files.slice(0, 12).map((file) => (
                                        <Badge key={file} variant="outline" className="max-w-full truncate bg-white">
                                          {file}
                                        </Badge>
                                      ))}
                                      {entry.files.length > 12 ? (
                                        <Badge variant="outline" className="bg-white">
                                          +{entry.files.length - 12} file khác
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}

                                {entry.outputFiles.length ? (
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {entry.outputFiles.map((file) => (
                                      <Badge key={file} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                        {file}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}

                                {!entry.files.length && !entry.outputFiles.length ? (
                                  <p className="mt-3 break-words text-sm text-slate-600">{entry.message}</p>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                              Không có dòng log khớp bộ lọc.
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    ) : (
                      <ScrollArea className="h-[520px] rounded-2xl border border-slate-200 bg-slate-950 p-4">
                        <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-100">
                          {selectedLogContent || "File log trống."}
                        </pre>
                      </ScrollArea>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Chưa có file log nào được chọn.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
