import { NextResponse } from "next/server"
import {
  ensureHoanHuyShopeeCacheFresh,
  ensureSheetCacheFresh,
  getHoanHuyShopeeLastSyncedAt,
  getSheetCacheLastSyncedAt,
} from "@/lib/sheet-cache"

export const runtime = "nodejs"

type SyncTarget = "all" | "sheet_cache" | "hoan_huy_shopee"

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { target?: SyncTarget }
    const target = body.target || "all"

    if (target === "all") {
      await Promise.all([ensureSheetCacheFresh(undefined, true), ensureHoanHuyShopeeCacheFresh(undefined, true)])
    } else if (target === "sheet_cache") {
      await ensureSheetCacheFresh(undefined, true)
    } else if (target === "hoan_huy_shopee") {
      await ensureHoanHuyShopeeCacheFresh(undefined, true)
    } else {
      return NextResponse.json({ error: "Invalid sync target" }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      target,
      syncedAt: {
        sheetCache: getSheetCacheLastSyncedAt(),
        hoanHuyShopee: getHoanHuyShopeeLastSyncedAt(),
      },
    })
  } catch (error) {
    console.error("[sheet-sync-api] Failed to sync sheet cache:", error)
    return NextResponse.json({ error: "Failed to sync sheet data" }, { status: 500 })
  }
}
