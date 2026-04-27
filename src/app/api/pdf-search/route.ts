import {
  handlePdfSearchRequest,
  handlePdfSearchStatsRequest,
} from "@/standalone/pdf-search-module/server/next-handlers"

export const runtime = "nodejs"

export async function GET(request: Request) {
  return handlePdfSearchStatsRequest(request)
}

export async function POST(request: Request) {
  return handlePdfSearchRequest(request)
}
