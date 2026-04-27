import { handlePdfSearchMergeRequest } from "@/standalone/pdf-search-module/server/next-handlers"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return handlePdfSearchMergeRequest(request)
}
