import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { SettingsContent } from "@/components/settings/settings-content"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header title="Cài đặt" description="Quản lý tài khoản và các tùy chọn ứng dụng." />

        <div className="mt-6">
          <SettingsContent />
        </div>
      </main>
    </div>
  )
}
