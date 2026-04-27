export interface PdfSearchResult {
  orderId: string
  carrier: string
  fileName: string
  filePath: string
  pageNumber: number
  createdAt: string
  fileSize: number
}

export interface PdfSearchStats {
  totalFiles: number
  totalSizeBytes: number
}
