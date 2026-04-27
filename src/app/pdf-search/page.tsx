"use client"

import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { PdfSearchModule } from "@/standalone/pdf-search-module/frontend/PdfSearchModule"

export default function PdfSearchPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header
          title="Tìm File PDF Đơn"
          description="Tìm lại file PDF của các đơn hàng cũ từ thư mục lưu trữ cố định của hệ thống."
        />

        <div className="mt-4 flex-1 md:mt-5">
          <div className="p-4 lg:p-6">
            <PdfSearchModule apiBasePath="/api/pdf-search" fixedRootPath="backend/saved_orders" />
          </div>
        </div>
      </main>
    </div>
  )
}
