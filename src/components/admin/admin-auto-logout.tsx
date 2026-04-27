"use client"

import { useEffect } from "react"

function sendLogout() {
  const url = "/api/admin/logout"

  try {
    if (navigator.sendBeacon) {
      const payload = new Blob(["{}"], { type: "application/json" })
      navigator.sendBeacon(url, payload)
      return
    }
  } catch {}

  void fetch(url, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {})
}

export function AdminAutoLogout() {
  useEffect(() => {
    const handlePageHide = () => {
      sendLogout()
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return
      if (anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      try {
        const nextUrl = new URL(anchor.href, window.location.origin)
        const nextPath = nextUrl.pathname
        if (nextPath !== "/admin") {
          sendLogout()
        }
      } catch {}
    }

    window.addEventListener("pagehide", handlePageHide)
    document.addEventListener("click", handleClick, true)

    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      document.removeEventListener("click", handleClick, true)
    }
  }, [])

  return null
}
