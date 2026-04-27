import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { format, isValid } from "date-fns"
import { classifyProduct } from "@/lib/production-classification"
import {
  ensureSheetCacheFresh,
  getCachedSheetRowCount,
  readCachedSheetOrdersInRange,
  readImportOrdersWithStatusInRange,
} from "@/lib/sheet-cache"

export const runtime = "nodejs"

type MetricType = "totalExport" | "totalImport" | "cancelled" | "returned"

interface OrderItem {
  date: string
  trackingCode: string
  carrier?: string
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

interface VariantBreakdownItem {
  variant: string
  sku: string
  color: string
  quantity: number
}

interface OperationsSnapshot {
  returnRate: number
  pendingShipmentCount: number
  printedOrderCount: number
  pendingShipmentOrders: Array<{
    date: string
    trackingCode: string
  }>
}

interface ShopBreakdownRow {
  shop: string
  totalExport: number
  totalImport: number
  cancelled: number
  returned: number
}

interface ShopExportProductRow {
  originalName: string
  normalizedSku: string
  quantity: number
}

interface ShopInsightRow extends ShopBreakdownRow {
  returnRate: number
  cancelRate: number
  exportProducts: ShopExportProductRow[]
}

const SQLITE_PARAMETER_LIMIT = 900

function normalizeTrackingCode(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, "").toUpperCase()
}

function normalizeShopName(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase()
}

function normalizePlatform(value: string | null | undefined): string {
  const text = (value || "").trim().toLowerCase()
  if (text.includes("tiktok")) return "tiktok"
  if (text.includes("shopee")) return "shopee"
  return text
}

function parseSelectedShop(value: string) {
  const trimmed = value.trim()
  if (trimmed.toUpperCase().startsWith("TT - ")) {
    return {
      platform: "tiktok",
      shopName: normalizeShopName(trimmed.slice(5)),
    }
  }

  return {
    platform: "shopee",
    shopName: normalizeShopName(trimmed),
  }
}

function aggregateRows(rows: Array<{ key: string; count: number }>): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.count || 0)]))
}

function aggregateOrdersByKey(orders: OrderItem[], getKey: (order: OrderItem) => string): Record<string, number> {
  const counts = new Map<string, number>()

  for (const order of orders) {
    const key = getKey(order).trim()
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  return Object.fromEntries(
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  )
}

function getPreviousDateRange(from: Date, to: Date): { from: string; to: string } {
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

  return {
    from: format(previousFrom, "yyyy-MM-dd"),
    to: format(previousTo, "yyyy-MM-dd"),
  }
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

function normalizePlatformLabel(value: string | null | undefined): string {
  const text = normalizePlatform(value)
  if (text === "tiktok") return "TikTok"
  if (text === "shopee") return "Shopee"
  return value?.trim() || "Khac"
}

function formatShopOption(shopName: string | null | undefined, platform: string | null | undefined) {
  const normalizedShop = normalizeShopName(shopName)
  const normalizedPlatform = (platform || "").trim().toLowerCase()
  if (!normalizedShop) return ""
  if (normalizedPlatform.includes("tiktok")) {
    return `TT - ${normalizedShop}`
  }
  return normalizedShop
}

function buildCategoryBreakdown(rows: CategoryBreakdownRow[]): Record<string, number> {
  const grouped = new Map<string, number>()

  for (const row of rows) {
    const quantity = Number(row.quantity || 0)
    if (!quantity) continue

    for (const classified of classifyProduct(row)) {
      grouped.set(classified.category, (grouped.get(classified.category) || 0) + quantity)
    }
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  )
}

function deriveVariantParts(row: CategoryBreakdownRow) {
  const rawSku = row.normalized_sku?.trim() || ""
  const parts = rawSku.split("-").map((part) => part.trim()).filter(Boolean)

  const color =
    row.color?.trim() ||
    (parts.length >= 2 ? parts[parts.length - (parts.length >= 3 ? 2 : 1)] : "") ||
    "Khác"

  let sku = rawSku
  if (parts.length >= 3) {
    sku = parts.slice(0, -2).join("-")
  } else if (parts.length === 2) {
    sku = parts[0]
  }

  sku = sku.trim() || row.original_name?.trim() || "Khác"

  return {
    sku,
    color,
    variant: `${sku} - ${color}`,
  }
}

function buildCategoryVariantBreakdown(rows: CategoryBreakdownRow[]): Record<string, VariantBreakdownItem[]> {
  const grouped = new Map<string, Map<string, VariantBreakdownItem>>()

  for (const row of rows) {
    const quantity = Number(row.quantity || 0)
    if (!quantity) continue

    const variantParts = deriveVariantParts(row)
    for (const classified of classifyProduct(row)) {
      if (!grouped.has(classified.category)) {
        grouped.set(classified.category, new Map<string, VariantBreakdownItem>())
      }

      const categoryVariants = grouped.get(classified.category)!
      const existing = categoryVariants.get(variantParts.variant)
      if (existing) {
        existing.quantity += quantity
      } else {
        categoryVariants.set(variantParts.variant, {
          variant: variantParts.variant,
          sku: variantParts.sku,
          color: variantParts.color,
          quantity,
        })
      }
    }
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([category, variants]) => [
      category,
      Array.from(variants.values())
        .sort((left, right) => right.quantity - left.quantity || left.variant.localeCompare(right.variant)),
    ])
  )
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function getOrdersDbPath() {
  return path.resolve(process.cwd(), "backend", "database.db")
}

function getSelectedShops(searchParams: URLSearchParams): string[] {
  return Array.from(
    new Set(
      searchParams
        .getAll("shop")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function getShopCodeSet(selectedShops: string[]): Set<string> | null {
  if (!selectedShops.length) return null

  const dbPath = getOrdersDbPath()
  if (!fs.existsSync(dbPath)) {
    return new Set()
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const parsedSelectedShops = selectedShops.map(parseSelectedShop)
    const rows = database
      .prepare(
        `
        SELECT DISTINCT order_code, shop_name, platform
        FROM Orders
        WHERE order_code IS NOT NULL
          AND shop_name IS NOT NULL
          AND TRIM(shop_name) != ''
        `
      )
      .all() as Array<{ order_code: string | null; shop_name: string | null; platform: string | null }>

    const codeSet = new Set<string>()
    for (const row of rows) {
      const rowShopName = normalizeShopName(row.shop_name)
      const rowPlatform = normalizePlatform(row.platform)
      if (!parsedSelectedShops.some((shop) => shop.shopName === rowShopName && shop.platform === rowPlatform)) continue

      const code = normalizeTrackingCode(row.order_code)
      if (code) {
        codeSet.add(code)
      }
    }

    return codeSet
  } finally {
    database.close()
  }
}

function filterOrdersByShop<T extends { trackingCode: string }>(orders: T[], allowedCodes: Set<string> | null): T[] {
  if (!allowedCodes) return orders
  return orders.filter((order) => allowedCodes.has(normalizeTrackingCode(order.trackingCode)))
}

function getOperationsSnapshot(
  from: string,
  to: string,
  exportedCodes: string[],
  selectedShops: string[]
): OperationsSnapshot {
  const dbPath = path.resolve(process.cwd(), "backend", "database.db")
  const exportedCodeSet = new Set(exportedCodes.map((code) => normalizeTrackingCode(code)).filter(Boolean))

  if (!fs.existsSync(dbPath)) {
    return {
      returnRate: 0,
      pendingShipmentCount: 0,
      printedOrderCount: 0,
      pendingShipmentOrders: [],
    }
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const parsedSelectedShops = selectedShops.map(parseSelectedShop)
    const shopFilter = parsedSelectedShops.length
      ? `AND (${parsedSelectedShops
          .map(() => "(shop_name IS NOT NULL AND lower(trim(shop_name)) = ? AND lower(trim(platform)) LIKE ?)")
          .join(" OR ")})`
      : ""

    const printedRows = database
      .prepare(
        `
        SELECT DISTINCT order_code
             , substr(created_at, 1, 10) AS created_date
        FROM Orders
        WHERE order_code IS NOT NULL
          AND substr(created_at, 1, 10) BETWEEN ? AND ?
          ${shopFilter}
        `
      )
      .all(
        from,
        to,
        ...parsedSelectedShops.flatMap((shop) => [shop.shopName, `%${shop.platform}%`])
      ) as Array<{
        order_code: string | null
        created_date: string | null
      }>

    const printedOrders = printedRows
      .map((row) => ({
        trackingCode: normalizeTrackingCode(row.order_code),
        date: row.created_date || "",
      }))
      .filter((row) => row.trackingCode)

    const pendingShipmentOrders = printedOrders
      .filter((row) => !exportedCodeSet.has(row.trackingCode))
      .sort((left, right) => left.date.localeCompare(right.date) || left.trackingCode.localeCompare(right.trackingCode))

    return {
      returnRate: 0,
      pendingShipmentCount: pendingShipmentOrders.length,
      printedOrderCount: printedOrders.length,
      pendingShipmentOrders,
    }
  } finally {
    database.close()
  }
}

function getSqliteBreakdowns(metricCodes: Record<MetricType, string[]>) {
  const dbPath = path.resolve(process.cwd(), "backend", "database.db")
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
  const emptyVariants: Record<MetricType, Record<string, VariantBreakdownItem[]>> = {
    totalExport: {},
    totalImport: {},
    cancelled: {},
    returned: {},
  }

  if (!fs.existsSync(dbPath)) {
    return { platformBreakdown: empty, categoryBreakdown: emptyCategories, categoryVariantBreakdown: emptyVariants }
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const platformBreakdown = { ...empty }
    const categoryBreakdown = { ...emptyCategories }
    const categoryVariantBreakdown = { ...emptyVariants }

    for (const metric of ["totalExport", "totalImport", "cancelled", "returned"] as const) {
      const codes = Array.from(new Set(metricCodes[metric].filter(Boolean)))
      if (!codes.length) continue

      const platforms = { TikTok: 0, Shopee: 0 }
      const categoryRows: CategoryBreakdownRow[] = []

      for (const codeChunk of chunkValues(codes, SQLITE_PARAMETER_LIMIT)) {
        const placeholders = codeChunk.map(() => "?").join(", ")

        const platformRows = database
          .prepare(
            `
            SELECT platform, COUNT(DISTINCT order_code) AS orderCount
            FROM Orders
            WHERE order_code IN (${placeholders})
            GROUP BY platform
            `
          )
          .all(...codeChunk) as Array<{ platform: string | null; orderCount: number }>

        for (const row of platformRows) {
          const platform = normalizePlatformLabel(row.platform)
          if (platform === "TikTok" || platform === "Shopee") {
            platforms[platform] += Number(row.orderCount || 0)
          }
        }

        const itemRows = database
          .prepare(
            `
            SELECT oi.category, oi.original_name, oi.normalized_sku, oi.color, oi.size, oi.quantity
            FROM Order_Items oi
            WHERE oi.order_code IN (${placeholders})
            `
          )
          .all(...codeChunk) as CategoryBreakdownRow[]

        categoryRows.push(...itemRows)
      }

      platformBreakdown[metric] = platforms
      categoryBreakdown[metric] = buildCategoryBreakdown(categoryRows)
      categoryVariantBreakdown[metric] = buildCategoryVariantBreakdown(categoryRows)
    }

    return { platformBreakdown, categoryBreakdown, categoryVariantBreakdown }
  } finally {
    database.close()
  }
}

function getShopBreakdown(metricCodes: Record<MetricType, string[]>): ShopBreakdownRow[] {
  const dbPath = path.resolve(process.cwd(), "backend", "database.db")
  if (!fs.existsSync(dbPath)) {
    return []
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const grouped = new Map<string, ShopBreakdownRow>()

    const registerMetric = (
      metric: "totalExport" | "totalImport" | "cancelled" | "returned",
      codes: string[]
    ) => {
      const uniqueCodes = Array.from(new Set(codes.filter(Boolean)))
      if (!uniqueCodes.length) return

      for (const codeChunk of chunkValues(uniqueCodes, SQLITE_PARAMETER_LIMIT)) {
        const placeholders = codeChunk.map(() => "?").join(", ")
        const rows = database
          .prepare(
            `
            SELECT DISTINCT order_code, shop_name, platform
            FROM Orders
            WHERE order_code IN (${placeholders})
              AND order_code IS NOT NULL
            `
          )
          .all(...codeChunk) as Array<{
            order_code: string | null
            shop_name: string | null
            platform: string | null
          }>

        for (const row of rows) {
          const shop = formatShopOption(row.shop_name, row.platform) || "Chưa gán shop"
          const existing = grouped.get(shop) ?? {
            shop,
            totalExport: 0,
            totalImport: 0,
            cancelled: 0,
            returned: 0,
          }
          existing[metric] += 1
          grouped.set(shop, existing)
        }
      }
    }

    registerMetric("totalExport", metricCodes.totalExport)
    registerMetric("totalImport", metricCodes.totalImport)
    registerMetric("cancelled", metricCodes.cancelled)
    registerMetric("returned", metricCodes.returned)

    return Array.from(grouped.values()).sort((left, right) => {
      if (right.totalExport !== left.totalExport) {
        return right.totalExport - left.totalExport
      }
      const leftImport = left.cancelled + left.returned
      const rightImport = right.cancelled + right.returned
      if (rightImport !== leftImport) {
        return rightImport - leftImport
      }
      return left.shop.localeCompare(right.shop, "vi")
    })
  } finally {
    database.close()
  }
}

function getShopInsights(metricCodes: Record<MetricType, string[]>): ShopInsightRow[] {
  const dbPath = path.resolve(process.cwd(), "backend", "database.db")
  if (!fs.existsSync(dbPath)) {
    return []
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const grouped = new Map<string, ShopInsightRow>()
    const exportCodesByShop = new Map<string, Set<string>>()

    const registerMetric = (
      metric: "totalExport" | "totalImport" | "cancelled" | "returned",
      codes: string[]
    ) => {
      const uniqueCodes = Array.from(new Set(codes.filter(Boolean)))
      if (!uniqueCodes.length) return

      for (const codeChunk of chunkValues(uniqueCodes, SQLITE_PARAMETER_LIMIT)) {
        const placeholders = codeChunk.map(() => "?").join(", ")
        const rows = database
          .prepare(
            `
            SELECT DISTINCT order_code, shop_name, platform
            FROM Orders
            WHERE order_code IN (${placeholders})
              AND order_code IS NOT NULL
            `
          )
          .all(...codeChunk) as Array<{
            order_code: string | null
            shop_name: string | null
            platform: string | null
          }>

        for (const row of rows) {
          const shop = formatShopOption(row.shop_name, row.platform) || "Chưa gán shop"
          const existing = grouped.get(shop) ?? {
            shop,
            totalExport: 0,
            totalImport: 0,
            cancelled: 0,
            returned: 0,
            returnRate: 0,
            cancelRate: 0,
            exportProducts: [],
          }
          existing[metric] += 1
          grouped.set(shop, existing)

          if (metric === "totalExport" && row.order_code) {
            if (!exportCodesByShop.has(shop)) {
              exportCodesByShop.set(shop, new Set())
            }
            exportCodesByShop.get(shop)!.add(row.order_code)
          }
        }
      }
    }

    registerMetric("totalExport", metricCodes.totalExport)
    registerMetric("totalImport", metricCodes.totalImport)
    registerMetric("cancelled", metricCodes.cancelled)
    registerMetric("returned", metricCodes.returned)

    const productGroups = new Map<string, Map<string, ShopExportProductRow>>()

    for (const [shop, codesSet] of exportCodesByShop.entries()) {
      const codes = Array.from(codesSet)
      if (!codes.length) continue

      for (const codeChunk of chunkValues(codes, SQLITE_PARAMETER_LIMIT)) {
        const placeholders = codeChunk.map(() => "?").join(", ")
        const rows = database
          .prepare(
            `
            SELECT original_name, normalized_sku, quantity
            FROM Order_Items
            WHERE order_code IN (${placeholders})
            `
          )
          .all(...codeChunk) as Array<{
            original_name: string | null
            normalized_sku: string | null
            quantity: number
          }>

        if (!productGroups.has(shop)) {
          productGroups.set(shop, new Map())
        }
        const products = productGroups.get(shop)!

        for (const row of rows) {
          const name = (row.original_name || row.normalized_sku || "Sản phẩm chưa rõ").trim()
          const sku = (row.normalized_sku || "").trim()
          const key = `${name}__${sku}`
          const existing =
            products.get(key) ??
            {
              originalName: name,
              normalizedSku: sku,
              quantity: 0,
            }
          existing.quantity += Number(row.quantity || 0)
          products.set(key, existing)
        }
      }
    }

    return Array.from(grouped.values())
      .map((row) => {
        const exportProducts = Array.from(productGroups.get(row.shop)?.values() ?? [])
          .filter((item) => item.quantity > 0)
          .sort((left, right) => right.quantity - left.quantity || left.originalName.localeCompare(right.originalName, "vi"))

        return {
          ...row,
          returnRate: row.totalExport ? Number(((row.returned / row.totalExport) * 100).toFixed(1)) : 0,
          cancelRate: row.totalExport ? Number(((row.cancelled / row.totalExport) * 100).toFixed(1)) : 0,
          exportProducts,
        }
      })
      .sort((left, right) => {
        if (right.totalExport !== left.totalExport) {
          return right.totalExport - left.totalExport
        }
        if (right.totalImport !== left.totalImport) {
          return right.totalImport - left.totalImport
        }
        return left.shop.localeCompare(right.shop, "vi")
      })
  } finally {
    database.close()
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fromStr = searchParams.get("from")
  const toStr = searchParams.get("to")
  const selectedShops = getSelectedShops(searchParams)

  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "Missing from/to parameters" }, { status: 400 })
  }

  const from = new Date(fromStr)
  const to = new Date(toStr)

  if (!isValid(from) || !isValid(to)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
  }

  try {
    const cacheResult = await ensureSheetCacheFresh()
    const shopCodeSet = getShopCodeSet(selectedShops)

    const previousRange = getPreviousDateRange(from, to)

    const exportOrders = filterOrdersByShop(readCachedSheetOrdersInRange("export", fromStr, toStr), shopCodeSet)
    const importOrders = filterOrdersByShop(readCachedSheetOrdersInRange("import", fromStr, toStr), shopCodeSet)
    const importOrdersWithStatus = filterOrdersByShop(readImportOrdersWithStatusInRange(fromStr, toStr), shopCodeSet)

    const cancelledOrders = importOrdersWithStatus.filter((order) => order.status === "cancelled")
    const returnedOrders = importOrdersWithStatus.filter((order) => order.status === "returned")

    const previousExportTotal = filterOrdersByShop(
      readCachedSheetOrdersInRange("export", previousRange.from, previousRange.to),
      shopCodeSet
    ).length
    const previousImportTotal = filterOrdersByShop(
      readCachedSheetOrdersInRange("import", previousRange.from, previousRange.to),
      shopCodeSet
    ).length
    const previousImportStatusOrders = filterOrdersByShop(
      readImportOrdersWithStatusInRange(previousRange.from, previousRange.to),
      shopCodeSet
    )
    const previousCancelledTotal = previousImportStatusOrders.filter((order) => order.status === "cancelled").length
    const previousReturnedTotal = previousImportStatusOrders.filter((order) => order.status === "returned").length

    const carrierCounts = {
      totalExport: aggregateOrdersByKey(exportOrders, (order) => order.carrier || "DV Khac"),
      totalImport: aggregateOrdersByKey(importOrders, (order) => order.carrier || "DV Khac"),
      cancelled: aggregateOrdersByKey(cancelledOrders, (order) => order.carrier || "DV Khac"),
      returned: aggregateOrdersByKey(returnedOrders, (order) => order.carrier || "DV Khac"),
    }

    const orderLists = {
      totalExport: exportOrders.map((order) => ({ date: order.date, trackingCode: order.trackingCode })),
      totalImport: importOrders.map((order) => ({ date: order.date, trackingCode: order.trackingCode })),
      cancelled: cancelledOrders.map((order) => ({ date: order.date, trackingCode: order.trackingCode })),
      returned: returnedOrders.map((order) => ({ date: order.date, trackingCode: order.trackingCode })),
    }

    const metricCodes: Record<MetricType, string[]> = {
      totalExport: orderLists.totalExport.map((item) => item.trackingCode),
      totalImport: orderLists.totalImport.map((item) => item.trackingCode),
      cancelled: orderLists.cancelled.map((item) => item.trackingCode),
      returned: orderLists.returned.map((item) => item.trackingCode),
    }

    const { platformBreakdown, categoryBreakdown, categoryVariantBreakdown } = getSqliteBreakdowns(metricCodes)
    const shopBreakdown = getShopBreakdown(metricCodes)
    const shopInsights = getShopInsights(metricCodes)
    const operations = getOperationsSnapshot(fromStr, toStr, metricCodes.totalExport, selectedShops)
    operations.returnRate = Number(((importOrders.length / Math.max(exportOrders.length, 1)) * 100).toFixed(1))

    return NextResponse.json({
      stats: {
        totalExport: exportOrders.length,
        totalImport: importOrders.length,
        cancelled: cancelledOrders.length,
        returned: returnedOrders.length,
      },
      comparisons: {
        totalExport: calculateComparison(exportOrders.length, previousExportTotal),
        totalImport: calculateComparison(importOrders.length, previousImportTotal),
        cancelled: calculateComparison(cancelledOrders.length, previousCancelledTotal),
        returned: calculateComparison(returnedOrders.length, previousReturnedTotal),
      },
      chartData: {
        totalExport: aggregateOrdersByKey(orderLists.totalExport, (order) => order.date),
        totalImport: aggregateOrdersByKey(orderLists.totalImport, (order) => order.date),
        cancelled: aggregateOrdersByKey(orderLists.cancelled, (order) => order.date),
        returned: aggregateOrdersByKey(orderLists.returned, (order) => order.date),
      },
      carrierCounts,
      platformBreakdown,
      shopBreakdown,
      shopInsights,
      categoryBreakdown,
      categoryVariantBreakdown,
      operations,
      orderLists,
      meta: {
        exportOrdersCount: getCachedSheetRowCount("export"),
        importOrdersCount: getCachedSheetRowCount("import"),
        dateRange: { from: fromStr, to: toStr },
        previousDateRange: previousRange,
        selectedShops,
        cacheStatus: cacheResult,
      },
    })
  } catch (error) {
    console.error("[orders-api] Failed to process orders:", error)
    return NextResponse.json({ error: "Failed to process orders" }, { status: 500 })
  }
}
