from __future__ import annotations

import fitz  # PyMuPDF library
try:
    from normalization import normalize_variant
except ImportError:
    pass

def draw_red_circle(page, prod):
    """
    Vẽ vòng tròn đỏ bằng Tọa độ Mỏ Neo (Anchor Geometry).
    Đã chỉnh sửa: Vòng tròn nới rộng ra 1px, độ dày nét giảm xuống còn 1px.
    """
    qty = prod.get('quantity', 0)
    if not (2 <= qty <= 50): 
        return

    page_width = page.rect.width
    
    # --- 1. TRỤC Y: TÌM TỌA ĐỘ TÊN SẢN PHẨM (LÀM MỎ NEO) ---
    prod_name = prod.get('product_name', '')
    anchor_text = prod_name[:15].strip() 
    anchor_quads = page.search_for(anchor_text)
    
    if not anchor_quads:
        anchor_text = prod_name[:8].strip()
        anchor_quads = page.search_for(anchor_text)
        
    if not anchor_quads:
        return 

    valid_y_ranges = [(rect.y0 - 10, rect.y0 + 80) for rect in anchor_quads]

    # --- 2. TRỤC X: GIỚI HẠN VÙNG TÌM KIẾM (NÉ MÃ VẠCH DỌC) ---
    valid_x_min = page_width * 0.6
    valid_x_max = page_width * 0.94 
    
    # --- 3. GIỚI HẠN ĐÁY (NÉ ORDER ID VÀ QTY TOTAL) ---
    bottom_limit = page.rect.height 
    qty_totals = page.search_for("Qty Total:")
    if qty_totals:
        bottom_limit = qty_totals[-1].y0 - 5 

    # --- 4. QUÉT SỐ LƯỢNG VÀ KHOANH ĐỎ ---
    quads = page.search_for(f"{qty}")
    
    for rect in quads:
        # Kiểm tra giới hạn đáy
        if rect.y1 >= bottom_limit:
            continue

        if valid_x_min <= rect.x0 <= valid_x_max:
            for (y_min, y_max) in valid_y_ranges:
                if y_min <= rect.y0 <= y_max:
                    # KHÓA MỤC TIÊU! 
                    # Nới rộng vùng khoanh thêm 1px ở cả 4 hướng (Ví dụ: -5 thành -6)
                    rect.x0 -= 6
                    rect.y0 -= 3
                    rect.x1 += 6
                    rect.y1 += 3
                    
                    # Giảm độ dày nét vẽ xuống 1 (từ width=2 thành width=1)
                    page.draw_oval(rect, color=(1, 0, 0), width=1)
                    
                    valid_y_ranges.remove((y_min, y_max))
                    break

def draw_warning_text(page):
    """
    Hàm in chữ cảnh báo cho đơn nhiều SP.
    Đã chỉnh sửa: Font size giảm 2px (còn 10), thêm viền đen nét mảnh cho nền trắng.
    """
    quads = page.search_for("Product Name")
    if quads:
        rect = quads[0] 
        
        # Tọa độ: Lùi sang phải 10 pixel so với chữ "Product Name"
        x = rect.x1 + 10 
        y = rect.y1 
        
        text = "DON NHIEU SAN PHAM"
        fontsize = 8 # <-- GIẢM TỪ 12 XUỐNG 10
        
        # Tính toán chiều dài của dòng chữ với font size mới
        text_length = fitz.get_text_length(text, fontname="hebo", fontsize=fontsize)
        
        # Ôm sát chiều cao chữ size 10 (thay vì 12 như trước)
        bg_rect = fitz.Rect(x - 1, y - 10, x + text_length + 1, y + 2)
        
        # Vẽ nền: fill=(1,1,1) là ruột trắng, color=(0,0,0) là viền đen, width=1 là độ dày viền đen
        page.draw_rect(bg_rect, color=(0, 0, 0), fill=(1, 1, 1), width=1)
        
        # In chữ đen đè lên nền trắng
        page.insert_text((x, y), text, fontsize=fontsize, color=(0, 0, 0), fontname="hebo")


def process_and_group_pdf(mixed_pages_list, source_documents):
    """
    Xử lý gộp PDF TikTok với dữ liệu trang đã được serialize trước đó.
    """
    groups = {}
    open_documents = {file_name: fitz.open(stream=file_bytes, filetype="pdf") for file_name, file_bytes in source_documents.items()}

    # --- BƯỚC 1: GOM TẤT CẢ CÁC TRANG THEO ORDER ID ---
    orders_map = {}
    for entry in mixed_pages_list:
        data = entry['data']
        oid = data.get('order_id', 'Unknown')
        
        # Nếu không có Order ID (trường hợp dị), mượn tạm page_index để nó đứng độc lập
        if oid == "Unknown" or not oid:
            oid = f"Unknown_{entry['page_index']}"
            
        if oid not in orders_map:
            orders_map[oid] = []
        orders_map[oid].append(entry)

    # --- BƯỚC 2: QUYẾT ĐỊNH SỐ PHẬN CỦA CẢ ĐƠN HÀNG DỰA VÀO TRANG MAIN ---
    orders_summary = {}
    for oid, pages in orders_map.items():
        order_folder = "LOI_DOC_NOI_DUNG"
        order_sort_key = "ZZZ_Unknown"
        carrier = "TikTok"
        
        # Đi tìm trang Main (hoặc trang có chứa sản phẩm) để làm đại diện
        main_page = None
        for p in pages:
            # Ưu tiên trang Main có sản phẩm
            if p['data'].get('page_type') == 'Main' and p['data'].get('products'):
                main_page = p
                break
        
        # Nếu xui xẻo mất mã vạch (không nhận là Main), lấy đại trang đầu tiên có sản phẩm
        if not main_page:
            for p in pages:
                if p['data'].get('products'):
                    main_page = p
                    break
        
        # Nếu tìm thấy trang đại diện, lấy ĐÚNG SẢN PHẨM ĐẦU TIÊN
        if main_page:
            carrier = main_page['data'].get('carrier', 'TikTok')
            first_product = main_page['data']['products'][0] 
            
            # Đẩy qua hàm chuẩn hóa để lấy thông tin Folder và Sort Name
            norm = normalize_variant(first_product['variant_raw'])
            order_folder = norm['folder']
            order_sort_key = norm['sort_name']
        else:
            # Nếu toàn bộ các trang của đơn này đều trống (VD: Lỗi file in)
            if pages:
                carrier = pages[0]['data'].get('carrier', 'TikTok')

        # Lưu lại "bản án" cho đơn hàng này
        orders_summary[oid] = {
            'folder': order_folder,
            'sort_key': order_sort_key,
            'carrier': carrier
        }

    # --- BƯỚC 3: PHÂN BỔ TỪNG TRANG VÀO THƯ MỤC KẾT QUẢ ---
    for oid, pages in orders_map.items():
        summary = orders_summary[oid]
        group_name = f"{summary['carrier']}_{summary['folder']}"
        
        if group_name not in groups:
            groups[group_name] = []
            
        for p in pages:
            # Đóng gói thông tin cho từng trang, trang phụ bắt buộc mang sort_key của trang Main
            page_info = {
                'source_doc': open_documents[p['origin_file']],
                'page_index': p['page_index'],
                'sort_key': summary['sort_key'],
                'order_id': oid,
                'products': p['data']['products']
            }
            groups[group_name].append(page_info)

    # --- BƯỚC 4: SẮP XẾP VÀ XUẤT FILE PDF (MERGING & SORTING) ---
    output_files = {}

    for group_name, pages_list in groups.items():
        # Đếm tần suất bán chạy theo ĐƠN HÀNG (để đơn nhiều trang không bị buff ảo)
        unique_orders_in_group = set(p['order_id'] for p in pages_list)
        
        sort_key_counts = {}
        for oid in unique_orders_in_group:
            sk = orders_summary[oid]['sort_key']
            sort_key_counts[sk] = sort_key_counts.get(sk, 0) + 1

        # LOGIC SẮP XẾP TỐI THƯỢNG:
        # 1. Đếm count giảm dần -> Ưu tiên áo bán chạy lên đỉnh file.
        # 2. Xếp bảng chữ cái (A-Z) -> Gom các áo giống nhau lại.
        # 3. Order ID -> Đảm bảo các trang cùng 1 đơn hàng KHÔNG BỊ XÉ LẺ.
        # 4. Page Index -> Đảm bảo trang Main nằm trên, trang Phụ bám ngay bên dưới.
        pages_list.sort(key=lambda x: (
            -sort_key_counts.get(x['sort_key'], 0), 
            x['sort_key'], 
            x['order_id'], 
            x['page_index']
        ))

        # Khởi tạo file PDF cho thư mục này
        new_doc = fitz.open()
        
        for p_info in pages_list:
            src_doc = p_info['source_doc']
            idx = p_info['page_index']
            
            # Lôi trang từ file gốc nhét vào file mới
            new_doc.insert_pdf(src_doc, from_page=idx, to_page=idx)
            current_page = new_doc[-1]
            
            # 1. Tính tổng số lượng để vẽ cảnh báo !!!
            total_qty_on_page = sum(prod.get('quantity', 0) for prod in p_info['products'])
            
            if total_qty_on_page >= 2:
                draw_warning_text(current_page)
                
            # 2. BỔ SUNG LỆNH GỌI KHOANH TRÒN
            # Duyệt qua từng sản phẩm trên trang giấy đó
            for prod in p_info['products']:
                qty = prod.get('quantity', 0)
                # Chỉ khoanh đỏ những sản phẩm có số lượng từ 2 trở lên
                if qty >= 2:
                    draw_red_circle(current_page, prod)
                
        # Lưu file
        output_files[f"{group_name}.pdf"] = new_doc.tobytes()
        new_doc.close()

    for document in open_documents.values():
        document.close()

    return output_files
