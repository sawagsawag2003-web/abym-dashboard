import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { MobileNav } from "@/components/dashboard/mobile-nav"
import { SearchContent } from "@/components/search/search-content"

export default function SearchPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <MobileNav />
      
      <main className="flex-1 p-3 md:p-4 lg:p-5 lg:ml-64 pt-16 lg:pt-0">
        <Header
          title="Tra cứu đơn hàng"
          description="Kiểm tra trạng thái đơn hàng bằng mã vận đơn."
        />
        <div className="mt-4 md:mt-5 flex-1">
          <div className="p-4 lg:p-6">
            <SearchContent />
          </div>
        </div>
      </main>
    </div>
  )
}
