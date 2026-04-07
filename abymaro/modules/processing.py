import fitz  # PyMuPDF
try:
    from normalization import normalize_variant
except:
    from normalization import normalize_variant

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


def process_and_group_pdf(mixed_pages_list):
    """
    Ham xu ly GOP CHUNG: Nhan vao danh sach tat ca cac trang tu nhieu file khac nhau.
    """
    groups = {}

    # --- BUOC 1: PHAN LOAI TRANG VAO CAC NHOM ---
    for entry in mixed_pages_list:
        source_doc = entry['doc']
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

    return output_files