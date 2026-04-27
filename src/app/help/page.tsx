import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { HelpContent } from "@/components/help/help-content"

export default function HelpPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header title="Trợ giúp" description="Nhận hỗ trợ và tìm câu trả lời cho các câu hỏi thường gặp." />

        <div className="mt-6">
          <HelpContent />
        </div>
      </main>
    </div>
  )
}
