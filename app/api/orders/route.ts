import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { parse, isValid, format as formatDate } from "date-fns"
import { classifyProduct } from "@/lib/production-classification"

export const runtime = "nodejs"

const SPREADSHEET_ID = "1MZfWg0griTLNuWFgo38kF8ol1wT1Hj469h1DTQ1k93U"

const SHEETS = {
  export: "913751716",
  import: "46970018",
}

type MetricType = "totalExport" | "totalImport" | "cancelled" | "returned"

interface OrderRow {
  date: string
  trackingCode: string
  carrier: string
}

interface OrderWithDate extends OrderRow {
  parsedDate: Date
}

interface OrderStats {
  total: number
  byDate: Record<string, number>
  orders: OrderWithDate[]
}

interface MetricComparison {
  previous: number
  changePercent: number
  trend: "up" | "down" | "neutral"
}

interface CategoryBreakdownRow {
  category: string | null
  original_name: string | null
  normalized_sku: string | null
  color: string | null
  size: string | null
  quantity: number
}

function normalizeCarrierName(raw: string): string {
  const text = raw?.trim().toUpperCase() || ""
  if (!text) return "DV Khac"

  if (text.includes("SPX") || text.includes("SHOPEE")) return "SPX"
  if (text.includes("GHN") || text.includes("GIAO HANG NHANH") || text.includes("GIAO HÀNG NHANH")) return "GHN"
  if (text.includes("J&T") || text.includes("J AND T") || text.includes("JT")) return "J&T"
  if (text.includes("BEST") || text.includes("BEST EXPRESS")) return "BEST"
  if (text.includes("VTP") || text.includes("VIETTEL")) return "VTP"
  if (text.includes("NJV") || text.includes("NINJA")) return "NJV"
  if (text.includes("GHTK")) return "GHTK"
  return "DV Khac"
}

async function fetchSheetData(sheetGid: string): Promise<OrderRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${sheetGid}`

  try {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) {
      console.error(`[orders-api] Failed to fetch sheet ${sheetGid}: ${response.status}`)
      return []
    }

    const csvText = await response.text()
    const rows = csvText.split("\n").slice(1)

    return rows
      .map((row) => {
        const columns = row.split(",")
        return {
          date: columns[0]?.trim() || "",
          trackingCode: columns[1]?.trim() || "",
          carrier: normalizeCarrierName(columns[2] || ""),
        }
      })
      .filter((row) => row.date && row.trackingCode)
  } catch (error) {
    console.error(`[orders-api] Error fetching sheet ${sheetGid}:`, error)
    return []
  }
}

function parseDate(dateStr: string): Date | null {
  const formats = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "MM/dd/yyyy"]

  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date())
    if (isValid(parsed)) {
      return parsed
    }
  }

  return null
}

function getOrdersInDateRange(orders: OrderRow[], from: Date, to: Date): OrderStats {
  const byDate: Record<string, number> = {}
  const ordersInRange: OrderWithDate[] = []
  let total = 0

  const fromStart = new Date(from)
  fromStart.setHours(0, 0, 0, 0)
  const toEnd = new Date(to)
  toEnd.setHours(23, 59, 59, 999)

  for (const order of orders) {
    const orderDate = parseDate(order.date)
    if (orderDate && orderDate >= fromStart && orderDate <= toEnd) {
      total++
      const dateKey = formatDate(orderDate, "yyyy-MM-dd")
      byDate[dateKey] = (byDate[dateKey] || 0) + 1
      ordersInRange.push({ ...order, parsedDate: orderDate })
    }
  }

  return { total, byDate, orders: ordersInRange }
}

function categorizeImportOrders(importOrders: OrderWithDate[], allExportTrackingCodes: Set<string>) {
  const cancelled: OrderWithDate[] = []
  const returned: OrderWithDate[] = []

  for (const order of importOrders) {
    if (allExportTrackingCodes.has(order.trackingCode)) {
      cancelled.push(order)
    } else {
      returned.push(order)
    }
  }

  return { cancelled, returned }
}

function aggregateByDate(orders: OrderWithDate[]): Record<string, number> {
  const byDate: Record<string, number> = {}
  for (const order of orders) {
    const dateKey = formatDate(order.parsedDate, "yyyy-MM-dd")
    byDate[dateKey] = (byDate[dateKey] || 0) + 1
  }
  return byDate
}

function aggregateByCarrier(orders: OrderWithDate[]): Record<string, number> {
  const byCarrier: Record<string, number> = {}
  for (const order of orders) {
    const carrier = order.carrier || "DV Khac"
    byCarrier[carrier] = (byCarrier[carrier] || 0) + 1
  }
  return byCarrier
}

function getPreviousDateRange(from: Date, to: Date): { from: Date; to: Date } {
  const currentFrom = new Date(from)
  currentFrom.setHours(0, 0, 0, 0)

  const currentTo = new Date(to)
  currentTo.setHours(23, 59, 59, 999)

  const durationMs = currentTo.getTime() - currentFrom.getTime()

  const previousTo = new Date(currentFrom)
  previousTo.setDate(previousTo.getDate() - 1)
  previousTo.setHours(23, 59, 59, 999)

  const previousFrom = new Date(previousTo.getTime() - durationMs)
  previousFrom.setHours(0, 0, 0, 0)

  return { from: previousFrom, to: previousTo }
}

function calculateComparison(current: number, previous: number): MetricComparison {
  if (current === previous) {
    return { previous, changePercent: 0, trend: "neutral" }
  }

  if (previous === 0) {
    return {
      previous,
      changePercent: current > 0 ? 100 : 0,
      trend: current > 0 ? "up" : "neutral",
    }
  }

  const changePercent = Math.round(((current - previous) / previous) * 100)

  return {
    previous,
    changePercent,
    trend: changePercent > 0 ? "up" : "down",
  }
}

function normalizePlatform(value: string | null | undefined): string {
  const text = (value || "").trim().toLowerCase()
  if (text.includes("tiktok")) return "TikTok"
  if (text.includes("shopee")) return "Shopee"
  return value?.trim() || "Khac"
}

function buildCategoryBreakdown(rows: CategoryBreakdownRow[]): Record<string, number> {
  const grouped = new Map<string, number>()

  for (const row of rows) {
    const quantity = Number(row.quantity || 0)
    if (!quantity) {
      continue
    }

    for (const classified of classifyProduct(row)) {
      grouped.set(classified.category, (grouped.get(classified.category) || 0) + quantity)
    }
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  )
}

function getSqliteBreakdowns(metricCodes: Record<MetricType, string[]>) {
  const dbPath = path.resolve(process.cwd(), "database.db")
  const empty = {
    totalExport: { TikTok: 0, Shopee: 0 },
    totalImport: { TikTok: 0, Shopee: 0 },
    cancelled: { TikTok: 0, Shopee: 0 },
    returned: { TikTok: 0, Shopee: 0 },
  }

  const emptyCategories: Record<MetricType, Record<string, number>> = {
    totalExport: {},
    totalImport: {},
    cancelled: {},
    returned: {},
  }

  if (!fs.existsSync(dbPath)) {
    return { platformBreakdown: empty, categoryBreakdown: emptyCategories }
  }

  const db = new Database(dbPath, { readonly: true })

  try {
    const platformBreakdown = { ...empty }
    const categoryBreakdown = { ...emptyCategories }

    const metricKeys: MetricType[] = ["totalExport", "totalImport", "cancelled", "returned"]

    for (const metric of metricKeys) {
      const codes = Array.from(new Set(metricCodes[metric].filter(Boolean)))
      if (!codes.length) {
        continue
      }

      const placeholders = codes.map(() => "?").join(", ")

      const platformRows = db
        .prepare(
          `
          SELECT platform, COUNT(DISTINCT order_code) as orderCount
          FROM Orders
          WHERE order_code IN (${placeholders})
          GROUP BY platform
          `
        )
        .all(...codes) as Array<{ platform: string | null; orderCount: number }>

      const platforms = { TikTok: 0, Shopee: 0 }
      for (const row of platformRows) {
        const platform = normalizePlatform(row.platform)
        if (platform === "TikTok" || platform === "Shopee") {
          platforms[platform] += Number(row.orderCount || 0)
        }
      }
      platformBreakdown[metric] = platforms

      const categoryRows = db
        .prepare(
          `
          SELECT oi.category, oi.original_name, oi.normalized_sku, oi.color, oi.size, oi.quantity
          FROM Order_Items oi
          WHERE oi.order_code IN (${placeholders})
          `
        )
        .all(...codes) as CategoryBreakdownRow[]

      categoryBreakdown[metric] = buildCategoryBreakdown(categoryRows)
    }

    return { platformBreakdown, categoryBreakdown }
  } finally {
    db.close()
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fromStr = searchParams.get("from")
  const toStr = searchParams.get("to")

  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "Missing from/to parameters" }, { status: 400 })
  }

  const from = new Date(fromStr)
  const to = new Date(toStr)

  if (!isValid(from) || !isValid(to)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
  }

  try {
    const [allExportOrders, allImportOrders] = await Promise.all([
      fetchSheetData(SHEETS.export),
      fetchSheetData(SHEETS.import),
    ])

    const allExportTrackingCodes = new Set(allExportOrders.map((o) => o.trackingCode))

    const exportStats = getOrdersInDateRange(allExportOrders, from, to)
    const importStats = getOrdersInDateRange(allImportOrders, from, to)
    const previousRange = getPreviousDateRange(from, to)
    const previousExportStats = getOrdersInDateRange(allExportOrders, previousRange.from, previousRange.to)
    const previousImportStats = getOrdersInDateRange(allImportOrders, previousRange.from, previousRange.to)

    const { cancelled, returned } = categorizeImportOrders(importStats.orders, allExportTrackingCodes)
    const { cancelled: previousCancelled, returned: previousReturned } = categorizeImportOrders(
      previousImportStats.orders,
      allExportTrackingCodes
    )

    const carrierCounts = {
      totalExport: aggregateByCarrier(exportStats.orders),
      totalImport: aggregateByCarrier(importStats.orders),
      cancelled: aggregateByCarrier(cancelled),
      returned: aggregateByCarrier(returned),
    }

    const orderLists = {
      totalExport: exportStats.orders.map((o) => ({ date: o.date, trackingCode: o.trackingCode })),
      totalImport: importStats.orders.map((o) => ({ date: o.date, trackingCode: o.trackingCode })),
      cancelled: cancelled.map((o) => ({ date: o.date, trackingCode: o.trackingCode })),
      returned: returned.map((o) => ({ date: o.date, trackingCode: o.trackingCode })),
    }

    const metricCodes: Record<MetricType, string[]> = {
      totalExport: orderLists.totalExport.map((item) => item.trackingCode),
      totalImport: orderLists.totalImport.map((item) => item.trackingCode),
      cancelled: orderLists.cancelled.map((item) => item.trackingCode),
      returned: orderLists.returned.map((item) => item.trackingCode),
    }

    const { platformBreakdown, categoryBreakdown } = getSqliteBreakdowns(metricCodes)

    return NextResponse.json({
      stats: {
        totalExport: exportStats.total,
        totalImport: importStats.total,
        cancelled: cancelled.length,
        returned: returned.length,
      },
      comparisons: {
        totalExport: calculateComparison(exportStats.total, previousExportStats.total),
        totalImport: calculateComparison(importStats.total, previousImportStats.total),
        cancelled: calculateComparison(cancelled.length, previousCancelled.length),
        returned: calculateComparison(returned.length, previousReturned.length),
      },
      chartData: {
        totalExport: exportStats.byDate,
        totalImport: importStats.byDate,
        cancelled: aggregateByDate(cancelled),
        returned: aggregateByDate(returned),
      },
      carrierCounts,
      platformBreakdown,
      categoryBreakdown,
      orderLists,
      meta: {
        exportOrdersCount: allExportOrders.length,
        importOrdersCount: allImportOrders.length,
        dateRange: { from: fromStr, to: toStr },
        previousDateRange: {
          from: formatDate(previousRange.from, "yyyy-MM-dd"),
          to: formatDate(previousRange.to, "yyyy-MM-dd"),
        },
      },
    })
  } catch (error) {
    console.error("[orders-api] API error:", error)
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 })
  }
}
