import Database from "better-sqlite3"
import fs from "fs"
import path from "path"

export const SHEET_CACHE_DB_PATH = path.resolve(process.cwd(), "backend", "sheet_cache.db")
export const HOANHUY_SHOPEE_DB_PATH = path.resolve(process.cwd(), "backend", "HoanHuy_Shopee.db")
export const GOOGLE_SHEET_ID = "1MZfWg0griTLNuWFgo38kF8ol1wT1Hj469h1DTQ1k93U"
export const SHEET_CACHE_TTL_MS = 3_600_000
export const SHEET_AUTO_SYNC_START_HOUR = 6
export const SHEET_AUTO_SYNC_END_HOUR = 23

export const SHEET_IDS = {
  export: "913751716",
  import: "46970018",
  hoanHuy: "431085623",
} as const

export type SheetKind = keyof typeof SHEET_IDS

export interface CachedSheetOrder {
  date: string
  trackingCode: string
  carrier: string
}

export interface RangeAggregateRow {
  key: string
  count: number
}

export interface ImportStatusOrder extends CachedSheetOrder {
  status: "cancelled" | "returned"
}

export interface HoanHuyShopeeRecord {
  thoiGianHoanVe: string
  aaa: string
  tenShop: string
  maVanDonDi: string
  maVanDonVe: string
  trangThai: string
  sanPham: string
  tongTien: string
  loaiDon: string
}

type SheetCacheSyncResult = {
  lastSyncedAt: number | null
  synced: boolean
  usedStaleCache?: boolean
}

type CsvRow = {
  date: string
  trackingCode: string
  carrier: string
}

type HoanHuyShopeeRow = {
  thoiGianHoanVe: string
  aaa: string
  tenShop: string
  maVanDonDi: string
  maVanDonVe: string
  trangThai: string
  sanPham: string
  tongTien: string
  loaiDon: string
}

let activeSyncPromise: Promise<SheetCacheSyncResult> | null = null
let activeHoanHuySyncPromise: Promise<void> | null = null

export function isSheetAutoSyncWindow(date: Date = new Date()): boolean {
  const hour = date.getHours()
  return hour >= SHEET_AUTO_SYNC_START_HOUR && hour < SHEET_AUTO_SYNC_END_HOUR
}

function getConnection(): Database {
  const database = new Database(SHEET_CACHE_DB_PATH)
  database.pragma("journal_mode = WAL")
  database.pragma("synchronous = NORMAL")
  return database
}

function getHoanHuyShopeeConnection(): Database {
  const database = new Database(HOANHUY_SHOPEE_DB_PATH)
  database.pragma("journal_mode = WAL")
  database.pragma("synchronous = NORMAL")
  return database
}

function formatSyncTimestamp(timestampMs: number): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  return formatter.format(new Date(timestampMs)).replace(",", "")
}

function ensureSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sheet_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_name TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      order_date TEXT NOT NULL,
      tracking_code TEXT NOT NULL,
      carrier TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sheet_name, row_number)
    );

    CREATE INDEX IF NOT EXISTS idx_sheet_orders_sheet_date
      ON sheet_orders(sheet_name, order_date);

    CREATE INDEX IF NOT EXISTS idx_sheet_orders_sheet_tracking
      ON sheet_orders(sheet_name, tracking_code);

    CREATE TABLE IF NOT EXISTS sheet_sync_state (
      sheet_name TEXT PRIMARY KEY,
      last_synced_at INTEGER,
      row_count INTEGER NOT NULL DEFAULT 0,
      checksum TEXT
    );
  `)
}

function ensureHoanHuyShopeeSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS hoan_huy_shopee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_number INTEGER NOT NULL,
      thoi_gian_hoan_ve TEXT,
      aaa TEXT,
      ten_shop TEXT,
      ma_van_don_di TEXT,
      ma_van_don_ve TEXT,
      trang_thai TEXT,
      san_pham TEXT,
      tong_tien TEXT,
      loai_don TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(row_number)
    );

    CREATE INDEX IF NOT EXISTS idx_hoanhuy_shopee_ten_shop
      ON hoan_huy_shopee(ten_shop);

    CREATE INDEX IF NOT EXISTS idx_hoanhuy_shopee_ma_van_don_di
      ON hoan_huy_shopee(ma_van_don_di);

    CREATE INDEX IF NOT EXISTS idx_hoanhuy_shopee_ma_van_don_ve
      ON hoan_huy_shopee(ma_van_don_ve);

    CREATE TABLE IF NOT EXISTS sync_state (
      cache_name TEXT PRIMARY KEY,
      last_synced_at INTEGER,
      row_count INTEGER NOT NULL DEFAULT 0,
      checksum TEXT
    );
  `)

  const columns = database
    .prepare("PRAGMA table_info('hoan_huy_shopee')")
    .all() as Array<{ name?: string }>
  const columnNames = new Set(columns.map((column) => String(column.name || "")))

  if (!columnNames.has("row_number")) {
    database.exec(`
      ALTER TABLE hoan_huy_shopee RENAME TO hoan_huy_shopee_legacy;

      CREATE TABLE hoan_huy_shopee (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        row_number INTEGER NOT NULL,
        thoi_gian_hoan_ve TEXT,
        aaa TEXT,
        ten_shop TEXT,
        ma_van_don_di TEXT,
        ma_van_don_ve TEXT,
        trang_thai TEXT,
        san_pham TEXT,
        tong_tien TEXT,
        loai_don TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(row_number)
      );

      INSERT INTO hoan_huy_shopee (
        row_number,
        thoi_gian_hoan_ve,
        aaa,
        ten_shop,
        ma_van_don_di,
        ma_van_don_ve,
        trang_thai,
        san_pham,
        tong_tien,
        loai_don,
        created_at
      )
      SELECT
        id + 1,
        thoi_gian_hoan_ve,
        aaa,
        ten_shop,
        ma_van_don_di,
        ma_van_don_ve,
        trang_thai,
        san_pham,
        tong_tien,
        loai_don,
        CURRENT_TIMESTAMP
      FROM hoan_huy_shopee_legacy;

      DROP TABLE hoan_huy_shopee_legacy;

      CREATE INDEX IF NOT EXISTS idx_hoanhuy_shopee_ten_shop
        ON hoan_huy_shopee(ten_shop);

      CREATE INDEX IF NOT EXISTS idx_hoanhuy_shopee_ma_van_don_di
        ON hoan_huy_shopee(ma_van_don_di);

      CREATE INDEX IF NOT EXISTS idx_hoanhuy_shopee_ma_van_don_ve
        ON hoan_huy_shopee(ma_van_don_ve);
    `)
  }
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ""
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const nextCharacter = csvText[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentValue.trim())
      currentValue = ""
      continue
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1
      }

      currentRow.push(currentValue.trim())
      if (currentRow.some((value) => value !== "")) {
        rows.push(currentRow)
      }

      currentRow = []
      currentValue = ""
      continue
    }

    currentValue += character
  }

  currentRow.push(currentValue.trim())
  if (currentRow.some((value) => value !== "")) {
    rows.push(currentRow)
  }

  return rows
}

function normalizeCarrierName(raw: string): string {
  const text = raw?.trim().toUpperCase() || ""
  if (!text) return "DV Khac"

  if (text.includes("SPX") || text.includes("SHOPEE")) return "SPX"
  if (text.includes("GHN") || text.includes("GIAO HANG NHANH") || text.includes("GIAO HÀNG NHANH")) return "GHN"
  if (text.includes("J&T") || text.includes("J AND T") || text.includes("JT")) return "J&T"
  if (text.includes("BEST") || text.includes("BEST EXPRESS")) return "BEST"
  if (text.includes("VTP") || text.includes("VIETTEL")) return "VTP"
  if (text.includes("NJV") || text.includes("NINJA")) return "NJV"
  if (text.includes("GHTK")) return "GHTK"
  return "DV Khac"
}

async function fetchSheetCsv(sheetGid: string): Promise<string> {
  const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${sheetGid}`
  const response = await fetch(url, { cache: "no-store" })

  if (!response.ok) {
    throw new Error(`Failed to fetch sheet ${sheetGid}: ${response.status}`)
  }

  return response.text()
}

function csvToRows(csvText: string): CsvRow[] {
  return parseCsvRows(csvText)
    .slice(1)
    .map((columns) => {
      const [date = "", trackingCode = "", carrier = ""] = columns
      return {
        date: date.trim(),
        trackingCode: trackingCode.trim(),
        carrier: normalizeCarrierName(carrier),
      }
    })
    .filter((row) => row.date && row.trackingCode)
}

function csvToHoanHuyShopeeRows(csvText: string): HoanHuyShopeeRow[] {
  return parseCsvRows(csvText)
    .slice(1)
    .map((columns) => {
      const [
        thoiGianHoanVe = "",
        aaa = "",
        tenShop = "",
        maVanDonDi = "",
        maVanDonVe = "",
        trangThai = "",
        sanPham = "",
        tongTien = "",
        loaiDon = "",
      ] = columns

      return {
        thoiGianHoanVe: thoiGianHoanVe.trim(),
        aaa: aaa.trim(),
        tenShop: tenShop.trim(),
        maVanDonDi: maVanDonDi.trim(),
        maVanDonVe: maVanDonVe.trim(),
        trangThai: trangThai.trim(),
        sanPham: sanPham.trim(),
        tongTien: tongTien.trim(),
        loaiDon: loaiDon.trim(),
      }
    })
    .filter((row) => Object.values(row).some((value) => value))
}

function computeChecksum(csvText: string): string {
  let hash = 0
  for (let index = 0; index < csvText.length; index += 1) {
    hash = (hash * 31 + csvText.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

function getLastSyncedAt(database: Database): number | null {
  const row = database
    .prepare(
      `
      SELECT MIN(last_synced_at) AS min_synced_at
      FROM sheet_sync_state
      WHERE sheet_name IN ('export', 'import')
      `
    )
    .get() as { min_synced_at: number | null } | undefined

  return row?.min_synced_at ?? null
}

function getSingleCacheLastSyncedAt(database: Database, cacheName: string): number | null {
  const row = database
    .prepare(
      `
      SELECT last_synced_at
      FROM sync_state
      WHERE cache_name = ?
      `
    )
    .get(cacheName) as { last_synced_at: number | null } | undefined

  return row?.last_synced_at ?? null
}

function isCacheFresh(database: Database, ttlMs: number): boolean {
  const lastSyncedAt = getLastSyncedAt(database)
  if (!lastSyncedAt) {
    return false
  }

  return Date.now() - lastSyncedAt < ttlMs
}

function replaceSheetRows(database: Database, sheetName: SheetKind, rows: CsvRow[], checksum: string): void {
  const now = Date.now()
  const syncTimestamp = formatSyncTimestamp(now)
  const deleteStatement = database.prepare("DELETE FROM sheet_orders WHERE sheet_name = ?")
  const insertStatement = database.prepare(`
    INSERT INTO sheet_orders (sheet_name, row_number, order_date, tracking_code, carrier, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const upsertSyncState = database.prepare(`
    INSERT INTO sheet_sync_state (sheet_name, last_synced_at, row_count, checksum)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(sheet_name) DO UPDATE SET
      last_synced_at = excluded.last_synced_at,
      row_count = excluded.row_count,
      checksum = excluded.checksum
  `)

  const transaction = database.transaction(() => {
    deleteStatement.run(sheetName)
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      insertStatement.run(sheetName, index + 2, row.date, row.trackingCode, row.carrier, syncTimestamp)
    }
    upsertSyncState.run(sheetName, now, rows.length, checksum)
  })

  transaction()
}

function replaceHoanHuyShopeeRows(database: Database, rows: HoanHuyShopeeRow[], checksum: string): void {
  const now = Date.now()
  const syncTimestamp = formatSyncTimestamp(now)
  const deleteStatement = database.prepare("DELETE FROM hoan_huy_shopee")
  const insertStatement = database.prepare(`
    INSERT INTO hoan_huy_shopee (
      row_number,
      thoi_gian_hoan_ve,
      aaa,
      ten_shop,
      ma_van_don_di,
      ma_van_don_ve,
      trang_thai,
      san_pham,
      tong_tien,
      loai_don,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const upsertSyncState = database.prepare(`
    INSERT INTO sync_state (cache_name, last_synced_at, row_count, checksum)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_name) DO UPDATE SET
      last_synced_at = excluded.last_synced_at,
      row_count = excluded.row_count,
      checksum = excluded.checksum
  `)

  const transaction = database.transaction(() => {
    deleteStatement.run()
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      insertStatement.run(
        index + 2,
        row.thoiGianHoanVe,
        row.aaa,
        row.tenShop,
        row.maVanDonDi,
        row.maVanDonVe,
        row.trangThai,
        row.sanPham,
        row.tongTien,
        row.loaiDon,
        syncTimestamp
      )
    }
    upsertSyncState.run("hoan_huy_shopee", now, rows.length, checksum)
  })

  transaction()
}

async function syncSheetCacheInternal(ttlMs: number = SHEET_CACHE_TTL_MS, force = false): Promise<SheetCacheSyncResult> {
  const database = getConnection()
  ensureSchema(database)

  try {
    const lastSyncedAt = getLastSyncedAt(database)

    if (!force && !isSheetAutoSyncWindow() && lastSyncedAt) {
      return { lastSyncedAt, synced: false, usedStaleCache: true }
    }

    if (!force && isCacheFresh(database, ttlMs)) {
      return { lastSyncedAt: getLastSyncedAt(database), synced: false }
    }

    let exportCsv: string
    let importCsv: string

    try {
      ;[exportCsv, importCsv] = await Promise.all([
        fetchSheetCsv(SHEET_IDS.export),
        fetchSheetCsv(SHEET_IDS.import),
      ])
    } catch (error) {
      const lastSyncedAt = getLastSyncedAt(database)
      if (lastSyncedAt) {
        console.warn("[sheet-cache] Refresh failed, using stale local cache:", error)
        return { lastSyncedAt, synced: false, usedStaleCache: true }
      }
      throw error
    }

    replaceSheetRows(database, "export", csvToRows(exportCsv), computeChecksum(exportCsv))
    replaceSheetRows(database, "import", csvToRows(importCsv), computeChecksum(importCsv))

    return { lastSyncedAt: getLastSyncedAt(database), synced: true }
  } finally {
    database.close()
  }
}

async function syncHoanHuyShopeeCacheInternal(ttlMs: number = SHEET_CACHE_TTL_MS, force = false): Promise<void> {
  const database = getHoanHuyShopeeConnection()
  ensureHoanHuyShopeeSchema(database)

  try {
    const lastSyncedAt = getSingleCacheLastSyncedAt(database, "hoan_huy_shopee")
    if (!force && !isSheetAutoSyncWindow() && lastSyncedAt) {
      return
    }

    if (!force && lastSyncedAt && Date.now() - lastSyncedAt < ttlMs) {
      return
    }

    try {
      const csvText = await fetchSheetCsv(SHEET_IDS.hoanHuy)
      replaceHoanHuyShopeeRows(database, csvToHoanHuyShopeeRows(csvText), computeChecksum(csvText))
    } catch (error) {
      if (lastSyncedAt) {
        console.warn("[hoanhuy-shopee-cache] Refresh failed, using stale local cache:", error)
        return
      }
      throw error
    }
  } finally {
    database.close()
  }
}

export async function ensureSheetCacheFresh(
  ttlMs: number = SHEET_CACHE_TTL_MS,
  force = false
): Promise<SheetCacheSyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise
  }

  activeSyncPromise = syncSheetCacheInternal(ttlMs, force)
    .finally(() => {
      activeSyncPromise = null
    })

  return activeSyncPromise
}

export async function ensureHoanHuyShopeeCacheFresh(
  ttlMs: number = SHEET_CACHE_TTL_MS,
  force = false
): Promise<void> {
  if (activeHoanHuySyncPromise) {
    return activeHoanHuySyncPromise
  }

  activeHoanHuySyncPromise = syncHoanHuyShopeeCacheInternal(ttlMs, force).finally(() => {
    activeHoanHuySyncPromise = null
  })

  return activeHoanHuySyncPromise
}

export function initSheetCacheDb(): string {
  const database = getConnection()
  try {
    ensureSchema(database)
  } finally {
    database.close()
  }
  return SHEET_CACHE_DB_PATH
}

export function readCachedSheetOrders(sheetName: SheetKind): CachedSheetOrder[] {
  const database = getConnection()
  ensureSchema(database)

  try {
    return database
      .prepare(
        `
        SELECT
          order_date AS date,
          tracking_code AS trackingCode,
          carrier
        FROM sheet_orders
        WHERE sheet_name = ?
        ORDER BY row_number ASC
        `
      )
      .all(sheetName) as CachedSheetOrder[]
  } finally {
    database.close()
  }
}

export function getCachedSheetRowCount(sheetName: SheetKind): number {
  const database = getConnection()
  ensureSchema(database)

  try {
    const row = database
      .prepare(
        `
        SELECT row_count
        FROM sheet_sync_state
        WHERE sheet_name = ?
        `
      )
      .get(sheetName) as { row_count?: number } | undefined

    return Number(row?.row_count || 0)
  } finally {
    database.close()
  }
}

export function readCachedSheetOrdersInRange(sheetName: SheetKind, from: string, to: string): CachedSheetOrder[] {
  const database = getConnection()
  ensureSchema(database)

  try {
    return database
      .prepare(
        `
        SELECT
          order_date AS date,
          tracking_code AS trackingCode,
          carrier
        FROM sheet_orders
        WHERE sheet_name = ?
          AND order_date BETWEEN ? AND ?
        ORDER BY order_date ASC, row_number ASC
        `
      )
      .all(sheetName, from, to) as CachedSheetOrder[]
  } finally {
    database.close()
  }
}

export function readCachedSheetDateCounts(sheetName: SheetKind, from: string, to: string): RangeAggregateRow[] {
  const database = getConnection()
  ensureSchema(database)

  try {
    return database
      .prepare(
        `
        SELECT order_date AS key, COUNT(*) AS count
        FROM sheet_orders
        WHERE sheet_name = ?
          AND order_date BETWEEN ? AND ?
        GROUP BY order_date
        ORDER BY order_date ASC
        `
      )
      .all(sheetName, from, to) as RangeAggregateRow[]
  } finally {
    database.close()
  }
}

export function readCachedSheetCarrierCounts(sheetName: SheetKind, from: string, to: string): RangeAggregateRow[] {
  const database = getConnection()
  ensureSchema(database)

  try {
    return database
      .prepare(
        `
        SELECT carrier AS key, COUNT(*) AS count
        FROM sheet_orders
        WHERE sheet_name = ?
          AND order_date BETWEEN ? AND ?
        GROUP BY carrier
        ORDER BY count DESC, carrier ASC
        `
      )
      .all(sheetName, from, to) as RangeAggregateRow[]
  } finally {
    database.close()
  }
}

export function readImportOrdersWithStatusInRange(from: string, to: string): ImportStatusOrder[] {
  const database = getConnection()
  ensureSchema(database)

  try {
    return database
      .prepare(
        `
        SELECT
          i.order_date AS date,
          i.tracking_code AS trackingCode,
          i.carrier AS carrier,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM sheet_orders e
              WHERE e.sheet_name = 'export'
                AND e.tracking_code = i.tracking_code
            ) THEN 'cancelled'
            ELSE 'returned'
          END AS status
        FROM sheet_orders i
        WHERE i.sheet_name = 'import'
          AND i.order_date BETWEEN ? AND ?
        ORDER BY i.order_date ASC, i.row_number ASC
        `
      )
      .all(from, to) as ImportStatusOrder[]
  } finally {
    database.close()
  }
}

export function getSheetCacheStatus(): { exists: boolean; path: string } {
  return {
    exists: fs.existsSync(SHEET_CACHE_DB_PATH),
    path: SHEET_CACHE_DB_PATH,
  }
}

export function initHoanHuyShopeeDb(): string {
  const database = getHoanHuyShopeeConnection()
  try {
    ensureHoanHuyShopeeSchema(database)
  } finally {
    database.close()
  }
  return HOANHUY_SHOPEE_DB_PATH
}

export function getHoanHuyShopeeCacheStatus(): { exists: boolean; path: string } {
  return {
    exists: fs.existsSync(HOANHUY_SHOPEE_DB_PATH),
    path: HOANHUY_SHOPEE_DB_PATH,
  }
}

export function getHoanHuyShopeeLastSyncedAt(): number | null {
  const database = getHoanHuyShopeeConnection()
  ensureHoanHuyShopeeSchema(database)

  try {
    return getSingleCacheLastSyncedAt(database, "hoan_huy_shopee")
  } finally {
    database.close()
  }
}

export function getSheetCacheLastSyncedAt(): number | null {
  const database = getConnection()
  ensureSchema(database)

  try {
    return getLastSyncedAt(database)
  } finally {
    database.close()
  }
}

export function readHoanHuyShopeeRecords(): HoanHuyShopeeRecord[] {
  const database = getHoanHuyShopeeConnection()
  ensureHoanHuyShopeeSchema(database)

  try {
    return database
      .prepare(
        `
        SELECT
          thoi_gian_hoan_ve AS thoiGianHoanVe,
          aaa AS aaa,
          ten_shop AS tenShop,
          ma_van_don_di AS maVanDonDi,
          ma_van_don_ve AS maVanDonVe,
          trang_thai AS trangThai,
          san_pham AS sanPham,
          tong_tien AS tongTien,
          loai_don AS loaiDon
        FROM hoan_huy_shopee
        ORDER BY row_number ASC
        `
      )
      .all() as HoanHuyShopeeRecord[]
  } finally {
    database.close()
  }
}
