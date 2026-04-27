import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import {
  ensureHoanHuyShopeeCacheFresh,
  ensureSheetCacheFresh,
  readCachedSheetOrders,
  readHoanHuyShopeeRecords,
} from "@/lib/sheet-cache"

interface OrderItemRow {
  order_code: string | null
  original_name: string | null
  normalized_sku: string | null
  quantity: number | null
}

interface OrderMetaRow {
  order_code: string | null
  platform: string | null
  carrier: string | null
  shop_name: string | null
  ship_date: string | null
  created_at: string | null
}

interface SearchTimelineStep {
  label: string
  time: string | null
  completed: boolean
}

interface PlatformReport {
  reportDate: string | null
  status: "cancelled" | "returned"
  statusLabel: string
  outboundTrackingCode: string
  returnTrackingCode: string
  shopName: string | null
  productName: string | null
}

interface SearchOrderItem {
  name: string
  sku: string | null
  quantity: number
}

interface SearchOrderDetails {
  platform: string | null
  shopName: string | null
  carrier: string | null
  createdAt: string | null
  shipDate: string | null
  items: SearchOrderItem[]
  timeline: SearchTimelineStep[]
}

interface SearchResult {
  trackingCode: string
  status: "exported" | "imported" | "cancelled" | "returned" | "not_found"
  exportDate: string | null
  importDate: string | null
  statusLabel: string
  orderDetails: SearchOrderDetails | null
}

function normalizeTrackingCode(value: string | null | undefined): string {
  const compact = (value || "").replace(/\s+/g, "").toUpperCase()
  if (compact === "#ERROR!" || compact === "ERROR" || compact === "N/A") return ""
  return compact.replace(/[^A-Z0-9]/g, "")
}

function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function formatPlatformLabel(value: string | null | undefined): string | null {
  const text = (value || "").trim().toLowerCase()
  if (!text) return null
  if (text.includes("tiktok")) return "TikTok"
  if (text.includes("shopee")) return "Shopee"
  return value?.trim() || null
}

function getOrdersDbPath() {
  return path.resolve(process.cwd(), "backend", "database.db")
}

function buildTimeline(
  order: Pick<SearchOrderDetails, "createdAt" | "shipDate"> | undefined,
  status: SearchResult["status"],
  exportDate: string | null,
  importDate: string | null,
  platformReportDate: string | null
): SearchTimelineStep[] {
  return [
    {
      label: "Đã in đơn",
      time: order?.createdAt || null,
      completed: Boolean(order?.createdAt),
    },
    {
      label: "Đã xuất kho",
      time: exportDate || order?.shipDate || null,
      completed: Boolean(exportDate || order?.shipDate),
    },
    {
      label: "Sàn báo hoàn / hủy",
      time: status === "cancelled" || status === "returned" ? platformReportDate : null,
      completed: status === "cancelled" || status === "returned",
    },
    {
      label: "Đã về kho",
      time: importDate,
      completed: Boolean(importDate),
    },
  ]
}

function getPlatformReportMap(): Map<string, PlatformReport> {
  const reportMap = new Map<string, PlatformReport>()
  const records = readHoanHuyShopeeRecords()

  for (const record of records) {
    const normalizedType = normalizeSearchText(record.loaiDon)
    const isCancelled = normalizedType.includes("huy")
    const report: PlatformReport = {
      reportDate: record.thoiGianHoanVe?.trim() || null,
      status: isCancelled ? "cancelled" : "returned",
      statusLabel: isCancelled ? "Đơn hủy" : "Trả hàng hoàn tiền",
      outboundTrackingCode: normalizeTrackingCode(record.maVanDonDi),
      returnTrackingCode: normalizeTrackingCode(record.maVanDonVe),
      shopName: record.tenShop?.trim() || null,
      productName: record.sanPham?.trim() || null,
    }

    for (const normalizedCode of [report.outboundTrackingCode, report.returnTrackingCode]) {
      if (!normalizedCode) continue

      const existing = reportMap.get(normalizedCode)
      if (!existing || (!existing.reportDate && report.reportDate)) {
        reportMap.set(normalizedCode, report)
      }
    }
  }

  return reportMap
}

function getOrderDetailsMap(trackingCodes: string[]): Map<string, SearchOrderDetails> {
  const dbPath = getOrdersDbPath()
  const detailsMap = new Map<string, SearchOrderDetails>()

  if (!trackingCodes.length || !fs.existsSync(dbPath)) {
    return detailsMap
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const placeholders = trackingCodes.map(() => "?").join(", ")

    const orderRows = database
      .prepare(
        `
        SELECT order_code, platform, carrier, shop_name, ship_date, created_at
        FROM Orders
        WHERE order_code IN (${placeholders})
        ORDER BY created_at DESC
        `
      )
      .all(...trackingCodes) as OrderMetaRow[]

    const itemRows = database
      .prepare(
        `
        SELECT order_code, original_name, normalized_sku, quantity
        FROM Order_Items
        WHERE order_code IN (${placeholders})
        `
      )
      .all(...trackingCodes) as OrderItemRow[]

    const itemMap = new Map<string, SearchOrderItem[]>()
    for (const row of itemRows) {
      const code = normalizeTrackingCode(row.order_code)
      if (!code) continue

      const item: SearchOrderItem = {
        name: row.original_name?.trim() || row.normalized_sku?.trim() || "Sản phẩm chưa rõ",
        sku: row.normalized_sku?.trim() || null,
        quantity: Number(row.quantity || 0),
      }

      if (!itemMap.has(code)) {
        itemMap.set(code, [])
      }
      itemMap.get(code)!.push(item)
    }

    for (const row of orderRows) {
      const code = normalizeTrackingCode(row.order_code)
      if (!code || detailsMap.has(code)) continue

      detailsMap.set(code, {
        platform: formatPlatformLabel(row.platform),
        shopName: row.shop_name?.trim() || null,
        carrier: row.carrier?.trim() || null,
        createdAt: row.created_at?.trim() || null,
        shipDate: row.ship_date?.trim() || null,
        items: itemMap.get(code) || [],
        timeline: [],
      })
    }

    return detailsMap
  } finally {
    database.close()
  }
}

function buildFallbackDetails(platformReport: PlatformReport | null): SearchOrderDetails {
  return {
    platform: platformReport ? "Shopee" : null,
    shopName: platformReport?.shopName || null,
    carrier: null,
    createdAt: null,
    shipDate: null,
    items: platformReport?.productName
      ? [
          {
            name: platformReport.productName,
            sku: null,
            quantity: 1,
          },
        ]
      : [],
    timeline: [],
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const trackingCodes: string[] = body.trackingCodes || []

    if (!trackingCodes.length) {
      return NextResponse.json({ error: "No tracking codes provided" }, { status: 400 })
    }

    await Promise.all([ensureSheetCacheFresh(), ensureHoanHuyShopeeCacheFresh()])
    const exportOrders = readCachedSheetOrders("export")
    const importOrders = readCachedSheetOrders("import")
    const platformReportMap = getPlatformReportMap()

    const exportMap = new Map<string, string>()
    for (const order of exportOrders) {
      exportMap.set(normalizeTrackingCode(order.trackingCode), order.date)
    }

    const importMap = new Map<string, string>()
    for (const order of importOrders) {
      importMap.set(normalizeTrackingCode(order.trackingCode), order.date)
    }

    const normalizedCodes = trackingCodes.map((code) => normalizeTrackingCode(code.trim())).filter(Boolean)
    const detailLookupCodes = new Set(normalizedCodes)
    for (const normalizedCode of normalizedCodes) {
      const platformReport = platformReportMap.get(normalizedCode)
      if (platformReport?.outboundTrackingCode) {
        detailLookupCodes.add(platformReport.outboundTrackingCode)
      }
    }
    const orderDetailsMap = getOrderDetailsMap(Array.from(detailLookupCodes))

    const results: SearchResult[] = trackingCodes.map((code) => {
      const trimmedCode = code.trim()
      const normalizedCode = normalizeTrackingCode(trimmedCode)
      const platformReport = platformReportMap.get(normalizedCode) || null
      const outboundCode = platformReport?.outboundTrackingCode || normalizedCode
      const returnCode = platformReport?.returnTrackingCode || normalizedCode
      const exportDate = exportMap.get(normalizedCode) || exportMap.get(outboundCode) || null
      const importDate = importMap.get(normalizedCode) || importMap.get(returnCode) || importMap.get(outboundCode) || null
      const platformReportDate = platformReport?.reportDate || null

      let status: SearchResult["status"]
      let statusLabel: string

      if (platformReport) {
        status = platformReport.status
        statusLabel = platformReport.statusLabel
      } else if (exportDate && importDate) {
        status = "cancelled"
        statusLabel = "Đơn hủy"
      } else if (importDate && !exportDate) {
        status = "returned"
        statusLabel = "Trả hàng hoàn tiền"
      } else if (exportDate && !importDate) {
        status = "exported"
        statusLabel = "Đã xuất - Chưa về kho"
      } else {
        status = "not_found"
        statusLabel = "Không tìm thấy"
      }

      const details = orderDetailsMap.get(normalizedCode) || orderDetailsMap.get(outboundCode)
      const fallbackDetails = buildFallbackDetails(platformReport)

      return {
        trackingCode: trimmedCode,
        status,
        exportDate,
        importDate,
        statusLabel,
        orderDetails: details
          ? {
              ...details,
              timeline: buildTimeline(details, status, exportDate, importDate, platformReportDate),
            }
          : {
              ...fallbackDetails,
              timeline: buildTimeline(fallbackDetails, status, exportDate, importDate, platformReportDate),
            },
      }
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error("[orders-search-api] Failed to search orders:", error)
    return NextResponse.json({ error: "Failed to search" }, { status: 500 })
  }
}
