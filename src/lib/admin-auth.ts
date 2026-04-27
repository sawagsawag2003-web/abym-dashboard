import crypto from "crypto"
import { cookies } from "next/headers"

export const ADMIN_AUTH_COOKIE = "xmkn_admin_auth"

function getSecret() {
  return process.env.ADMIN_PANEL_SECRET || "xmkn-local-secret"
}

export function getAdminPassword() {
  return process.env.ADMIN_PANEL_PASSWORD || "admin"
}

function signToken(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex")
}

export function buildAdminCookieValue() {
  const marker = "admin"
  return `${marker}.${signToken(marker)}`
}

export function isValidAdminCookie(value: string | undefined) {
  if (!value) return false
  const [marker, signature] = value.split(".")
  if (marker !== "admin" || !signature) return false
  return signToken(marker) === signature
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies()
  return isValidAdminCookie(cookieStore.get(ADMIN_AUTH_COOKIE)?.value)
}
