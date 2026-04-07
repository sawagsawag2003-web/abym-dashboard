"use client"

import { Search, Mail, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MobileNav } from "./mobile-nav"
import type { ReactNode } from "react"

interface HeaderProps {
  title: string
  description: string
  actions?: ReactNode
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <header className="animate-slide-in-up space-y-3 md:space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <MobileNav />

          <div className="relative max-w-md flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm đơn hàng..."
              className="h-9 bg-card pl-9 pr-3 text-sm transition-all duration-300 focus:shadow-lg focus:shadow-primary/10 md:pr-16"
            />
            <kbd className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground md:inline-block">
              ⌘F
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 transition-all duration-300 hover:scale-110 hover:bg-secondary"
          >
            <Mail className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 transition-all duration-300 hover:scale-110 hover:bg-secondary"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
          </Button>

          <div className="flex items-center gap-2 border-l border-border pl-2 md:pl-3">
            <Avatar className="h-7 w-7 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40 md:h-8 md:w-8">
              <AvatarImage src="/profile.jpg" alt="HieuT" />
              <AvatarFallback className="text-xs">HT</AvatarFallback>
            </Avatar>
            <div className="hidden text-xs sm:block">
              <p className="font-semibold text-foreground">HieuT</p>
              <p className="text-[10px] text-muted-foreground">hieut@gmail.com</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h1 className="mb-1 text-xl font-bold text-foreground md:text-2xl lg:text-3xl">{title}</h1>
        <p className="text-xs text-muted-foreground md:text-sm">{description}</p>
      </div>

      {actions && <div className="flex flex-col gap-2 sm:flex-row">{actions}</div>}
    </header>
  )
}
