import { NextResponse } from "next/server"
import { readHoanHuyReconciliation, updateHoanHuyCaseState, type ProcessingStatus } from "@/lib/hoan-huy-reconciliation"
import { ensureHoanHuyShopeeCacheFresh, ensureSheetCacheFresh } from "@/lib/sheet-cache"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  try {
    await Promise.all([ensureSheetCacheFresh(), ensureHoanHuyShopeeCacheFresh()])

    const result = readHoanHuyReconciliation({
      queueView: searchParams.get("queueView") || "can_xu_ly",
      platform: searchParams.get("platform") || "all",
      loaiDon: searchParams.get("loaiDon") || "all",
      warehouseStatus: searchParams.get("warehouseStatus") || "all",
      mucDoUuTien: searchParams.get("mucDoUuTien") || "all",
      processingStatus: searchParams.get("processingStatus") || "all",
      shop: searchParams.get("shop") || "all",
      search: searchParams.get("search") || "",
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[hoan-huy-reconciliation-api] Failed to load data:", error)
    return NextResponse.json({ error: "Failed to load reconciliation data" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      caseId?: string
      processingStatus?: ProcessingStatus
      note?: string
      assignedTo?: string
      complaintDate?: string
      refundAmount?: number | null
    }

    if (!body.caseId) {
      return NextResponse.json({ error: "Missing caseId" }, { status: 400 })
    }

    const state = updateHoanHuyCaseState({
      caseId: body.caseId,
      processingStatus: body.processingStatus || "moi",
      note: body.note,
      assignedTo: body.assignedTo,
      complaintDate: body.complaintDate,
      refundAmount: body.refundAmount,
    })

    return NextResponse.json({ state })
  } catch (error) {
    console.error("[hoan-huy-reconciliation-api] Failed to update state:", error)
    return NextResponse.json({ error: "Failed to update case state" }, { status: 500 })
  }
}
