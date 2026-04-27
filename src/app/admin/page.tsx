import { redirect } from "next/navigation"
import { AdminAutoLogout } from "@/components/admin/admin-auto-logout"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { AdminContent } from "@/components/admin/admin-content"
import { isAdminAuthenticated } from "@/lib/admin-auth"

export default async function AdminPage() {
  const authenticated = await isAdminAuthenticated()
  if (!authenticated) {
    redirect("/admin-login?next=/admin")
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <AdminAutoLogout />
        <Header
          title="Quản Trị Hệ Thống"
          description="Theo dõi tình trạng dữ liệu, kiểm tra nhật ký hệ thống và dùng các công cụ quản trị nội bộ."
        />

        <div className="mt-4 md:mt-5">
          <AdminContent />
        </div>
      </main>
    </div>
  )
}
