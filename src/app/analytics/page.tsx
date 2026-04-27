import { AnalyticsContent } from "@/components/analytics/analytics-content"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Button } from "@/components/ui/button"

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header
          title="Phân tích"
          description="Theo dõi hiệu suất và các chỉ số đơn hàng trong kho."
          actions={
            <Button
              variant="outline"
              className="h-9 w-full bg-transparent text-sm transition-all duration-300 hover:scale-105 hover:shadow-md sm:w-auto"
            >
              Xuất báo cáo
            </Button>
          }
        />

        <div className="mt-6">
          <AnalyticsContent />
        </div>
      </main>
    </div>
  )
}
