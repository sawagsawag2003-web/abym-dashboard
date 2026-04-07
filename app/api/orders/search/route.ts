import { NextResponse } from "next/server"
import { parse, isValid, format as formatDate } from "date-fns"

const SPREADSHEET_ID = "1MZfWg0griTLNuWFgo38kF8ol1wT1Hj469h1DTQ1k93U"

const SHEETS = {
  export: "913751716",
  import: "46970018",
}

interface OrderRow {
  date: string
  trackingCode: string
}

async function fetchSheetData(sheetGid: string): Promise<OrderRow[]> {
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
  } catch {
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

interface SearchResult {
  trackingCode: string
  status: "exported" | "imported" | "cancelled" | "returned" | "not_found"
  exportDate: string | null
  importDate: string | null
  statusLabel: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const trackingCodes: string[] = body.trackingCodes || []
    
    if (!trackingCodes.length) {
      return NextResponse.json({ error: "No tracking codes provided" }, { status: 400 })
    }
    
    // Fetch data from both sheets
    const [exportOrders, importOrders] = await Promise.all([
      fetchSheetData(SHEETS.export),
      fetchSheetData(SHEETS.import),
    ])
    
    // Tao map de tra cuu nhanh
    const exportMap = new Map<string, string>()
    for (const order of exportOrders) {
      exportMap.set(order.trackingCode, order.date)
    }
    
    const importMap = new Map<string, string>()
    for (const order of importOrders) {
      importMap.set(order.trackingCode, order.date)
    }
    
    // Tra cuu tung ma van don
    const results: SearchResult[] = trackingCodes.map((code) => {
      const trimmedCode = code.trim()
      const exportDate = exportMap.get(trimmedCode) || null
      const importDate = importMap.get(trimmedCode) || null
      
      let status: SearchResult["status"]
      let statusLabel: string
      
      if (exportDate && importDate) {
        // Co trong ca 2 sheet = Don huy
        status = "cancelled"
        statusLabel = "Don Huy"
      } else if (importDate && !exportDate) {
        // Chi co trong Don Ve = Tra hang hoan tien
        status = "returned"
        statusLabel = "Tra Hang Hoan Tien"
      } else if (exportDate && !importDate) {
        // Chi co trong Don Xuat = Da xuat, chua ve
        status = "exported"
        statusLabel = "Da Xuat - Chua Ve Kho"
      } else {
        // Khong tim thay
        status = "not_found"
        statusLabel = "Khong Tim Thay"
      }
      
      return {
        trackingCode: trimmedCode,
        status,
        exportDate,
        importDate,
        statusLabel,
      }
    })
    
    return NextResponse.json({ results })
  } catch (error) {
    console.error("[v0] Search API error:", error)
    return NextResponse.json({ error: "Failed to search" }, { status: 500 })
  }
}
