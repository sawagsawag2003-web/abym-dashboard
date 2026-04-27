"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MobileNav } from "./mobile-nav"

interface HeaderProps {
  title: string
  description: string
  actions?: ReactNode
  showQuickSearch?: boolean
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <header className="space-y-6 pt-3 md:pt-4">
      <div className="lg:hidden">
        <MobileNav />
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">{title}</h1>

          <Link
            href="/admin"
            className="flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-700">
                HT
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 pr-1">
              <p className="text-sm font-semibold leading-none text-foreground">HieuT</p>
              <p className="mt-1 text-xs text-muted-foreground">Quản trị hệ thống</p>
            </div>
          </Link>
        </div>

        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      {actions && <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">{actions}</div>}
    </header>
  )
}
