import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

type PlatformRow = {
  platform: string | null
  orderCount: number
}

type SkuRow = {
  normalized_sku: string | null
  totalQuantity: number
}

function extractBaseProduct(normalizedSku: string | null): string {
  const sku = (normalizedSku || "").trim()
  if (!sku) {
    return "Unknown"
  }

  const parts = sku.split("-").map((part) => part.trim()).filter(Boolean)
  if (parts.length <= 1) {
    return sku
  }

  if (parts.length === 2) {
    return parts[0]
  }

  return parts.slice(0, -2).join("-") || sku
}

export async function GET() {
  const dbPath = path.resolve(process.cwd(), "database.db")
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({
      ordersByPlatform: [],
      topProducts: [],
    })
  }

  const db = new Database(dbPath, { readonly: true })

  try {
    const ordersByPlatform = db
      .prepare(
        `
        SELECT platform, COUNT(*) as orderCount
        FROM Orders
        GROUP BY platform
        ORDER BY orderCount DESC
        `
      )
      .all() as PlatformRow[]

    const skuRows = db
      .prepare(
        `
        SELECT normalized_sku, SUM(quantity) as totalQuantity
        FROM Order_Items
        WHERE normalized_sku IS NOT NULL AND normalized_sku != ''
        GROUP BY normalized_sku
        `
      )
      .all() as SkuRow[]

    const topProductsMap = new Map<string, number>()
    for (const row of skuRows) {
      const productName = extractBaseProduct(row.normalized_sku)
      topProductsMap.set(productName, (topProductsMap.get(productName) || 0) + Number(row.totalQuantity || 0))
    }

    const topProducts = Array.from(topProductsMap.entries())
      .map(([productName, totalQuantity]) => ({ productName, totalQuantity }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity || a.productName.localeCompare(b.productName))
      .slice(0, 20)

    return NextResponse.json({
      ordersByPlatform: ordersByPlatform.map((row) => ({
        platform: row.platform || "Unknown",
        orderCount: row.orderCount,
      })),
      topProducts,
    })
  } catch (error) {
    console.error("[production-stats] Failed to read SQLite:", error)
    return NextResponse.json({ error: "Failed to read production stats" }, { status: 500 })
  } finally {
    db.close()
  }
}
