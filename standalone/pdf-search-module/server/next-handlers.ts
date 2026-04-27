import { NextResponse } from "next/server"
import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import {
  extractPdfSearchPage,
  mergePdfSearchPages,
  searchPdfCodesInFiles,
  type PdfSearchCandidate,
  type PdfSearchServiceOptions,
} from "./tracer-service"

type OrderLookupRow = {
  order_code: string | null
  carrier: string | null
  file_source: string | null
  created_at: string | null
}

function getRootPathFromQuery(request: Request) {
  const { searchParams } = new URL(request.url)
  return (searchParams.get("rootPath") || "").trim()
}

function normalizeCode(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, "").toUpperCase()
}

function getOrdersDbPath() {
  return path.resolve(process.cwd(), "backend", "database.db")
}

function resolveRelativePdfPath(rootPath: string, fileSource: string): string | null {
  const absoluteRootPath = path.resolve(rootPath)
  const normalizedSource = fileSource.replace(/\\/g, "/").trim()

  const absoluteSourcePath = path.isAbsolute(normalizedSource)
    ? path.resolve(normalizedSource)
    : path.resolve(process.cwd(), "backend", normalizedSource)

  const relativePath = path.relative(absoluteRootPath, absoluteSourcePath)
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null
  }

  return relativePath.replace(/\\/g, "/")
}

function getPdfSearchStatsFromDatabase(rootPath: string) {
  const dbPath = getOrdersDbPath()
  if (!fs.existsSync(dbPath)) {
    return { totalFiles: 0, totalSizeBytes: 0 }
  }

  const rootAbsolutePath = path.resolve(rootPath)
  const database = new Database(dbPath, { readonly: true })

  try {
    const rows = database
      .prepare(
        `
        SELECT DISTINCT file_source
        FROM Orders
        WHERE file_source IS NOT NULL
          AND TRIM(file_source) != ''
        `
      )
      .all() as Array<{ file_source: string | null }>

    const uniqueExistingFiles = new Set<string>()
    let totalSizeBytes = 0

    for (const row of rows) {
      const fileSource = row.file_source?.trim()
      if (!fileSource) continue

      const relativePath = resolveRelativePdfPath(rootAbsolutePath, fileSource)
      if (!relativePath) continue

      const absolutePath = path.resolve(rootAbsolutePath, relativePath)
      if (!fs.existsSync(absolutePath)) continue
      if (uniqueExistingFiles.has(absolutePath)) continue

      uniqueExistingFiles.add(absolutePath)
      totalSizeBytes += fs.statSync(absolutePath).size
    }

    return {
      totalFiles: uniqueExistingFiles.size,
      totalSizeBytes,
    }
  } finally {
    database.close()
  }
}

function searchPdfFromDatabase(rootPath: string, codes: string[], options: PdfSearchServiceOptions = {}) {
  const dbPath = getOrdersDbPath()
  if (!fs.existsSync(dbPath)) {
    return { results: [], totalFiles: 0, totalSizeBytes: 0 }
  }

  const normalizedCodes = new Set(codes.map((code) => normalizeCode(code)).filter(Boolean))
  if (!normalizedCodes.size) {
    return { results: [], totalFiles: 0, totalSizeBytes: 0 }
  }

  const rootAbsolutePath = path.resolve(rootPath)
  const database = new Database(dbPath, { readonly: true })

  try {
    const rows = database
      .prepare(
        `
        SELECT order_code, carrier, file_source, created_at
        FROM Orders
        WHERE order_code IS NOT NULL
          AND file_source IS NOT NULL
          AND TRIM(file_source) != ''
        `
      )
      .all() as OrderLookupRow[]

    const fileSizeCache = new Map<string, number>()
    const candidates = new Map<string, PdfSearchCandidate>()

    for (const row of rows) {
      const orderId = row.order_code?.trim() || ""
      if (!normalizedCodes.has(normalizeCode(orderId))) continue

      const fileSource = row.file_source?.trim() || ""
      const relativePath = resolveRelativePdfPath(rootAbsolutePath, fileSource)
      if (!relativePath) continue

      const absolutePath = path.resolve(rootAbsolutePath, relativePath)
      if (!fs.existsSync(absolutePath)) continue

      let fileSize = fileSizeCache.get(absolutePath)
      if (fileSize === undefined) {
        fileSize = fs.statSync(absolutePath).size
        fileSizeCache.set(absolutePath, fileSize)
      }

      const key = `${orderId}::${relativePath}`
      candidates.set(key, {
        orderId,
        carrier: row.carrier?.trim() || "",
        filePath: relativePath,
        createdAt: row.created_at?.trim() || "",
        fileSize,
      })
    }

    const stats = getPdfSearchStatsFromDatabase(rootAbsolutePath)
    if (!candidates.size) {
      return { results: [], ...stats }
    }

    const resolved = searchPdfCodesInFiles(rootAbsolutePath, Array.from(candidates.values()), options)
    return {
      results: resolved.results,
      ...stats,
    }
  } finally {
    database.close()
  }
}

export async function handlePdfSearchStatsRequest(request: Request, options: PdfSearchServiceOptions = {}) {
  try {
    const rootPath = getRootPathFromQuery(request)
    if (!rootPath) {
      return NextResponse.json({ error: "Thiếu thư mục gốc" }, { status: 400 })
    }

    return NextResponse.json(getPdfSearchStatsFromDatabase(rootPath))
  } catch (error) {
    console.error("[pdf-search] stats error:", error)
    return NextResponse.json({ error: "Không thể tải thống kê" }, { status: 500 })
  }
}

export async function handlePdfSearchRequest(request: Request, options: PdfSearchServiceOptions = {}) {
  try {
    const body = await request.json()
    const rootPath = typeof body.rootPath === "string" ? body.rootPath.trim() : ""
    const codes = Array.isArray(body.codes) ? body.codes : []

    if (!rootPath) {
      return NextResponse.json({ error: "Thiếu thư mục gốc" }, { status: 400 })
    }

    if (codes.length === 0) {
      return NextResponse.json({ error: "Thiếu mã vận đơn" }, { status: 400 })
    }

    const results = searchPdfFromDatabase(rootPath, codes, options)

    return NextResponse.json({
      ...results,
    })
  } catch (error) {
    console.error("[pdf-search] search error:", error)
    return NextResponse.json({ error: "Không thể tra cứu" }, { status: 500 })
  }
}

export async function handlePdfSearchPageRequest(request: Request, options: PdfSearchServiceOptions = {}) {
  try {
    const { searchParams } = new URL(request.url)
    const rootPath = (searchParams.get("rootPath") || "").trim()
    const filePath = searchParams.get("path")
    const pageNumber = Number(searchParams.get("page"))
    const download = searchParams.get("download") === "1"

    if (!rootPath || !filePath || !Number.isFinite(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: "Yêu cầu không hợp lệ" }, { status: 400 })
    }

    const pdfBuffer = extractPdfSearchPage(rootPath, filePath, pageNumber, options)
    const fileName = `${filePath.split("/").pop()?.replace(/\.pdf$/i, "") ?? "page"}-p${pageNumber}.pdf`

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error("[pdf-search] page error:", error)
    return NextResponse.json({ error: "Không thể tách trang PDF" }, { status: 500 })
  }
}

export async function handlePdfSearchMergeRequest(request: Request, options: PdfSearchServiceOptions = {}) {
  try {
    const body = await request.json()
    const rootPath = typeof body.rootPath === "string" ? body.rootPath.trim() : ""
    const items = Array.isArray(body.items) ? body.items : []

    if (!rootPath) {
      return NextResponse.json({ error: "Thiếu thư mục gốc" }, { status: 400 })
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "Chưa chọn trang để gộp" }, { status: 400 })
    }

    const pdfBuffer = mergePdfSearchPages(rootPath, items, options)
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="gop-van-don.pdf"',
      },
    })
  } catch (error) {
    console.error("[pdf-search] merge error:", error)
    return NextResponse.json({ error: "Không thể gộp file PDF" }, { status: 500 })
  }
}
