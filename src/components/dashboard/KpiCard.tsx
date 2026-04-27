"use client"

import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

type Trend = "up" | "down" | "neutral"
type Tone = "emerald" | "amber" | "red"

interface KpiCardProps {
  label: string
  value: number
  changePercent: number
  comparisonLabel?: string
  trend: Trend
  tone: Tone
  icon: LucideIcon
  active?: boolean
  onClick?: () => void
}

const toneStyles: Record<Tone, { shell: string; icon: string }> = {
  emerald: {
    shell: "border-emerald-100 bg-white",
    icon: "bg-emerald-50 text-emerald-600",
  },
  amber: {
    shell: "border-amber-100 bg-white",
    icon: "bg-amber-50 text-amber-600",
  },
  red: {
    shell: "border-red-100 bg-white",
    icon: "bg-red-50 text-red-600",
  },
}

const trendStyles: Record<Trend, string> = {
  up: "bg-emerald-50 text-emerald-600",
  down: "bg-red-50 text-red-600",
  neutral: "bg-slate-50 text-slate-600",
}

export function KpiCard({
  label,
  value,
  changePercent,
  comparisonLabel = "kỳ trước",
  trend,
  tone,
  icon: Icon,
  active = false,
  onClick,
}: KpiCardProps) {
  const trendText = `${changePercent > 0 ? "+" : ""}${changePercent}% so với ${comparisonLabel}`
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border p-5 text-left shadow-sm transition",
        toneStyles[tone].shell,
        active && "ring-2 ring-emerald-400 ring-offset-2",
        onClick && "hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", toneStyles[tone].icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            trendStyles[trend]
          )}
        >
          <TrendIcon className="h-3.5 w-3.5" />
          <span>{trendText}</span>
        </div>
      </div>

      <div className="mt-6 space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tracking-tight text-foreground">{value.toLocaleString("vi-VN")}</p>
      </div>
    </button>
  )
}
