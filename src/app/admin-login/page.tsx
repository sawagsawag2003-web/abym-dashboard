import { AdminLoginForm } from "@/components/admin/admin-login-form"

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams?: { next?: string }
}) {
  const nextUrl = searchParams?.next || "/admin"

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),linear-gradient(180deg,#f8fafc,#ffffff)] p-4">
      <AdminLoginForm nextUrl={nextUrl} />
    </main>
  )
}
