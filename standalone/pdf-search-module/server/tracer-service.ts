import { mkdtempSync, readFileSync, rmSync } from "fs"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"
import type { PdfSearchResult, PdfSearchStats } from "../frontend/types"

export interface PdfSearchServiceOptions {
  pythonExecutable?: string
  cliPath?: string
  dbFileName?: string
}

interface PythonPayload {
  root_path: string
  db_path?: string
  codes?: string[]
  relative_path?: string
  page_number?: number
  output_path?: string
  items?: Array<
    | { filePath: string; pageNumber: number }
    | { filePath: string; orderId: string; carrier: string; createdAt: string; fileSize: number }
  >
}

export interface PdfSearchCandidate {
  orderId: string
  carrier: string
  filePath: string
  createdAt: string
  fileSize: number
}

function resolveDefaultCliPath() {
  return path.join(process.cwd(), "standalone", "pdf-search-module", "python", "tracer_cli.py")
}

function normalizeRootPath(rootPath: string) {
  if (!rootPath?.trim()) throw new Error("Thieu rootPath")
  return path.resolve(rootPath.trim())
}

function resolveDbPath(rootPath: string, dbFileName: string) {
  return path.join(rootPath, dbFileName)
}

function runTracerCommand<T>(command: string, payload: PythonPayload, options: PdfSearchServiceOptions): T {
  const pythonExecutable = options.pythonExecutable || "python"
  const cliPath = options.cliPath || resolveDefaultCliPath()

  const result = spawnSync(pythonExecutable, [cliPath, command], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  })

  if (result.stderr?.trim()) {
    console.log(`[pdf-search:${command}] ${result.stderr.trim()}`)
  }

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `Pdf search command failed: ${command}`)
  }

  return JSON.parse(result.stdout || "{}") as T
}

function createBasePayload(rootPath: string, options: PdfSearchServiceOptions): PythonPayload {
  const absoluteRootPath = normalizeRootPath(rootPath)
  const dbFileName = options.dbFileName || ".tracer-index.db"
  return {
    root_path: absoluteRootPath,
    db_path: resolveDbPath(absoluteRootPath, dbFileName),
  }
}

function createTempOutputPath(prefix: string) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "pdf-search-module-"))
  return {
    tempDir,
    outputPath: path.join(tempDir, `${prefix}.pdf`),
  }
}

export function getPdfSearchStats(rootPath: string, options: PdfSearchServiceOptions = {}) {
  return runTracerCommand<PdfSearchStats>("stats", createBasePayload(rootPath, options), options)
}

export function searchPdfCodes(rootPath: string, codes: string[], options: PdfSearchServiceOptions = {}) {
  const payload = createBasePayload(rootPath, options)
  payload.codes = codes
  return runTracerCommand<{
    results: PdfSearchResult[]
    totalFiles: number
    totalSizeBytes: number
  }>("search", payload, options)
}

export function searchPdfCodesInFiles(
  rootPath: string,
  items: PdfSearchCandidate[],
  options: PdfSearchServiceOptions = {}
) {
  const payload = createBasePayload(rootPath, options)
  payload.items = items
  return runTracerCommand<{
    results: PdfSearchResult[]
  }>("search-files", payload, options)
}

export function extractPdfSearchPage(
  rootPath: string,
  filePath: string,
  pageNumber: number,
  options: PdfSearchServiceOptions = {}
) {
  const { tempDir, outputPath } = createTempOutputPath("page")

  try {
    const payload = createBasePayload(rootPath, options)
    payload.relative_path = filePath
    payload.page_number = pageNumber
    payload.output_path = outputPath

    runTracerCommand("page", payload, options)
    return readFileSync(outputPath)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export function mergePdfSearchPages(
  rootPath: string,
  items: Array<{ filePath: string; pageNumber: number }>,
  options: PdfSearchServiceOptions = {}
) {
  const { tempDir, outputPath } = createTempOutputPath("merge")

  try {
    const payload = createBasePayload(rootPath, options)
    payload.items = items
    payload.output_path = outputPath

    runTracerCommand("merge", payload, options)
    return readFileSync(outputPath)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}
