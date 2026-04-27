export type AdminLogAction = "upload" | "done" | "info" | "warning" | "error"

export type AdminLogEntry = {
  lineNumber: number
  time: string
  ip: string
  os: string
  browser: string
  action: AdminLogAction
  title: string
  message: string
  fileCount: number | null
  files: string[]
  outputFiles: string[]
  totalOrders: number | null
  raw: string
}

export type AdminLogStats = {
  total: number
  uploads: number
  completed: number
  warnings: number
  errors: number
  totalOrders: number | null
  latestTotalOrders: number | null
}

const LINE_PATTERN = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s*(.*)$/

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

function splitCommaList(value: string | undefined) {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseFileCount(message: string) {
  const match = message.match(/(\d+)\s+file/i)
  return match ? Number(match[1]) : null
}

function parseUploadFiles(message: string) {
  const match = message.match(/\((.*)\)\s*$/)
  return splitCommaList(match?.[1])
}

function parseOutputFiles(message: string) {
  const outputs = new Set<string>()
  const outputPattern = /([\w .()[\]-]+?\.(?:zip|pdf))/gi
  for (const match of message.matchAll(outputPattern)) {
    outputs.add(match[1].trim())
  }
  return Array.from(outputs)
}

function parseTotalOrders(message: string) {
  const match = normalizeText(message).match(/tong\s+don\s*:\s*(\d+)/)
  return match ? Number(match[1]) : null
}

function detectAction(message: string): AdminLogAction {
  const normalized = normalizeText(message)
  if (normalized.includes("error") || normalized.includes("traceback") || normalized.includes("failed")) return "error"
  if (normalized.includes("warn")) return "warning"
  if (normalized.includes("tai len")) return "upload"
  if (normalized.includes("xu ly xong")) return "done"
  return "info"
}

function buildTitle(action: AdminLogAction, message: string, fileCount: number | null, totalOrders: number | null) {
  if (action === "upload") return `Tai len ${fileCount ?? ""} file`.trim()
  if (action === "done") return `Xu ly xong${totalOrders !== null ? ` - ${totalOrders} don` : ""}`
  if (action === "warning") return "Canh bao"
  if (action === "error") return "Loi"
  return message || "Thong tin"
}

export function parseAdminLogContent(content: string): AdminLogEntry[] {
  return content
    .split(/\r?\n/)
    .map((raw, index) => {
      const lineNumber = index + 1
      const parsed = raw.match(LINE_PATTERN)
      const message = parsed?.[5]?.trim() || raw.trim()
      const action = detectAction(message)
      const fileCount = action === "upload" ? parseFileCount(message) : null
      const totalOrders = action === "done" ? parseTotalOrders(message) : null

      return {
        lineNumber,
        time: parsed?.[1] || "",
        ip: parsed?.[2] || "",
        os: parsed?.[3] || "",
        browser: parsed?.[4] || "",
        action,
        title: buildTitle(action, message, fileCount, totalOrders),
        message,
        fileCount,
        files: action === "upload" ? parseUploadFiles(message) : [],
        outputFiles: action === "done" ? parseOutputFiles(message) : [],
        totalOrders,
        raw,
      }
    })
    .filter((entry) => entry.raw.trim())
}

export function getAdminLogStats(entries: AdminLogEntry[]): AdminLogStats {
  const orderCounts = entries
    .map((entry) => entry.totalOrders)
    .filter((totalOrders): totalOrders is number => totalOrders !== null)

  return {
    total: entries.length,
    uploads: entries.filter((entry) => entry.action === "upload").length,
    completed: entries.filter((entry) => entry.action === "done").length,
    warnings: entries.filter((entry) => entry.action === "warning").length,
    errors: entries.filter((entry) => entry.action === "error").length,
    totalOrders: orderCounts.length ? orderCounts.reduce((sum, count) => sum + count, 0) : null,
    latestTotalOrders: orderCounts.length ? orderCounts[orderCounts.length - 1] : null,
  }
}
