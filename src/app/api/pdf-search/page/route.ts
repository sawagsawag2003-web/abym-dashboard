import { handlePdfSearchPageRequest } from "@/standalone/pdf-search-module/server/next-handlers"

export const runtime = "nodejs"

export async function GET(request: Request) {
  return handlePdfSearchPageRequest(request)
}
