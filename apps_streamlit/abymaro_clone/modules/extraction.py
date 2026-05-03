import re

def analyze_page_content(text):
    """
    Ham phan tich noi dung trang PDF (Phien ban Multi-Product).
    Tra ve danh sach TAT CA san pham trong don de check logic Hon Hop sau nay.
    """
    
    # 1. LAM PHANG VAN BAN
    clean_text = text.replace('\n', ' ').strip()
    clean_text = re.sub(r'\s+', ' ', clean_text)
    
    # --- LOGIC MỚI: QUÉT TÊN SHOP ---
    shop_names = sorted([
        "Croptop68", "Lux68", "Jimy", "Hunee.Store", "4Ustore", 
        "Gen Z.Studio", "Relach Studio", "Lumi6s", "Trend.2022",
        "Hana.Storee", "Snoppi Studio", "Wioops.shop", "Kiddo Boo", 
        "Set.storee18", "Lancy.Studio"
    ], key=len, reverse=True)
    
    shop_detected = "Không xác định"
    for shop in shop_names:
        if re.search(re.escape(shop), clean_text, re.IGNORECASE):
            shop_detected = shop
            break

    # -----------------------------------------------------------
    # 2. TIM MA VAN DON & DVVC 
    # -----------------------------------------------------------
    tracking_code = "Khong thay"
    carrier = "Khac"
    
    match_spx = re.search(r"(SPXVN\d{10,})", clean_text)
    if match_spx:
        tracking_code = match_spx.group(1).strip()
        carrier = "SPX"
    else:
        match_ghn = re.search(r"Mã\s+vận\s+đơn\s*[:.]?\s*(G[A-Z0-9]{7,})", clean_text, re.IGNORECASE)
        
        if match_ghn:
            tracking_code = match_ghn.group(1).strip()
            carrier = "GHN"

    # -----------------------------------------------------------
    # 3. TRUY XUAT TỔNG SL NẾU CÓ trên trang
    # -----------------------------------------------------------
    total_quantity = None
    total_match = re.search(r"Tổng\s*SL\s*sản\s*phẩm\s*[:\-]?\s*(\d+)", clean_text, re.IGNORECASE)
    if not total_match:
        total_match = re.search(r"Tổng\s*số\s*lượng\s*(?:sản\s*phẩm)?\s*[:\-]?\s*(\d+)", clean_text, re.IGNORECASE)
    if total_match:
        total_quantity = int(total_match.group(1))

    # -----------------------------------------------------------
    # 4. QUET TOAN BO SAN PHAM 
    # -----------------------------------------------------------
    products = []
    
    pattern_multi = r"(\d+)\.\s+(.*?)[S\s]*L:\s*(\d+)"
    matches = re.finditer(pattern_multi, clean_text)
    
    # Duyệt qua từng sản phẩm khớp với pattern
    for match in matches:
        # Lấy số thứ tự, tên đầy đủ và số lượng từ match
        stt = match.group(1) 
        full_name = match.group(2).strip()
        qty = int(match.group(3))
        
        # Chia tên sản phẩm theo dấu phẩy và loại bỏ khoảng trắng
        parts = full_name.split(',')
        parts = [p.strip() for p in parts if p.strip()]
        
        # Xử lý variant: nếu có >=2 phần, lấy 2 phần cuối với dấu phẩy
        if len(parts) >= 2:
            variant_cut = f"{parts[-2]},{parts[-1]}"
        # Nếu chỉ có 1 phần, lấy phần đó
        elif len(parts) == 1:
            variant_cut = parts[0]
        # Nếu không có phần nào, dùng tên đầy đủ
        else:
            variant_cut = full_name
            
        # Loại bỏ khoảng trắng trong variant nếu có
        if variant_cut:
            variant_cut = variant_cut.replace(" ", "")
            
        # Thêm sản phẩm vào danh sách
        products.append({
            "stt": stt,
            "variant_raw": variant_cut,
            "quantity": qty,
            "full_name_debug": full_name
        })

    status = "OK"
    if not products:
        status = "ERROR"

    return {
        "shop_name": shop_detected, # <--- Trả về Tên Shop
        "tracking_code": tracking_code,
        "carrier": carrier,
        "status": status,
        "total_quantity": total_quantity,
        "products": products
    }