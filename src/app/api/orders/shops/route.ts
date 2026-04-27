import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

function normalizeShopName(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ")
}

function formatShopOption(shopName: string, platform: string | null | undefined) {
  const normalizedShop = normalizeShopName(shopName)
  const normalizedPlatform = (platform || "").trim().toLowerCase()
  if (!normalizedShop) return ""
  if (normalizedPlatform.includes("tiktok")) {
    return `TT - ${normalizedShop}`
  }
  return normalizedShop
}

export async function GET() {
  const dbPath = path.resolve(process.cwd(), "backend", "database.db")
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ shops: [] })
  }

  const database = new Database(dbPath, { readonly: true })

  try {
    const rows = database
      .prepare(
        `
        SELECT DISTINCT shop_name, platform
        FROM Orders
        WHERE shop_name IS NOT NULL
          AND TRIM(shop_name) != ''
        ORDER BY platform COLLATE NOCASE ASC, shop_name COLLATE NOCASE ASC
        `
      )
      .all() as Array<{ shop_name: string | null; platform: string | null }>

    const shops = Array.from(
      new Set(rows.map((row) => formatShopOption(row.shop_name || "", row.platform)).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, "vi"))

    return NextResponse.json({ shops })
  } catch (error) {
    console.error("[orders-shops-api] Failed to read shops:", error)
    return NextResponse.json({ error: "Failed to load shops" }, { status: 500 })
  } finally {
    database.close()
  }
}
