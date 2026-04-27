"use client"

import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Header } from "@/components/dashboard/header"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function LogoutPage() {
  const router = useRouter()

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 p-3 pt-16 md:p-4 lg:ml-64 lg:p-5 lg:pt-0">
        <Header title="Đăng xuất" description="Xác nhận rời khỏi phiên làm việc hiện tại." />

        <div className="flex min-h-[calc(100vh-160px)] items-center justify-center">
          <Card className="animate-fade-in space-y-6 p-8 text-center w-full max-w-md">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <LogOut className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-2xl font-bold text-foreground">Đăng xuất</h2>
              <p className="text-muted-foreground">Bạn có chắc chắn muốn đăng xuất?</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => router.back()}>
                Hủy
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={() => router.push("/")}>
                Đăng xuất
              </Button>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
