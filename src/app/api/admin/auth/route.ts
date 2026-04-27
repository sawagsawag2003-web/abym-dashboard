import { NextResponse } from "next/server"
import { ADMIN_AUTH_COOKIE, buildAdminCookieValue, getAdminPassword } from "@/lib/admin-auth"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const password = String(body?.password || "")

    if (!password) {
      return NextResponse.json({ error: "Thiếu mật khẩu." }, { status: 400 })
    }

    if (password !== getAdminPassword()) {
      return NextResponse.json({ error: "Mật khẩu không đúng." }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set({
      name: ADMIN_AUTH_COOKIE,
      value: buildAdminCookieValue(),
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60 * 60 * 8,
    })

    return response
  } catch (error) {
    console.error("[admin-auth] Failed to authenticate:", error)
    return NextResponse.json({ error: "Không thể xác thực." }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: ADMIN_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  })
  return response
}
