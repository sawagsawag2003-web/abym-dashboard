import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { isValid, parse } from "date-fns"

export const runtime = "nodejs"

const SPREADSHEET_ID = "1MZfWg0griTLNuWFgo38kF8ol1wT1Hj469h1DTQ1k93U"

const SHEETS = {
  export: "913751716",
  import: "46970018",
}

type SheetRow = {
  date: string
  trackingCode: string
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
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
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

async function fetchSheetData(sheetGid: string): Promise<SheetRow[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${sheetGid}`

  try {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) {
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
        }
      })
      .filter((row) => row.date && row.trackingCode)
  } catch (error) {
    console.error("[production-api] Failed to fetch Google Sheets:", error)
    return []
  }
}

function getCodesInRange(rows: SheetRow[], startDate: Date, endDate: Date): Set<string> {
  const from = new Date(startDate)
  from.setHours(0, 0, 0, 0)

  const to = new Date(endDate)
  to.setHours(23, 59, 59, 999)

  const codes = new Set<string>()

  for (const row of rows) {
    const parsedDate = parseSheetDate(row.date)
    if (!parsedDate) {
      continue
    }

    if (parsedDate >= from && parsedDate <= to) {
      codes.add(row.trackingCode)
    }
  }

  return codes
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
    const classifiedRows = classifyProduct(row)

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDateParam = searchParams.get("startDate")
  const endDateParam = searchParams.get("endDate")

  if (!startDateParam || !endDateParam) {
    return NextResponse.json({ error: "Missing startDate/endDate" }, { status: 400 })
  }

  const startDate = new Date(startDateParam)
  const endDate = new Date(endDateParam)

  if (!isValid(startDate) || !isValid(endDate)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 })
  }

  try {
    const [allExportOrders, allImportOrders] = await Promise.all([
      fetchSheetData(SHEETS.export),
      fetchSheetData(SHEETS.import),
    ])

    const allExportCodes = new Set(allExportOrders.map((row) => row.trackingCode))
    const exportedCodes = getCodesInRange(allExportOrders, startDate, endDate)
    const cancelledCodes = new Set(
      Array.from(getCodesInRange(allImportOrders, startDate, endDate)).filter((code) => allExportCodes.has(code))
    )

    const codesToQuery = Array.from(new Set([...exportedCodes, ...cancelledCodes]))
    const dbPath = path.resolve(process.cwd(), "database.db")

    if (!codesToQuery.length || !fs.existsSync(dbPath)) {
      return NextResponse.json({
        startDate: normalizeDateKey(startDate),
        endDate: normalizeDateKey(endDate),
        data: [],
      })
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

      return NextResponse.json({
        startDate: normalizeDateKey(startDate),
        endDate: normalizeDateKey(endDate),
        data: buildProductionData(rows, exportedCodes, cancelledCodes),
      })
    } finally {
      db.close()
    }
  } catch (error) {
    console.error("[production-api] Failed to fetch production data:", error)
    return NextResponse.json({ error: "Failed to fetch production data" }, { status: 500 })
  }
}
