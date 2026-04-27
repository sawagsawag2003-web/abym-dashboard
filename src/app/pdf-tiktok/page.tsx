'use client'

import { useEffect, useState } from "react"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"

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

      <main className="flex min-h-screen flex-1 flex-col p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header title="PDF TIKTOK" description="Công cụ xử lý nhãn in và quản lý đơn hàng TikTok." />

        <div className="mt-4 flex flex-1 md:mt-5">
          <div className="flex-1 p-4 lg:p-6">
            <div className="h-full rounded-lg border border-border bg-card p-4">
              <iframe
                src={iframeUrl}
                className="h-full w-full rounded border-0"
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
