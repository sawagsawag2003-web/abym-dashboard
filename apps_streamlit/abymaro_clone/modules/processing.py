from __future__ import annotations

from pathlib import Path

import fitz  # PyMuPDF

try:
    from normalization import normalize_variant
except Exception:
    from normalization import normalize_variant


UNICODE_FONT_PATH = Path("C:/Windows/Fonts/arial.ttf")
SHOPEE_FONT_NAME = "shopeearial"


def _shopee_font_name(page):
    if not UNICODE_FONT_PATH.exists():
        return "helv"
    try:
        page.insert_font(fontname=SHOPEE_FONT_NAME, fontfile=str(UNICODE_FONT_PATH))
        return SHOPEE_FONT_NAME
    except Exception:
        return "helv"


def _text_width(text, font_size, font_name="helv"):
    try:
        return fitz.get_text_length(text, fontname=font_name, fontsize=font_size)
    except Exception:
        return fitz.get_text_length(text, fontname="helv", fontsize=font_size)


def _display_variant(product):
    full_name = str(product.get("full_name_debug") or "").strip()
    parts = [part.strip() for part in full_name.split(",") if part.strip()]
    if len(parts) >= 2:
        return f"{parts[-2]},{parts[-1]}"
    if parts:
        return parts[-1]
    return str(product.get("variant_raw") or "").strip()


def _fit_font_size(lines, rect, max_font=8.5, min_font=5.5):
    for font_size in (max_font, 8, 7.5, 7, 6.5, 6, min_font):
        line_height = font_size * 1.2
        if line_height * len(lines) > rect.height:
            continue
        if all(_text_width(line, font_size) <= rect.width - 2 for line in lines):
            return font_size
    return min_font


def redraw_shopee_item_summary(page, products):
    """Cover Shopee item detail text and redraw a compact variant/quantity list."""
    if not products:
        return

    header_rects = page.search_for("Nội dung hàng")
    if not header_rects:
        return
    header_rect = header_rects[0]

    note_rects = page.search_for("Người gửi")
    note_rects = [rect for rect in note_rects if rect.y0 > header_rect.y1]
    bottom = min((rect.y0 for rect in note_rects), default=header_rect.y1 + 105) - 1

    right_candidates = []
    for marker in ("Ngày đặt", "HN", "Khối lượng"):
        right_candidates.extend(
            rect.x0
            for rect in page.search_for(marker)
            if rect.y0 > header_rect.y0 and rect.x0 > page.rect.width * 0.55
        )
    right = min(right_candidates, default=page.rect.width * 0.72) - 4

    overlay_rect = fitz.Rect(
        max(6, header_rect.x0 - 2),
        header_rect.y1 + 2,
        min(right, page.rect.x1 - 8),
        min(bottom, page.rect.y1 - 20),
    )
    if overlay_rect.height < 10 or overlay_rect.width < 40:
        return

    lines = [
        f"{product.get('stt', index)}. {_display_variant(product)}, SL: {product.get('quantity', '')}"
        for index, product in enumerate(products, start=1)
    ]

    page.draw_rect(overlay_rect, color=None, fill=(1, 1, 1), overlay=True)

    font_name = _shopee_font_name(page)
    font_size = _fit_font_size(lines, overlay_rect)
    line_height = font_size * 1.2
    y = overlay_rect.y0 + font_size + 1
    for line in lines:
        if y > overlay_rect.y1:
            break
        page.insert_text(
            (overlay_rect.x0 + 1, y),
            line,
            fontsize=font_size,
            color=(0, 0, 0),
            fontname=font_name,
            overlay=True,
        )
        y += line_height

def draw_red_circle(page, qty):
    """Ve vong tron do quanh so luong (Giu nguyen logic cu)"""
    if not (2 <= qty <= 20):
        return

    search_patterns = [f"SL: {qty}", f"SL:{qty}", f"L: {qty}", f"L:{qty}", f"SL : {qty}", f"L : {qty}"]
    
    for pattern in search_patterns:
        quads = page.search_for(pattern)
        if quads:
            rect = quads[0]
            rect.x0 -= 3; rect.y0 -= 3; rect.x1 += 3; rect.y1 += 3
            page.draw_oval(rect, color=(1, 0, 0), width=0.8)
            break

# --- TÍNH NĂNG MỚI: VẼ KHUNG VUÔNG CHO ĐƠN > 9 ---
def draw_red_square(page, total_qty):
    """Vẽ hình chữ nhật (khung vuông) đỏ quanh chữ Tổng SL sản phẩm"""
    if total_qty <= 9:
        return
        
    # Các biến thể text có thể xuất hiện trên nhãn in Shopee
    search_patterns = [
        f"(Tổng SL sản phẩm: {total_qty})",
        f"Tổng SL sản phẩm: {total_qty}",
        f"Tổng SL sản phẩm:{total_qty}",
        f"Tổng SL sản phẩm : {total_qty}"
    ]
    
    for pattern in search_patterns:
        quads = page.search_for(pattern)
        if quads:
            # Nếu tìm thấy, lấy tọa độ đóng khung luôn
            rect = quads[0]
            # Nới rộng khung ra một tí cho nó thoáng chữ, dễ nhìn
            rect.x0 -= 4; rect.y0 -= 4; rect.x1 += 4; rect.y1 += 4
            # Dùng draw_rect để vẽ hình chữ nhật, set width=1.5 cho nét nó đậm đà
            page.draw_rect(rect, color=(1, 0, 0), width=1.5)
            break


def process_and_group_pdf(mixed_pages_list, source_documents):
    """
    Xử lý gộp PDF Shopee.

    `mixed_pages_list` chỉ chứa dữ liệu tuần tự hóa của từng trang.
    `source_documents` là map `tên file -> bytes` để mở lại PDF khi xuất kết quả.
    """
    groups = {}

    open_documents = {file_name: fitz.open(stream=file_bytes, filetype="pdf") for file_name, file_bytes in source_documents.items()}

    for entry in mixed_pages_list:
        source_doc = open_documents[entry["origin_file"]]
        page_idx = entry['page_index']
        data = entry['data']
        
        carrier = data['carrier']
        products = data['products']
        
        final_folder = "LOI_DOC_NOI_DUNG"
        sort_key = "000_Unknown"
        
        if products:
            detected_folders = set()
            norm_list = []
            for p in products:
                norm = normalize_variant(p['variant_raw'])
                detected_folders.add(norm['folder'])
                norm_list.append(norm)
            
            if len(detected_folders) > 1:
                final_folder = "HON_HOP"
                sort_key = f"MIXED_{norm_list[0]['sort_name']}"
            else:
                final_folder = list(detected_folders)[0]
                sort_key = norm_list[0]['sort_name']

        group_name = f"{carrier}_{final_folder}"
        
        page_info = {
            'source_doc': source_doc, 
            'page_index': page_idx,
            'sort_key': sort_key,
            'products': products
        }

        if group_name not in groups:
            groups[group_name] = []
        groups[group_name].append(page_info)

    # --- BUOC 2: SAP XEP VA TAO PDF KET QUA ---
    output_files = {}

    for group_name, pages_list in groups.items():
        counts = {}
        for p in pages_list:
            k = p['sort_key']
            counts[k] = counts.get(k, 0) + 1
            
        pages_list.sort(key=lambda x: (-counts[x['sort_key']], x['sort_key']))

        new_doc = fitz.open()
        
        for p_info in pages_list:
            src_doc = p_info['source_doc'] 
            idx = p_info['page_index']
            
            new_doc.insert_pdf(src_doc, from_page=idx, to_page=idx)
            
            current_page = new_doc[-1]
            
            # --- LOGIC MỚI: TÍNH TỔNG SỐ LƯỢNG TRONG TRANG ---
            total_qty_in_page = 0
            
            for prod in p_info['products']:
                qty = prod['quantity']
                total_qty_in_page += qty # Cộng dồn số lượng
                
                # Vẽ vòng tròn cho phân loại >= 2 (Logic cũ)
                if qty >= 2:
                    draw_red_circle(current_page, qty)
            
            # Nếu tổng bill > 9 món -> Kích hoạt skill vẽ khung vuông
            if total_qty_in_page > 9:
                draw_red_square(current_page, total_qty_in_page)
        
        output_files[f"{group_name}.pdf"] = new_doc.tobytes()
        new_doc.close()

    for document in open_documents.values():
        document.close()

    return output_files
