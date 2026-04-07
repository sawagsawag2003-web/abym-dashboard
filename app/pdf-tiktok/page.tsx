'use client'

import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { useEffect, useState } from "react"

export default function PDFTikTokPage() {
  const [iframeUrl, setIframeUrl] = useState("http://localhost:8504")

  useEffect(() => {
    setIframeUrl(`http://${window.location.hostname}:8504`)
  }, [])
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileNav />

      <main className="flex flex-col flex-1 p-3 md:p-4 lg:p-5 lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <Header
          title="PDF TIKTOK"
          description="Công cụ xử lý nhãn in và quản lý đơn hàng TikTok."
        />
        <div className="mt-4 md:mt-5 flex-1 flex">
          <div className="flex-1 p-4 lg:p-6">
            <div className="bg-card border border-border rounded-lg p-4 h-full">
              <iframe
                src={iframeUrl}
                className="w-full h-full border-0 rounded"
                title="PDF TIKTOK Tool"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
