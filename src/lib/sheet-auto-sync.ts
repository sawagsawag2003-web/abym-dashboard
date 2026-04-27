import {
  SHEET_CACHE_TTL_MS,
  ensureHoanHuyShopeeCacheFresh,
  ensureSheetCacheFresh,
  getHoanHuyShopeeLastSyncedAt,
  getSheetCacheLastSyncedAt,
  isSheetAutoSyncWindow,
} from "@/lib/sheet-cache"

const AUTO_SYNC_CHECK_INTERVAL_MS = 60_000

type SheetAutoSyncGlobal = typeof globalThis & {
  __abymSheetAutoSyncScheduler?: {
    started: boolean
    timer?: ReturnType<typeof setInterval>
    activePromise?: Promise<void> | null
  }
}

function getLastAllSyncedAt(): number | null {
  const sheetCacheLastSyncedAt = getSheetCacheLastSyncedAt()
  const hoanHuyShopeeLastSyncedAt = getHoanHuyShopeeLastSyncedAt()
  const timestamps = [sheetCacheLastSyncedAt, hoanHuyShopeeLastSyncedAt].filter(
    (timestamp): timestamp is number => typeof timestamp === "number" && timestamp > 0
  )

  if (!timestamps.length) return null
  return Math.min(...timestamps)
}

function shouldAutoSync(now = new Date()): boolean {
  if (!isSheetAutoSyncWindow(now)) return false

  const lastAllSyncedAt = getLastAllSyncedAt()
  if (!lastAllSyncedAt) return true

  return Date.now() - lastAllSyncedAt >= SHEET_CACHE_TTL_MS
}

async function runAutoSyncIfDue() {
  const scheduler = (globalThis as SheetAutoSyncGlobal).__abymSheetAutoSyncScheduler
  if (!scheduler || scheduler.activePromise) return
  if (!shouldAutoSync()) return

  scheduler.activePromise = Promise.all([
    ensureSheetCacheFresh(undefined, true),
    ensureHoanHuyShopeeCacheFresh(undefined, true),
  ])
    .then(() => {
      console.info("[sheet-auto-sync] Synced sheet caches.")
    })
    .catch((error) => {
      console.error("[sheet-auto-sync] Failed to sync sheet caches:", error)
    })
    .finally(() => {
      scheduler.activePromise = null
    })

  await scheduler.activePromise
}

export function startSheetAutoSyncScheduler() {
  const globalState = globalThis as SheetAutoSyncGlobal
  const scheduler =
    globalState.__abymSheetAutoSyncScheduler ||
    (globalState.__abymSheetAutoSyncScheduler = {
      started: false,
      activePromise: null,
    })

  if (scheduler.started) return

  scheduler.started = true
  scheduler.timer = setInterval(() => {
    void runAutoSyncIfDue()
  }, AUTO_SYNC_CHECK_INTERVAL_MS)

  void runAutoSyncIfDue()
}
