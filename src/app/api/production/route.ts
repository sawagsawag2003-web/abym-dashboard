import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { eachDayOfInterval, isValid, parse } from "date-fns"
import { classifyProduct as sharedClassifyProduct } from "@/lib/production-classification"
import { ensureSheetCacheFresh, readCachedSheetOrders } from "@/lib/sheet-cache"

export const runtime = "nodejs"
const RESPONSE_CACHE_TTL_MS = 60_000

type SheetRow = {
  date: string
  trackingCode: string
  carrier?: string
}

type SqliteRow = {
  order_code: string
  category: string | null
  original_name: string | null
  normalized_sku: string | null
  color: string | null
  size: string | null
  quantity: number
}

type DetailRow = {
  level_2: string
  quantity: number
}

type CategoryRow = {
  category: string
  total_production: number
  details: DetailRow[]
}

type ClassifiedRow = {
  category: string
  color: string
  size: string
}

type TimeSeriesPoint = {
  date: string
  total: number
}

type ParsedSheetRow = {
  date: Date
  trackingCode: string
}

type PreparedSheetData = {
  lastSyncedAt: number | null
  exportRows: ParsedSheetRow[]
  importRows: ParsedSheetRow[]
  allExportCodes: Set<string>
}

type ProductionApiPayload = {
  startDate: string
  endDate: string
  data: CategoryRow[]
  timeSeries: Record<string, TimeSeriesPoint[]>
}

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

let preparedSheetDataCache: PreparedSheetData | null = null
const productionResponseCache = new Map<string, { expiresAt: number; payload: ProductionApiPayload }>()

function parseSheetDate(dateStr: string): Date | null {
  const formats = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "MM/dd/yyyy"]

  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date())
    if (isValid(parsed)) {
      return parsed
    }
  }

  return null
}

function normalizeDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function normalizeRuleText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä‘/g, "d")
    .replace(/Ä/g, "D")
    .toUpperCase()
    .trim()
}

function deriveColorAndSize(row: SqliteRow): { color: string; size: string } {
  const currentColor = row.color?.trim() || "Khong xac dinh"
  const currentSize = row.size?.trim() || "Khong xac dinh"

  if (currentColor !== "Khong xac dinh" && currentSize !== "Khong xac dinh") {
    return { color: currentColor, size: currentSize }
  }

  const normalizedSku = row.normalized_sku?.trim()
  if (!normalizedSku) {
    return { color: currentColor, size: currentSize }
  }

  const parts = normalizedSku.split("-").map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) {
    return { color: currentColor, size: currentSize }
  }

  return {
    color: currentColor !== "Khong xac dinh" ? currentColor : parts.slice(0, -1).join("-"),
    size: currentSize !== "Khong xac dinh" ? currentSize : parts[parts.length - 1],
  }
}

function classifyProduct(row: SqliteRow): ClassifiedRow[] {
  const sourceText = normalizeRuleText(
    [row.normalized_sku, row.original_name, row.category].filter(Boolean).join(" ")
  )
  const { color, size } = deriveColorAndSize(row)

  if (/^BOP(?:-|$)/.test(sourceText)) {
    return [
      { category: "BoP Kids Tici", color, size },
      { category: "Raglan Kids Tici", color, size },
      { category: "Short Kids Tici", color, size },
    ]
  }

  if (/^BO(?:-|$)/.test(sourceText)) {
    return [
      { category: "Bo Kids Tici", color, size },
      { category: "Ao Kids Tici", color, size },
      { category: "Short Kids Tici", color, size },
    ]
  }

  if (/^KT(?:-|$)/.test(sourceText)) {
    return [{ category: "Ao Kids Tici", color, size }]
  }

  if (/^KQ(?:-|$)/.test(sourceText)) {
    return [{ category: "Short Kids Tici", color, size }]
  }

  if (/^KP(?:-|$)/.test(sourceText)) {
    return [{ category: "Raglan Kids Tici", color, size }]
  }

  if (/QDA1/.test(sourceText)) {
    return [{ category: "SHORT A Ni", color, size }]
  }

  if (/GK01|JEANKIEU01/.test(sourceText)) {
    return [{ category: "JEAN GK", color, size }]
  }

  if (/RETRODAM|RETRONHAT|DENTUYEN|XANHNHAT|XANHDAM/.test(sourceText)) {
    return [{ category: "JEAN THUONG", color, size }]
  }

  if (/BG01/.test(sourceText)) {
    return [{ category: "QN Baggy", color, size }]
  }

  if (/QN02|QN03|QNTRON/.test(sourceText)) {
    return [{ category: "QN Ong Rong", color, size }]
  }

  if (/SWT|WS/.test(sourceText)) {
    return [{ category: "SWEATER", color, size }]
  }

  return [{ category: "SU", color, size }]
}

function getCodesInRange(rows: ParsedSheetRow[], startDate: Date, endDate: Date): Set<string> {
  const from = new Date(startDate)
  from.setHours(0, 0, 0, 0)

  const to = new Date(endDate)
  to.setHours(23, 59, 59, 999)

  const codes = new Set<string>()

  for (const row of rows) {
    if (row.date >= from && row.date <= to) {
      codes.add(row.trackingCode)
    }
  }

  return codes
}

function getCodeDateMap(rows: ParsedSheetRow[], startDate: Date, endDate: Date, allowedCodes?: Set<string>) {
  const from = new Date(startDate)
  from.setHours(0, 0, 0, 0)

  const to = new Date(endDate)
  to.setHours(23, 59, 59, 999)

  const codeDateMap = new Map<string, string>()

  for (const row of rows) {
    if (allowedCodes && !allowedCodes.has(row.trackingCode)) continue

    if (row.date < from || row.date > to) continue

    const dateKey = normalizeDateKey(row.date)
    const previousDate = codeDateMap.get(row.trackingCode)

    if (!previousDate || dateKey < previousDate) {
      codeDateMap.set(row.trackingCode, dateKey)
    }
  }

  return codeDateMap
}

function parseRows(rows: SheetRow[]): ParsedSheetRow[] {
  return rows
    .map((row) => {
      const date = parseSheetDate(row.date)
      if (!date) return null

      return {
        date,
        trackingCode: normalizeTrackingCode(row.trackingCode),
      }
    })
    .filter((row): row is ParsedSheetRow => row !== null)
}

function getPreparedSheetData(lastSyncedAt: number | null): PreparedSheetData {
  if (preparedSheetDataCache?.lastSyncedAt === lastSyncedAt) {
    return preparedSheetDataCache
  }

  const exportRows = parseRows(readCachedSheetOrders("export"))
  const importRows = parseRows(readCachedSheetOrders("import"))

  preparedSheetDataCache = {
    lastSyncedAt,
    exportRows,
    importRows,
    allExportCodes: new Set(exportRows.map((row) => row.trackingCode)),
  }

  return preparedSheetDataCache
}

function getResponseCacheKey(lastSyncedAt: number | null, startDate: Date, endDate: Date, shops: string[]): string {
  const normalizedShops = [...shops].map((shop) => normalizeShopName(shop)).sort().join("|")
  return `${lastSyncedAt ?? "none"}:${normalizeDateKey(startDate)}:${normalizeDateKey(endDate)}:${normalizedShops}`
}

function getCachedResponse(cacheKey: string): ProductionApiPayload | null {
  const cached = productionResponseCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    productionResponseCache.delete(cacheKey)
    return null
  }

  return cached.payload
}

function setCachedResponse(cacheKey: string, payload: ProductionApiPayload) {
  if (productionResponseCache.size >= 50) {
    for (const [key, value] of productionResponseCache.entries()) {
      if (value.expiresAt <= Date.now()) {
        productionResponseCache.delete(key)
      }
    }
  }

  if (productionResponseCache.size >= 50) {
    const oldestKey = productionResponseCache.keys().next().value
    if (oldestKey) {
      productionResponseCache.delete(oldestKey)
    }
  }

  productionResponseCache.set(cacheKey, {
    expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS,
    payload,
  })
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

  const dbPath = path.resolve(process.cwd(), "backend", "database.db")
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

function filterCodeSetByShop(codeSet: Set<string>, allowedCodes: Set<string> | null): Set<string> {
  if (!allowedCodes) return codeSet
  return new Set(Array.from(codeSet).filter((code) => allowedCodes.has(normalizeTrackingCode(code))))
}

function filterCodeDateMapByShop(codeDateMap: Map<string, string>, allowedCodes: Set<string> | null) {
  if (!allowedCodes) return codeDateMap

  const filtered = new Map<string, string>()
  for (const [code, date] of codeDateMap.entries()) {
    if (allowedCodes.has(normalizeTrackingCode(code))) {
      filtered.set(code, date)
    }
  }
  return filtered
}

function buildProductionData(
  rows: SqliteRow[],
  exportedCodes: Set<string>,
  cancelledCodes: Set<string>
): CategoryRow[] {
  const categoryMap = new Map<
    string,
    {
      total_production: number
      details: Map<string, number>
    }
  >()

  for (const row of rows) {
    const quantity = Number(row.quantity || 0)
    const exportQuantity = exportedCodes.has(row.order_code) ? quantity : 0
    const cancelledQuantity = cancelledCodes.has(row.order_code) ? quantity : 0
    const actualProduction = exportQuantity - cancelledQuantity
    const classifiedRows = sharedClassifyProduct(row)

    for (const classified of classifiedRows) {
      const level2 = `${classified.category} - ${classified.color} - ${classified.size}`

      if (!categoryMap.has(classified.category)) {
        categoryMap.set(classified.category, {
          total_production: 0,
          details: new Map<string, number>(),
        })
      }

      const categoryData = categoryMap.get(classified.category)!
      categoryData.total_production += actualProduction
      categoryData.details.set(level2, (categoryData.details.get(level2) || 0) + actualProduction)
    }
  }

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      total_production: data.total_production,
      details: Array.from(data.details.entries())
        .map(([level_2, quantity]) => ({ level_2, quantity }))
        .filter((item) => item.quantity !== 0)
        .sort((a, b) => b.quantity - a.quantity || a.level_2.localeCompare(b.level_2)),
    }))
    .filter((item) => item.total_production !== 0)
    .sort((a, b) => b.total_production - a.total_production || a.category.localeCompare(b.category))
}

function buildProductionTimeSeries(
  rows: SqliteRow[],
  startDate: Date,
  endDate: Date,
  exportDateMap: Map<string, string>,
  cancelDateMap: Map<string, string>
) {
  const dateKeys = eachDayOfInterval({ start: startDate, end: endDate }).map((date) => normalizeDateKey(date))
  const categorySeriesMap = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const quantity = Number(row.quantity || 0)
    const classifiedRows = sharedClassifyProduct(row)
    const exportDate = exportDateMap.get(row.order_code)
    const cancelDate = cancelDateMap.get(row.order_code)

    for (const classified of classifiedRows) {
      if (!categorySeriesMap.has(classified.category)) {
        categorySeriesMap.set(
          classified.category,
          new Map(dateKeys.map((dateKey) => [dateKey, 0]))
        )
      }

      const categorySeries = categorySeriesMap.get(classified.category)!

      if (exportDate && categorySeries.has(exportDate)) {
        categorySeries.set(exportDate, (categorySeries.get(exportDate) || 0) + quantity)
      }

      if (cancelDate && categorySeries.has(cancelDate)) {
        categorySeries.set(cancelDate, (categorySeries.get(cancelDate) || 0) - quantity)
      }
    }
  }

  return Object.fromEntries(
    Array.from(categorySeriesMap.entries())
      .map(([category, series]) => [
        category,
        dateKeys
          .map((date) => ({ date, total: series.get(date) || 0 }))
          .filter((point) => point.total !== 0),
      ])
      .filter(([, series]) => (series as TimeSeriesPoint[]).length > 0)
  ) as Record<string, TimeSeriesPoint[]>
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDateParam = searchParams.get("startDate")
  const endDateParam = searchParams.get("endDate")
  const selectedShops = getSelectedShops(searchParams)

  if (!startDateParam || !endDateParam) {
    return NextResponse.json({ error: "Missing startDate/endDate" }, { status: 400 })
  }

  const startDate = new Date(startDateParam)
  const endDate = new Date(endDateParam)

  if (!isValid(startDate) || !isValid(endDate)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
  }

  try {
    const syncResult = await ensureSheetCacheFresh()
    const cacheKey = getResponseCacheKey(syncResult.lastSyncedAt, startDate, endDate, selectedShops)
    const cachedPayload = getCachedResponse(cacheKey)
    if (cachedPayload) {
      return NextResponse.json(cachedPayload)
    }

    const preparedSheetData = getPreparedSheetData(syncResult.lastSyncedAt)
    const shopCodeSet = getShopCodeSet(selectedShops)
    const exportedCodes = filterCodeSetByShop(
      getCodesInRange(preparedSheetData.exportRows, startDate, endDate),
      shopCodeSet
    )
    const cancelledCodes = filterCodeSetByShop(
      new Set(
      Array.from(getCodesInRange(preparedSheetData.importRows, startDate, endDate)).filter((code) =>
        preparedSheetData.allExportCodes.has(code)
      )
      ),
      shopCodeSet
    )
    const exportDateMap = filterCodeDateMapByShop(
      getCodeDateMap(preparedSheetData.exportRows, startDate, endDate),
      shopCodeSet
    )
    const cancelDateMap = filterCodeDateMapByShop(
      getCodeDateMap(preparedSheetData.importRows, startDate, endDate, preparedSheetData.allExportCodes),
      shopCodeSet
    )

    const codesToQuery = Array.from(new Set([...exportedCodes, ...cancelledCodes]))
    const dbPath = path.resolve(process.cwd(), "backend", "database.db")

    if (!codesToQuery.length || !fs.existsSync(dbPath)) {
      const emptyPayload = {
        startDate: normalizeDateKey(startDate),
        endDate: normalizeDateKey(endDate),
        data: [],
        timeSeries: {},
      }
      setCachedResponse(cacheKey, emptyPayload)
      return NextResponse.json(emptyPayload)
    }

    const db = new Database(dbPath, { readonly: true })

    try {
      const placeholders = codesToQuery.map(() => "?").join(", ")
      const rows = db
        .prepare(
          `
          SELECT
            o.order_code,
            oi.category,
            oi.original_name,
            oi.normalized_sku,
            oi.color,
            oi.size,
            oi.quantity
          FROM Orders o
          JOIN Order_Items oi ON o.order_code = oi.order_code
          WHERE o.order_code IN (${placeholders})
          `
        )
        .all(...codesToQuery) as SqliteRow[]

      const payload = {
        startDate: normalizeDateKey(startDate),
        endDate: normalizeDateKey(endDate),
        data: buildProductionData(rows, exportedCodes, cancelledCodes),
        timeSeries: buildProductionTimeSeries(rows, startDate, endDate, exportDateMap, cancelDateMap),
      }

      setCachedResponse(cacheKey, payload)
      return NextResponse.json(payload)
    } finally {
      db.close()
    }
  } catch (error) {
    console.error("[production-api] Failed to fetch production data:", error)
    return NextResponse.json({ error: "Failed to fetch production data" }, { status: 500 })
  }
}
