import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { SettingsContent } from "@/components/settings/settings-content"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header title="Cài đặt" description="Quản lý tài khoản và các tùy chọn ứng dụng." />

        <div className="mt-6">
          <SettingsContent />
        </div>
      </main>
    </div>
  )
}
