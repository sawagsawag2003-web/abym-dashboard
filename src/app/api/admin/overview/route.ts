import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-auth"
import { getAdminLogStats, parseAdminLogContent } from "@/lib/admin-log-parser"
import {
  ensureHoanHuyShopeeCacheFresh,
  ensureSheetCacheFresh,
  getHoanHuyShopeeLastSyncedAt,
  getSheetCacheLastSyncedAt,
} from "@/lib/sheet-cache"

type FileSummary = {
  name: string
  path: string
  size: number
  sizeLabel: string
  updatedAt: string
  status: "ok" | "missing"
}

type LogSummary = {
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
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function getFileSummary(targetPath: string, syncedAtMs?: number | null): FileSummary {
  if (!fs.existsSync(targetPath)) {
    return {
      name: path.basename(targetPath),
      path: targetPath,
      size: 0,
      sizeLabel: "0 B",
      updatedAt: "Chưa có",
      status: "missing",
    }
  }

  const stats = fs.statSync(targetPath)
  return {
    name: path.basename(targetPath),
    path: targetPath,
    size: stats.size,
    sizeLabel: formatBytes(stats.size),
    updatedAt: formatTimestamp(new Date(syncedAtMs || stats.mtime.getTime())),
    status: "ok",
  }
}

function getLogLevel(text: string): LogSummary["level"] {
  const upper = text.toUpperCase()
  if (upper.includes("ERROR") || upper.includes("TRACEBACK") || upper.includes("FAILED")) return "error"
  if (upper.includes("WARN") || upper.includes("WARNING")) return "warning"
  return "info"
}

function getLogPreview(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" | ")
}

function getLogPlatform(name: string): LogSummary["platform"] {
  const lowerName = name.toLowerCase()
  if (lowerName.includes("shopee")) return "Shopee"
  if (lowerName.includes("tiktok")) return "TikTok"
  return "Other"
}

function countFilesRecursively(targetPath: string) {
  if (!fs.existsSync(targetPath)) return 0

  const entries = fs.readdirSync(targetPath, { withFileTypes: true })
  let count = 0

  for (const entry of entries) {
    const nextPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      count += countFilesRecursively(nextPath)
    } else {
      count += 1
    }
  }

  return count
}

export async function GET() {
  const authenticated = await isAdminAuthenticated()
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const backendRoot = path.resolve(process.cwd(), "backend")
    const logRoot = path.join(backendRoot, "log")
    const savedOrdersRoot = path.join(backendRoot, "saved_orders")

    await Promise.all([ensureSheetCacheFresh(), ensureHoanHuyShopeeCacheFresh()])

    const sheetCacheLastSyncedAt = getSheetCacheLastSyncedAt()
    const hoanHuyShopeeLastSyncedAt = getHoanHuyShopeeLastSyncedAt()

    const databaseFiles = [
      { name: "database.db" },
      { name: "sheet_cache.db", syncedAtMs: sheetCacheLastSyncedAt },
      { name: "DonHoan_Tiktok.db" },
      { name: "HoanHuy_Shopee.db", syncedAtMs: hoanHuyShopeeLastSyncedAt },
      { name: "hoan_huy_state.db" },
    ].map((item) => getFileSummary(path.join(backendRoot, item.name), item.syncedAtMs))

    const logFiles: LogSummary[] = fs.existsSync(logRoot)
      ? fs
          .readdirSync(logRoot)
          .filter((name) => name.toLowerCase().endsWith(".txt") || name.toLowerCase().endsWith(".log"))
          .map((name) => {
            const filePath = path.join(logRoot, name)
            const stats = fs.statSync(filePath)
            const content = fs.readFileSync(filePath, "utf8")
            const entries = parseAdminLogContent(content)
            const logStats = getAdminLogStats(entries)
            return {
              name,
              path: filePath,
              size: stats.size,
              sizeLabel: formatBytes(stats.size),
              updatedAt: formatTimestamp(stats.mtime),
              updatedAtMs: stats.mtimeMs,
              platform: getLogPlatform(name),
              level: getLogLevel(content),
              preview: getLogPreview(content),
              uploadCount: logStats.uploads,
              completedCount: logStats.completed,
              totalOrders: logStats.totalOrders,
              latestTotalOrders: logStats.latestTotalOrders,
            }
          })
          .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
      : []

    const latestLog = logFiles[0] || null
    const latestLogContent =
      latestLog && fs.existsSync(latestLog.path)
        ? fs.readFileSync(latestLog.path, "utf8").split(/\r?\n/).slice(-120).join("\n")
        : ""

    const totalDbSize = databaseFiles.reduce((sum, item) => sum + item.size, 0)

    return NextResponse.json({
      summary: {
        databaseCount: databaseFiles.length,
        healthyDatabaseCount: databaseFiles.filter((item) => item.status === "ok").length,
        logFileCount: logFiles.length,
        savedPdfCount: countFilesRecursively(savedOrdersRoot),
        totalDbSize,
        totalDbSizeLabel: formatBytes(totalDbSize),
      },
      databases: databaseFiles,
      logs: logFiles,
      latestLogName: latestLog?.name || null,
      latestLogContent,
      paths: {
        backendRoot,
        logRoot,
        savedOrdersRoot,
      },
    })
  } catch (error) {
    console.error("[admin-overview] Failed to build overview:", error)
    return NextResponse.json({ error: "Không thể tải dữ liệu admin." }, { status: 500 })
  }
}
