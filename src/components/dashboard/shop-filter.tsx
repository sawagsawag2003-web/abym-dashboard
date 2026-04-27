"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Search, Store, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const shopPalette = [
  "#10b981",
  "#0ea5e9",
  "#f97316",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#2563eb",
  "#14b8a6",
]

function hashShopName(shop: string) {
  let hash = 0
  for (let index = 0; index < shop.length; index += 1) {
    hash = (hash * 31 + shop.charCodeAt(index)) >>> 0
  }
  return hash
}

export function getShopColor(shop: string) {
  if (shop.toUpperCase().startsWith("TT - ")) {
    return "#6b7280"
  }
  return shopPalette[hashShopName(shop) % shopPalette.length]
}

interface ShopFilterProps {
  shops: string[]
  draftSelectedShops: string[]
  appliedSelectedShops: string[]
  isLoading?: boolean
  onDraftChange: (shops: string[]) => void
  onApply: () => void
  onClear: () => void
  onRemoveShop: (shop: string) => void
}

export function ShopFilter({
  shops,
  draftSelectedShops,
  appliedSelectedShops,
  isLoading = false,
  onDraftChange,
  onApply,
  onClear,
  onRemoveShop,
}: ShopFilterProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filteredShops = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return shops
    return shops.filter((shop) => shop.toLowerCase().includes(normalizedQuery))
  }, [query, shops])

  const allSelected = shops.length > 0 && draftSelectedShops.length === shops.length
  const hasPendingChanges =
    draftSelectedShops.length !== appliedSelectedShops.length ||
    draftSelectedShops.some((shop) => !appliedSelectedShops.includes(shop))

  const triggerLabel =
    appliedSelectedShops.length === 0
      ? "Tất cả shop"
      : appliedSelectedShops.length === 1
        ? appliedSelectedShops[0]
        : `${appliedSelectedShops.length} shop đã chọn`

  const toggleShop = (shop: string, checked: boolean) => {
    if (checked) {
      onDraftChange([...draftSelectedShops, shop].sort((left, right) => left.localeCompare(right, "vi")))
      return
    }

    onDraftChange(draftSelectedShops.filter((item) => item !== shop))
  }

  const handleSelectAll = () => {
    if (allSelected) {
      onDraftChange([])
      return
    }

    onDraftChange([...shops])
  }

  const handleApply = () => {
    onApply()
    setOpen(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-600">Bộ lọc shop</p>
            <p className="text-sm text-muted-foreground">
              Chọn một hoặc nhiều shop, sau đó bấm Áp dụng để cập nhật toàn bộ dashboard.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 min-w-[220px] justify-between rounded-full border-emerald-100 px-4 text-sm shadow-sm"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Store className="h-4 w-4 text-emerald-600" />
                    <span className="truncate">{triggerLabel}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-[360px] rounded-2xl border-emerald-100 p-0 shadow-xl">
                <div className="border-b border-emerald-100 p-4">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Tìm tên shop..."
                      className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {draftSelectedShops.length === 0 ? "Tất cả shop" : `${draftSelectedShops.length} shop đã chọn`}
                    </span>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto p-2">
                  {filteredShops.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">Không tìm thấy shop phù hợp.</div>
                  ) : (
                    filteredShops.map((shop) => {
                      const checked = draftSelectedShops.includes(shop)
                      return (
                        <label
                          key={shop}
                          className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"
                        >
                          <Checkbox checked={checked} onCheckedChange={(value) => toggleShop(shop, value === true)} />
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: getShopColor(shop) }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{shop}</span>
                          {checked && <Check className="h-4 w-4 text-emerald-600" />}
                        </label>
                      )
                    })
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-emerald-100 p-4">
                  <Button variant="ghost" size="sm" onClick={onClear} disabled={draftSelectedShops.length === 0}>
                    Xóa chọn
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={isLoading || !hasPendingChanges}
                    className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Áp dụng
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {appliedSelectedShops.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {appliedSelectedShops.map((shop) => (
              <div
                key={shop}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm"
                style={{
                  borderColor: `${getShopColor(shop)}33`,
                  backgroundColor: `${getShopColor(shop)}14`,
                  color: getShopColor(shop),
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getShopColor(shop) }} />
                <span className="max-w-[180px] truncate">{shop}</span>
                <button
                  type="button"
                  onClick={() => onRemoveShop(shop)}
                  className={cn("rounded-full p-0.5 transition hover:bg-black/5")}
                  aria-label={`Bỏ shop ${shop}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
