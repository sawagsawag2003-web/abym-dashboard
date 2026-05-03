"use client"

import { useEffect, useMemo, useState, type CSSProperties } from "react"
import type { PdfSearchResult, PdfSearchStats } from "./types"

type Props = {
  apiBasePath?: string
  initialRootPath?: string
  fixedRootPath?: string
}

type GroupedPdfSearchResult = PdfSearchResult & {
  pageNumbers: number[]
}

function formatBytes(sizeBytes: number) {
  const sizeMb = sizeBytes / (1024 * 1024)
  if (sizeMb >= 1) return `${sizeMb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
}

function getResultKey(item: GroupedPdfSearchResult) {
  return `${item.filePath}:${item.orderId}`
}

function groupSearchResults(items: PdfSearchResult[]): GroupedPdfSearchResult[] {
  const grouped = new Map<string, GroupedPdfSearchResult>()

  for (const item of items) {
    const key = `${item.filePath}:${item.orderId}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { ...item, pageNumbers: [item.pageNumber] })
      continue
    }

    existing.pageNumbers = Array.from(new Set([...existing.pageNumbers, item.pageNumber])).sort((a, b) => a - b)
    existing.pageNumber = existing.pageNumbers[0]
  }

  return Array.from(grouped.values())
}

function formatPageNumbers(pages: number[]) {
  if (pages.length <= 1) return `Trang ${pages[0] ?? ""}`
  return `Trang ${pages.join(", ")}`
}

export function PdfSearchModule({
  apiBasePath = "/api/pdf-search",
  initialRootPath = "",
  fixedRootPath,
}: Props) {
  const [rootPath, setRootPath] = useState(fixedRootPath ?? initialRootPath)
  const [input, setInput] = useState("")
  const [results, setResults] = useState<GroupedPdfSearchResult[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({})
  const [stats, setStats] = useState<PdfSearchStats>({ totalFiles: 0, totalSizeBytes: 0 })
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canQuery = rootPath.trim().length > 0

  const loadStats = async () => {
    if (!canQuery) return

    setIsLoadingStats(true)
    setError(null)
    try {
      const query = new URLSearchParams({ rootPath: rootPath.trim() })
      const response = await fetch(`${apiBasePath}?${query.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Không thể tải thống kê")
      setStats({
        totalFiles: data.totalFiles ?? 0,
        totalSizeBytes: data.totalSizeBytes ?? 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tải thống kê")
    } finally {
      setIsLoadingStats(false)
    }
  }

  useEffect(() => {
    if (!canQuery) return
    void loadStats()
  }, [rootPath])

  const handleSearch = async () => {
    const codes = input
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)

    if (!canQuery || codes.length === 0) return

    setIsSearching(true)
    setError(null)
    setSelectedKeys({})

    try {
      const response = await fetch(apiBasePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath: rootPath.trim(), codes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Không thể tra cứu")
      setResults(groupSearchResults(data.results ?? []))
      setStats((prev) => ({
        totalFiles: data.totalFiles ?? prev.totalFiles,
        totalSizeBytes: data.totalSizeBytes ?? prev.totalSizeBytes,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi tra cứu")
    } finally {
      setIsSearching(false)
    }
  }

  const selectedItems = useMemo(
    () =>
      results
        .filter((item) => selectedKeys[getResultKey(item)])
        .flatMap((item) => item.pageNumbers.map((pageNumber) => ({ filePath: item.filePath, pageNumber }))),
    [results, selectedKeys]
  )

  const toggleSelection = (item: GroupedPdfSearchResult) => {
    const key = getResultKey(item)
    setSelectedKeys((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSelectAll = () => {
    if (results.length === 0) return

    const allSelected = results.every((item) => selectedKeys[getResultKey(item)])
    if (allSelected) {
      setSelectedKeys({})
      return
    }

    const nextState: Record<string, boolean> = {}
    for (const item of results) {
      nextState[getResultKey(item)] = true
    }
    setSelectedKeys(nextState)
  }

  const handleMerge = async () => {
    if (!canQuery || selectedItems.length === 0) return

    setIsMerging(true)
    setError(null)

    try {
      const response = await fetch(`${apiBasePath}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath: rootPath.trim(), items: selectedItems }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || "Không thể gộp file PDF")
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "gop-van-don.pdf"
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi khi gộp file")
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div>
            <div style={styles.badge}>PDF Search</div>
            <h2 style={styles.title}>Tìm kiếm & Gộp File PDF Đã In </h2>
            <p style={styles.subtitle}>
              Tra cứu mã đơn, gộp các tệp PDF đơn hàng cũ và thực hiện lệnh in hàng loạt. Hệ thống sẽ tìm kiếm trong thư mục lưu trữ cố định trên máy chủ, nơi các file PDF của đơn hàng đã in được lưu lại. Bạn chỉ cần nhập mã vận đơn để tìm lại file PDF tương ứng, sau đó có thể chọn gộp nhiều file thành một tệp duy nhất để dễ dàng in ấn hoặc lưu trữ.
            </p>
          </div>
        </div>

        {!fixedRootPath ? (
          <div style={styles.fieldBlock}>
            <label htmlFor="pdf-root-path" style={styles.label}>
              Thư mục PDF
            </label>
            <input
              id="pdf-root-path"
              type="text"
              value={rootPath}
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="Ví dụ: D:\\Data\\saved_orders"
              style={styles.input}
            />
          </div>
        ) : null}

        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Số lượng file</div>
            <div style={styles.statValue}>{stats.totalFiles.toLocaleString("vi-VN")}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Dung lượng</div>
            <div style={styles.statValue}>{formatBytes(stats.totalSizeBytes)}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Kết quả</div>
            <div style={styles.statValue}>{results.length.toLocaleString("vi-VN")}</div>
          </div>
        </div>
      </div>

      <div style={styles.panel}>
        <div style={styles.editorGrid}>
          <div style={styles.fieldBlock}>
            <label htmlFor="pdf-search-input" style={styles.label}>
              Mã vận đơn
            </label>
            <textarea
              id="pdf-search-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={"Nhập mỗi mã trên một dòng\nSPXVN066802280924\n260404VS5AQ27D"}
              style={styles.textarea}
            />
          </div>

          <div style={styles.actions}>
            <button type="button" onClick={handleSearch} disabled={!canQuery || isSearching || !input.trim()} style={styles.primaryButton}>
              {isSearching ? "Đang tìm..." : "Tìm kiếm"}
            </button>
            <button type="button" onClick={handleMerge} disabled={!canQuery || isMerging || selectedItems.length === 0} style={styles.secondaryButton}>
              {isMerging ? "Đang gộp..." : "Gộp file"}
            </button>
            <button type="button" onClick={handleSelectAll} disabled={results.length === 0} style={styles.secondaryButton}>
              Chọn tất cả
            </button>
          </div>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}></th>
                <th style={styles.th}>Mã đơn</th>
                <th style={styles.th}>DVVC</th>
                <th style={styles.th}>Tên file</th>
                <th style={styles.th}>Trang</th>
                <th style={styles.th}>Ngày</th>
                <th style={styles.th}>Dung lượng</th>
                <th style={styles.th}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={8} style={styles.emptyCell}>
                    Nhập mã vận đơn để bắt đầu tra cứu.
                  </td>
                </tr>
              ) : (
                results.map((item) => {
                  const key = getResultKey(item)
                  const query = new URLSearchParams({
                    rootPath: rootPath.trim(),
                    path: item.filePath,
                    pages: item.pageNumbers.join(","),
                  })
                  const pageUrl = `${apiBasePath}/page?${query.toString()}`
                  const downloadUrl = `${pageUrl}&download=1`

                  return (
                    <tr key={key}>
                      <td style={styles.td}>
                        <input type="checkbox" checked={Boolean(selectedKeys[key])} onChange={() => toggleSelection(item)} />
                      </td>
                      <td style={styles.tdStrong}>{item.orderId}</td>
                      <td style={styles.td}>{item.carrier || "-"}</td>
                      <td style={styles.td}>
                        <div>{item.fileName}</div>
                        <div style={styles.pathText}>{item.filePath}</div>
                      </td>
                      <td style={styles.td}>{formatPageNumbers(item.pageNumbers)}</td>
                      <td style={styles.td}>{item.createdAt}</td>
                      <td style={styles.td}>{formatBytes(item.fileSize)}</td>
                      <td style={styles.td}>
                        <div style={styles.inlineActions}>
                          <a href={pageUrl} target="_blank" rel="noreferrer" style={styles.linkButton}>
                            Xem
                          </a>
                          <a href={downloadUrl} style={styles.linkButtonPrimary}>
                            Tải
                          </a>
                          <button type="button" onClick={() => toggleSelection(item)} style={styles.linkButton}>
                            {selectedKeys[key] ? "Bỏ chọn" : "Gộp"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  container: { display: "grid", gap: "20px" },
  panel: {
    border: "1px solid #d7e3d5",
    borderRadius: "24px",
    background: "#ffffff",
    padding: "24px",
    boxShadow: "0 12px 32px rgba(18, 52, 34, 0.08)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#eef7ef",
    color: "#1f5b35",
    fontSize: "12px",
    fontWeight: 700,
    marginBottom: "12px",
  },
  title: { margin: 0, fontSize: "28px", color: "#17351f" },
  subtitle: { margin: "8px 0 0", color: "#58715f", lineHeight: 1.5 },
  fieldBlock: { display: "grid", gap: "8px" },
  label: { fontSize: "14px", fontWeight: 600, color: "#17351f" },
  input: {
    width: "100%",
    border: "1px solid #c9d7c8",
    borderRadius: "14px",
    padding: "12px 14px",
    fontSize: "14px",
  },
  textarea: {
    width: "100%",
    minHeight: "180px",
    border: "1px solid #c9d7c8",
    borderRadius: "18px",
    padding: "14px",
    fontSize: "14px",
    resize: "vertical",
    lineHeight: 1.5,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "20px",
  },
  statCard: {
    border: "1px solid #dfe8dc",
    borderRadius: "18px",
    padding: "16px",
    background: "#f9fcf8",
  },
  statLabel: { fontSize: "13px", color: "#58715f", marginBottom: "6px" },
  statValue: { fontSize: "28px", fontWeight: 700, color: "#17351f" },
  editorGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 220px",
    gap: "16px",
  },
  actions: { display: "grid", gap: "10px", alignContent: "end" },
  primaryButton: {
    border: "none",
    borderRadius: "999px",
    background: "#1f5b35",
    color: "#ffffff",
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #c9d7c8",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#17351f",
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorBox: {
    marginTop: "16px",
    border: "1px solid #f2c7c7",
    background: "#fff4f4",
    color: "#9d2b2b",
    borderRadius: "16px",
    padding: "12px 14px",
  },
  tableWrap: {
    marginTop: "16px",
    overflowX: "auto",
    border: "1px solid #dfe8dc",
    borderRadius: "18px",
  },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "960px" },
  th: { textAlign: "left", padding: "12px", background: "#f3f8f2", color: "#30503a", fontSize: "13px" },
  td: {
    padding: "12px",
    borderTop: "1px solid #edf2eb",
    verticalAlign: "top",
    color: "#17351f",
    fontSize: "14px",
  },
  tdStrong: {
    padding: "12px",
    borderTop: "1px solid #edf2eb",
    verticalAlign: "top",
    color: "#17351f",
    fontSize: "14px",
    fontWeight: 700,
  },
  emptyCell: { padding: "24px", textAlign: "center", color: "#58715f" },
  inlineActions: { display: "flex", flexWrap: "wrap", gap: "8px" },
  linkButton: {
    display: "inline-block",
    border: "1px solid #c9d7c8",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#17351f",
    padding: "8px 12px",
    fontSize: "13px",
    textDecoration: "none",
  },
  linkButtonPrimary: {
    display: "inline-block",
    border: "1px solid #1f5b35",
    borderRadius: "999px",
    background: "#1f5b35",
    color: "#ffffff",
    padding: "8px 12px",
    fontSize: "13px",
    textDecoration: "none",
  },
  pathText: { marginTop: "4px", color: "#58715f", fontSize: "12px", wordBreak: "break-all" },
}
