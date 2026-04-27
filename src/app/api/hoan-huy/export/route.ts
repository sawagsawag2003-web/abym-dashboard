import path from "path"
import { spawn } from "child_process"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      rows?: Array<Record<string, unknown>>
      filename?: string
    }

    const rows = Array.isArray(body.rows) ? body.rows : []
    const filename = (body.filename || "don-hoan-huy.xlsx").replace(/[^\w.-]+/g, "_")
    const scriptPath = path.resolve(process.cwd(), "backend", "export_hoan_huy_xlsx.py")

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn("python", [scriptPath], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)))
      child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)))
      child.on("error", reject)
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(Buffer.concat(stderrChunks).toString("utf-8") || `Python exited with code ${code}`))
          return
        }
        resolve(Buffer.concat(stdoutChunks))
      })

      child.stdin.write(JSON.stringify({ rows }))
      child.stdin.end()
    })

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("[hoan-huy-export-api] Failed to export xlsx:", error)
    return Response.json({ error: "Failed to export xlsx" }, { status: 500 })
  }
}
