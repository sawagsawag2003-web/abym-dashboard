"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LockKeyhole, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function AdminLoginForm({ nextUrl }: { nextUrl: string }) {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error || "Không thể xác thực.")
      }

      router.push(nextUrl)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md rounded-[28px] border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.35)]">
      <CardHeader className="space-y-3 border-b border-slate-100">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl text-slate-950">Đăng nhập quản trị</CardTitle>
        <CardDescription>
          Nhập mật khẩu để truy cập khu vực admin và xem log, DB cùng các công cụ hệ thống.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Mật Khẩu</label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Nhập mật khẩu"
                className="h-11 pl-10"
              />
            </div>
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

          <Button type="submit" disabled={loading || !password.trim()} className="h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Đang xác thực..." : "Đăng Nhập"}
          </Button>

          <p className="text-xs leading-5 text-slate-500">
            Mật khẩu được lưu trữ an toàn và không bao giờ được hiển thị hoặc chia sẻ. Vui lòng giữ mật khẩu của bạn an toàn.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
