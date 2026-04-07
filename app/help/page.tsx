import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { HelpContent } from "@/components/help/help-content"

export default function HelpPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header title="Trợ giúp" description="Nhận hỗ trợ và tìm câu trả lời cho các câu hỏi thường gặp." />

        <div className="mt-6">
          <HelpContent />
        </div>
      </main>
    </div>
  )
}
