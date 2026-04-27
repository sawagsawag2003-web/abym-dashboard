import Database from "better-sqlite3"
import path from "path"
import { HOANHUY_SHOPEE_DB_PATH, SHEET_CACHE_DB_PATH } from "@/lib/sheet-cache"

const TIKTOK_DB_PATH = path.resolve(process.cwd(), "backend", "DonHoan_Tiktok.db")
const HOAN_HUY_STATE_DB_PATH = path.resolve(process.cwd(), "backend", "hoan_huy_state.db")

type Platform = "tiktok" | "shopee"
type OrderType = "don_hoan" | "don_huy"
type WarehouseStatus = "da_ve_kho" | "chua_ve_kho" | "ma_van_don_loi"
type Priority = "cao" | "trung_binh" | "thap"
export type ProcessingStatus =
  | "moi"
  | "dang_xac_minh"
  | "da_khieu_nai"
  | "cho_phan_hoi"
  | "da_hoan_tien"
  | "dong_case"
  | "bo_qua"
export type QueueView = "can_xu_ly" | "dang_theo_doi" | "da_xong" | "tat_ca"

export interface HoanHuyCaseState {
  caseId: string
  processingStatus: ProcessingStatus
  note: string
  assignedTo: string
  complaintDate: string
  refundAmount: number | null
  updatedAt: string
}

export interface HoanHuyCase {
  id: string
  san: Platform
  shop: string
  loaiDon: OrderType
  sourceStatus: string
  ngaySan: string
  ngaySanDisplay: string
  ageDays: number
  mucDoUuTien: Priority
  warehouseStatus: WarehouseStatus
  maVanDonDi: string
  maVanDonVe: string
  maVanDonKhop: string
  matchedBy: "ma_van_don_ve" | "ma_van_don_di" | "ma_van_don" | ""
  orderId: string
  returnOrderId: string
  soTien: number | null
  soTienDisplay: string
  lyDo: string
  sanPham: string
  khachHang: string
  rawTrackingCandidates: string[]
  normalizedTrackingCandidates: string[]
  processingStatus: ProcessingStatus
  queueView: QueueView
  note: string
  assignedTo: string
  complaintDate: string
  refundAmount: number | null
  updatedAt: string
}

export interface HoanHuySummary {
  total: number
  daVeKho: number
  chuaVeKho: number
  maVanDonLoi: number
  uuTienCao: number
  tiktok: number
  shopee: number
  canXuLy: number
  dangTheoDoi: number
  daXong: number
}

export interface HoanHuyFilters {
  queueView?: string
  platform?: string
  loaiDon?: string
  warehouseStatus?: string
  mucDoUuTien?: string
  processingStatus?: string
  shop?: string
  search?: string
}

interface BaseCaseRecord {
  id: string
  san: Platform
  shop: string
  loaiDon: OrderType
  sourceStatus: string
  ngaySan: string
  ngaySanDisplay: string
  ageDays: number
  mucDoUuTien: Priority
  warehouseStatus: WarehouseStatus
  maVanDonDi: string
  maVanDonVe: string
  maVanDonKhop: string
  matchedBy: "ma_van_don_ve" | "ma_van_don_di" | "ma_van_don" | ""
  orderId: string
  returnOrderId: string
  soTien: number | null
  soTienDisplay: string
  lyDo: string
  sanPham: string
  khachHang: string
  rawTrackingCandidates: string[]
  normalizedTrackingCandidates: string[]
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase()
}

function normalizeTrackingCode(value: string | null | undefined): string {
  const raw = (value || "").toUpperCase().trim()
  if (!raw) return ""

  const compact = raw.replace(/\s+/g, "")
  if (compact === "#ERROR!" || compact === "ERROR" || compact === "N/A") return ""

  return compact.replace(/[^A-Z0-9]/g, "")
}

function parseTiktokDate(value: string | null | undefined): Date | null {
  const text = (value || "").trim()
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null

  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseShopeeDate(value: string | null | undefined): Date | null {
  const text = (value || "").trim()
  const match = text.match(/^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}):(\d{2}))?$/)
  if (!match) return null

  const [, year, month, day, hour = "00", minute = "00"] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date: Date | null): string {
  if (!date) return ""

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) return ""
  return value.toLocaleString("vi-VN")
}

function parseCurrency(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null

  const digits = value.replace(/[^\d-]/g, "")
  if (!digits) return null

  const parsed = Number(digits)
  return Number.isFinite(parsed) ? parsed : null
}

function getAgeDays(date: Date | null): number {
  if (!date) return 0

  const now = new Date()
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sourceDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffMs = currentDay.getTime() - sourceDay.getTime()
  return Math.max(0, Math.floor(diffMs / 86_400_000))
}

function getPriority(ageDays: number, warehouseStatus: WarehouseStatus): Priority {
  if (warehouseStatus === "da_ve_kho") return "thap"
  if (ageDays >= 7) return "cao"
  if (ageDays >= 4) return "trung_binh"
  return "thap"
}

function getWarehouseStatus(candidates: string[], matchedCode: string): WarehouseStatus {
  if (!candidates.length) return "ma_van_don_loi"
  if (matchedCode) return "da_ve_kho"
  return "chua_ve_kho"
}

function getQueueView(processingStatus: ProcessingStatus): QueueView {
  if (processingStatus === "moi" || processingStatus === "dang_xac_minh") return "can_xu_ly"
  if (processingStatus === "da_khieu_nai" || processingStatus === "cho_phan_hoi") return "dang_theo_doi"
  return "da_xong"
}

function getImportTrackingCodes(): Set<string> {
  const database = new Database(SHEET_CACHE_DB_PATH, { readonly: true })

  try {
    const rows = database
      .prepare(
        `
        SELECT tracking_code
        FROM sheet_orders
        WHERE sheet_name = 'import'
        `
      )
      .all() as Array<{ tracking_code: string | null }>

    return new Set(rows.map((row) => normalizeTrackingCode(row.tracking_code)).filter(Boolean))
  } finally {
    database.close()
  }
}

function buildStableCaseId(parts: Array<string | null | undefined>): string {
  return parts.map((part) => normalizeTrackingCode(part) || normalizeText(part)).filter(Boolean).join("__")
}

function getStateConnection(): Database.Database {
  const database = new Database(HOAN_HUY_STATE_DB_PATH)
  database.pragma("journal_mode = WAL")
  database.pragma("synchronous = NORMAL")
  return database
}

function ensureStateSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS hoan_huy_case_state (
      case_id TEXT PRIMARY KEY,
      processing_status TEXT NOT NULL DEFAULT 'moi',
      note TEXT NOT NULL DEFAULT '',
      assigned_to TEXT NOT NULL DEFAULT '',
      complaint_date TEXT NOT NULL DEFAULT '',
      refund_amount REAL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

function readStateMap(): Map<string, HoanHuyCaseState> {
  const database = getStateConnection()
  ensureStateSchema(database)

  try {
    const rows = database
      .prepare(
        `
        SELECT
          case_id,
          processing_status,
          note,
          assigned_to,
          complaint_date,
          refund_amount,
          updated_at
        FROM hoan_huy_case_state
        `
      )
      .all() as Array<{
        case_id: string
        processing_status: ProcessingStatus
        note: string
        assigned_to: string
        complaint_date: string
        refund_amount: number | null
        updated_at: string
      }>

    return new Map(
      rows.map((row) => [
        row.case_id,
        {
          caseId: row.case_id,
          processingStatus: row.processing_status,
          note: row.note || "",
          assignedTo: row.assigned_to || "",
          complaintDate: row.complaint_date || "",
          refundAmount: row.refund_amount ?? null,
          updatedAt: row.updated_at || "",
        },
      ])
    )
  } finally {
    database.close()
  }
}

export function updateHoanHuyCaseState(input: {
  caseId: string
  processingStatus?: ProcessingStatus
  note?: string
  assignedTo?: string
  complaintDate?: string
  refundAmount?: number | null
}): HoanHuyCaseState {
  const database = getStateConnection()
  ensureStateSchema(database)

  try {
    const existing = database
      .prepare(
        `
        SELECT processing_status, note, assigned_to, complaint_date, refund_amount
        FROM hoan_huy_case_state
        WHERE case_id = ?
        `
      )
      .get(input.caseId) as
      | {
          processing_status: ProcessingStatus
          note: string
          assigned_to: string
          complaint_date: string
          refund_amount: number | null
        }
      | undefined

    const processingStatus = input.processingStatus || existing?.processing_status || "moi"
    const note = input.note ?? existing?.note ?? ""
    const assignedTo = input.assignedTo ?? existing?.assigned_to ?? ""
    const complaintDate = input.complaintDate ?? existing?.complaint_date ?? ""
    const refundAmount = input.refundAmount ?? existing?.refund_amount ?? null

    database
      .prepare(
        `
        INSERT INTO hoan_huy_case_state (
          case_id,
          processing_status,
          note,
          assigned_to,
          complaint_date,
          refund_amount,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(case_id) DO UPDATE SET
          processing_status = excluded.processing_status,
          note = excluded.note,
          assigned_to = excluded.assigned_to,
          complaint_date = excluded.complaint_date,
          refund_amount = excluded.refund_amount,
          updated_at = CURRENT_TIMESTAMP
        `
      )
      .run(
        input.caseId,
        processingStatus,
        note,
        assignedTo,
        complaintDate,
        refundAmount
      )

    const row = database
      .prepare(
        `
        SELECT
          case_id,
          processing_status,
          note,
          assigned_to,
          complaint_date,
          refund_amount,
          updated_at
        FROM hoan_huy_case_state
        WHERE case_id = ?
        `
      )
      .get(input.caseId) as {
      case_id: string
      processing_status: ProcessingStatus
      note: string
      assigned_to: string
      complaint_date: string
      refund_amount: number | null
      updated_at: string
    }

    return {
      caseId: row.case_id,
      processingStatus: row.processing_status,
      note: row.note || "",
      assignedTo: row.assigned_to || "",
      complaintDate: row.complaint_date || "",
      refundAmount: row.refund_amount ?? null,
      updatedAt: row.updated_at || "",
    }
  } finally {
    database.close()
  }
}

function mergeState(record: BaseCaseRecord, stateMap: Map<string, HoanHuyCaseState>): HoanHuyCase {
  const state = stateMap.get(record.id)
  const processingStatus = state?.processingStatus || "moi"

  return {
    ...record,
    processingStatus,
    queueView: getQueueView(processingStatus),
    note: state?.note || "",
    assignedTo: state?.assignedTo || "",
    complaintDate: state?.complaintDate || "",
    refundAmount: state?.refundAmount ?? null,
    updatedAt: state?.updatedAt || "",
  }
}

function buildSummary(records: HoanHuyCase[]): HoanHuySummary {
  return {
    total: records.length,
    daVeKho: records.filter((item) => item.warehouseStatus === "da_ve_kho").length,
    chuaVeKho: records.filter((item) => item.warehouseStatus === "chua_ve_kho").length,
    maVanDonLoi: records.filter((item) => item.warehouseStatus === "ma_van_don_loi").length,
    uuTienCao: records.filter((item) => item.mucDoUuTien === "cao").length,
    tiktok: records.filter((item) => item.san === "tiktok").length,
    shopee: records.filter((item) => item.san === "shopee").length,
    canXuLy: records.filter((item) => item.queueView === "can_xu_ly").length,
    dangTheoDoi: records.filter((item) => item.queueView === "dang_theo_doi").length,
    daXong: records.filter((item) => item.queueView === "da_xong").length,
  }
}

function readTikTokCases(importCodes: Set<string>): BaseCaseRecord[] {
  const database = new Database(TIKTOK_DB_PATH, { readonly: true })

  try {
    const rows = database
      .prepare(
        `
        SELECT
          shop,
          loai_don,
          return_order_id,
          thoi_gian_tao,
          order_id,
          ma_van_don,
          phan_loai,
          ly_do_hoan,
          so_tien,
          ten_khach
        FROM don_hoan
        ORDER BY id DESC
        `
      )
      .all() as Array<{
        shop: string | null
        loai_don: string | null
        return_order_id: string | null
        thoi_gian_tao: string | null
        order_id: string | null
        ma_van_don: string | null
        phan_loai: string | null
        ly_do_hoan: string | null
        so_tien: number | null
        ten_khach: string | null
      }>

    return rows.map((row) => {
      const parsedDate = parseTiktokDate(row.thoi_gian_tao)
      const maVanDon = row.ma_van_don?.trim() || ""
      const normalizedTracking = normalizeTrackingCode(maVanDon)
      const matchedCode = normalizedTracking && importCodes.has(normalizedTracking) ? normalizedTracking : ""
      const warehouseStatus = getWarehouseStatus(normalizedTracking ? [normalizedTracking] : [], matchedCode)
      const ageDays = getAgeDays(parsedDate)
      const shop = row.shop?.trim() || "TikTok"
      const loaiDon = row.loai_don === "don_huy" ? "don_huy" : "don_hoan"

      return {
        id: buildStableCaseId([
          "tiktok",
          shop,
          loaiDon,
          row.order_id,
          row.return_order_id,
          maVanDon,
          row.thoi_gian_tao,
        ]),
        san: "tiktok",
        shop,
        loaiDon,
        sourceStatus: row.phan_loai?.trim() || "",
        ngaySan: toIsoDate(parsedDate),
        ngaySanDisplay: row.thoi_gian_tao?.trim() || "",
        ageDays,
        mucDoUuTien: getPriority(ageDays, warehouseStatus),
        warehouseStatus,
        maVanDonDi: maVanDon,
        maVanDonVe: "",
        maVanDonKhop: matchedCode,
        matchedBy: matchedCode ? "ma_van_don" : "",
        orderId: row.order_id?.trim() || "",
        returnOrderId: row.return_order_id?.trim() || "",
        soTien: row.so_tien ?? null,
        soTienDisplay: formatCurrency(row.so_tien ?? null),
        lyDo: row.ly_do_hoan?.trim() || "",
        sanPham: row.phan_loai?.trim() || "",
        khachHang: row.ten_khach?.trim() || "",
        rawTrackingCandidates: maVanDon ? [maVanDon] : [],
        normalizedTrackingCandidates: normalizedTracking ? [normalizedTracking] : [],
      }
    })
  } finally {
    database.close()
  }
}

function readShopeeCases(importCodes: Set<string>): BaseCaseRecord[] {
  const database = new Database(HOANHUY_SHOPEE_DB_PATH, { readonly: true })

  try {
    const rows = database
      .prepare(
        `
        SELECT
          thoi_gian_hoan_ve,
          aaa,
          ten_shop,
          ma_van_don_di,
          ma_van_don_ve,
          trang_thai,
          san_pham,
          tong_tien,
          loai_don
        FROM hoan_huy_shopee
        ORDER BY id DESC
        `
      )
      .all() as Array<{
        thoi_gian_hoan_ve: string | null
        aaa: string | null
        ten_shop: string | null
        ma_van_don_di: string | null
        ma_van_don_ve: string | null
        trang_thai: string | null
        san_pham: string | null
        tong_tien: string | null
        loai_don: string | null
      }>

    return rows.map((row) => {
      const parsedDate = parseShopeeDate(row.thoi_gian_hoan_ve)
      const maVanDonDi = row.ma_van_don_di?.trim() || ""
      const maVanDonVe = row.ma_van_don_ve?.trim() || ""
      const normalizedVe = normalizeTrackingCode(maVanDonVe)
      const normalizedDi = normalizeTrackingCode(maVanDonDi)

      let matchedCode = ""
      let matchedBy: BaseCaseRecord["matchedBy"] = ""
      if (normalizedVe && importCodes.has(normalizedVe)) {
        matchedCode = normalizedVe
        matchedBy = "ma_van_don_ve"
      } else if (normalizedDi && importCodes.has(normalizedDi)) {
        matchedCode = normalizedDi
        matchedBy = "ma_van_don_di"
      }

      const candidates = [normalizedVe, normalizedDi].filter(Boolean)
      const warehouseStatus = getWarehouseStatus(candidates, matchedCode)
      const ageDays = getAgeDays(parsedDate)
      const shop = row.ten_shop?.trim() || "Shopee"
      const loaiDon = normalizeText(row.loai_don).includes("hủy") ? "don_huy" : "don_hoan"

      return {
        id: buildStableCaseId([
          "shopee",
          shop,
          loaiDon,
          maVanDonDi,
          maVanDonVe,
          row.thoi_gian_hoan_ve,
          row.san_pham,
        ]),
        san: "shopee",
        shop,
        loaiDon,
        sourceStatus: row.trang_thai?.trim() || row.aaa?.trim() || "",
        ngaySan: toIsoDate(parsedDate),
        ngaySanDisplay: row.thoi_gian_hoan_ve?.trim() || "",
        ageDays,
        mucDoUuTien: getPriority(ageDays, warehouseStatus),
        warehouseStatus,
        maVanDonDi,
        maVanDonVe,
        maVanDonKhop: matchedCode,
        matchedBy,
        orderId: "",
        returnOrderId: "",
        soTien: parseCurrency(row.tong_tien),
        soTienDisplay: formatCurrency(parseCurrency(row.tong_tien)),
        lyDo: row.aaa?.replace(/\s+/g, " ").trim() || "",
        sanPham: row.san_pham?.trim() || "",
        khachHang: "",
        rawTrackingCandidates: [maVanDonVe, maVanDonDi].filter(Boolean),
        normalizedTrackingCandidates: candidates,
      }
    })
  } finally {
    database.close()
  }
}

export function readHoanHuyReconciliation(filters: HoanHuyFilters = {}) {
  const importCodes = getImportTrackingCodes()
  const stateMap = readStateMap()
  const merged = [...readTikTokCases(importCodes), ...readShopeeCases(importCodes)].map((item) => mergeState(item, stateMap))

  const filtered = merged.filter((item) => {
    const queueView = (filters.queueView || "can_xu_ly") as QueueView
    if (queueView !== "tat_ca" && item.queueView !== queueView) return false
    if (filters.platform && filters.platform !== "all" && item.san !== filters.platform) return false
    if (filters.loaiDon && filters.loaiDon !== "all" && item.loaiDon !== filters.loaiDon) return false
    if (
      filters.warehouseStatus &&
      filters.warehouseStatus !== "all" &&
      item.warehouseStatus !== filters.warehouseStatus
    ) {
      return false
    }
    if (filters.mucDoUuTien && filters.mucDoUuTien !== "all" && item.mucDoUuTien !== filters.mucDoUuTien) return false
    if (
      filters.processingStatus &&
      filters.processingStatus !== "all" &&
      item.processingStatus !== filters.processingStatus
    ) {
      return false
    }
    if (filters.shop && filters.shop !== "all" && normalizeText(item.shop) !== normalizeText(filters.shop)) return false

    const search = normalizeText(filters.search)
    if (!search) return true

    return [
      item.shop,
      item.orderId,
      item.returnOrderId,
      item.maVanDonDi,
      item.maVanDonVe,
      item.maVanDonKhop,
      item.sourceStatus,
      item.lyDo,
      item.sanPham,
      item.khachHang,
      item.ngaySanDisplay,
      item.note,
    ].some((value) => normalizeText(value).includes(search))
  })

  filtered.sort((left, right) => {
    const queueOrder = { can_xu_ly: 0, dang_theo_doi: 1, da_xong: 2, tat_ca: 3 }
    const priorityOrder = { cao: 0, trung_binh: 1, thap: 2 }
    const queueDiff = queueOrder[left.queueView] - queueOrder[right.queueView]
    if (queueDiff !== 0) return queueDiff
    const priorityDiff = priorityOrder[left.mucDoUuTien] - priorityOrder[right.mucDoUuTien]
    if (priorityDiff !== 0) return priorityDiff
    if (right.ageDays !== left.ageDays) return right.ageDays - left.ageDays
    return right.ngaySan.localeCompare(left.ngaySan)
  })

  const shops = Array.from(new Set(merged.map((item) => item.shop).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi"))

  return {
    records: filtered,
    summary: buildSummary(merged),
    options: {
      shops,
    },
    meta: {
      importTrackingCount: importCodes.size,
      totalSourceRecords: merged.length,
      defaultQueueView: "can_xu_ly" as QueueView,
    },
  }
}
