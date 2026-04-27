import { NextResponse } from "next/server"
import {
  ensureHoanHuyShopeeCacheFresh,
  getHoanHuyShopeeCacheStatus,
  readHoanHuyShopeeRecords,
} from "@/lib/sheet-cache"

export const runtime = "nodejs"

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase()
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const shop = normalize(searchParams.get("shop"))
  const trangThai = normalize(searchParams.get("trangThai"))
  const loaiDon = normalize(searchParams.get("loaiDon"))
  const search = normalize(searchParams.get("search"))

  try {
    await ensureHoanHuyShopeeCacheFresh()

    let records = readHoanHuyShopeeRecords()

    if (shop) {
      records = records.filter((row) => normalize(row.tenShop) === shop)
    }

    if (trangThai) {
      records = records.filter((row) => normalize(row.trangThai).includes(trangThai))
    }

    if (loaiDon) {
      records = records.filter((row) => normalize(row.loaiDon).includes(loaiDon))
    }

    if (search) {
      records = records.filter((row) =>
        [
          row.thoiGianHoanVe,
          row.aaa,
          row.tenShop,
          row.maVanDonDi,
          row.maVanDonVe,
          row.trangThai,
          row.sanPham,
          row.tongTien,
          row.loaiDon,
        ].some((value) => normalize(value).includes(search))
      )
    }

    return NextResponse.json({
      records,
      total: records.length,
      meta: {
        cacheStatus: getHoanHuyShopeeCacheStatus(),
      },
    })
  } catch (error) {
    console.error("[hoan-huy-shopee-api] Failed to load data:", error)
    return NextResponse.json({ error: "Failed to load HoanHuy Shopee data" }, { status: 500 })
  }
}
