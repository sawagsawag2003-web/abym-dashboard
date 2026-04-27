"use client"

import { Layers3 } from "lucide-react"
import { Card } from "@/components/ui/card"

interface ProductCardProps {
  code: string
  fullName: string
  totalQuantity: number
  summaryLabel: string
}

export function ProductCard({ code, fullName, totalQuantity, summaryLabel }: ProductCardProps) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Layers3 className="h-5 w-5" />
        </div>
        <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {summaryLabel}
        </div>
      </div>

      <div className="mt-8">
        <p className="text-4xl font-bold tracking-tight text-foreground">{totalQuantity.toLocaleString("vi-VN")}</p>
        <div className="mt-5 space-y-1.5">
          <p className="text-lg font-semibold text-foreground">
            {code} - {fullName}
          </p>
          <p className="text-sm text-muted-foreground">
            {code} - {fullName}: {totalQuantity.toLocaleString("vi-VN")}
          </p>
        </div>
      </div>
    </Card>
  )
}
