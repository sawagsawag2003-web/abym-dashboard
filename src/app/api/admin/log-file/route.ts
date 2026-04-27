import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin-auth"
import { getAdminLogStats, parseAdminLogContent } from "@/lib/admin-log-parser"

export async function GET(request: Request) {
  const authenticated = await isAdminAuthenticated()
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const name = (searchParams.get("name") || "").trim()

  if (!name) {
    return NextResponse.json({ error: "Thiếu tên file log." }, { status: 400 })
  }

  const safeName = path.basename(name)
  const filePath = path.resolve(process.cwd(), "backend", "log", safeName)
  const logRoot = path.resolve(process.cwd(), "backend", "log")

  if (!filePath.startsWith(logRoot)) {
    return NextResponse.json({ error: "Đường dẫn log không hợp lệ." }, { status: 400 })
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Không tìm thấy file log." }, { status: 404 })
  }

  const content = fs.readFileSync(filePath, "utf8")
  const entries = parseAdminLogContent(content)

  return NextResponse.json({
    name: safeName,
    content,
    entries,
    stats: getAdminLogStats(entries),
  })
}
