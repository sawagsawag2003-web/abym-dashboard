export type ProductClassificationSource = {
  category: string | null
  original_name: string | null
  normalized_sku: string | null
  color: string | null
  size: string | null
}

export type ClassifiedProduct = {
  category: string
  color: string
  size: string
}

function normalizeRuleText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .trim()
}

function deriveColorAndSize(row: ProductClassificationSource): { color: string; size: string } {
  const currentColor = row.color?.trim() || "Khong xac dinh"
  const currentSize = row.size?.trim() || "Khong xac dinh"

  if (currentColor !== "Khong xac dinh" && currentSize !== "Khong xac dinh") {
    return { color: currentColor, size: currentSize }
  }

  const normalizedSku = row.normalized_sku?.trim()
  if (!normalizedSku) {
    return { color: currentColor, size: currentSize }
  }

  const parts = normalizedSku.split("-").map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) {
    return { color: currentColor, size: currentSize }
  }

  return {
    color: currentColor !== "Khong xac dinh" ? currentColor : parts.slice(0, -1).join("-"),
    size: currentSize !== "Khong xac dinh" ? currentSize : parts[parts.length - 1],
  }
}

export function classifyProduct(row: ProductClassificationSource): ClassifiedProduct[] {
  const sourceText = normalizeRuleText(
    [row.normalized_sku, row.original_name, row.category].filter(Boolean).join(" ")
  )
  const { color, size } = deriveColorAndSize(row)

  if (/^BOP(?:-|$)/.test(sourceText)) {
    return [
      { category: "BoP Kids Tici", color, size },
      { category: "Raglan Kids Tici", color, size },
      { category: "Short Kids Tici", color, size },
    ]
  }

  if (/^BO(?:-|$)/.test(sourceText)) {
    return [
      { category: "Bo Kids Tici", color, size },
      { category: "Ao Kids Tici", color, size },
      { category: "Short Kids Tici", color, size },
    ]
  }

  if (/^KT(?:-|$)/.test(sourceText)) {
    return [{ category: "Ao Kids Tici", color, size }]
  }

  if (/^KQ(?:-|$)/.test(sourceText)) {
    return [{ category: "Short Kids Tici", color, size }]
  }

  if (/^KP(?:-|$)/.test(sourceText)) {
    return [{ category: "Raglan Kids Tici", color, size }]
  }

  if (/QDA1/.test(sourceText)) {
    return [{ category: "SHORT A Ni", color, size }]
  }

  if (/GK01|JEANKIEU01/.test(sourceText)) {
    return [{ category: "JEAN GK", color, size }]
  }

  if (/RETRODAM|RETRONHAT|DENTUYEN|XANHNHAT|XANHDAM/.test(sourceText)) {
    return [{ category: "JEAN THUONG", color, size }]
  }

  if (/BG01/.test(sourceText)) {
    return [{ category: "QN Baggy", color, size }]
  }

  if (/QN02|QN03|QNTRON/.test(sourceText)) {
    return [{ category: "QN Ong Rong", color, size }]
  }

  if (/SWT|WS/.test(sourceText)) {
    return [{ category: "SWEATER", color, size }]
  }

  return [{ category: "SU", color, size }]
}
