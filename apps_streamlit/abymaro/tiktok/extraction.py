import re
import unicodedata
from collections import Counter

TIKTOK_SHOP_NAMES = sorted(
    [
        "98.northside",
        "XM Kỷ Nguyên",
        "XM.Kỷ Nguyên",
        "Hunee.store",
        "6SShop",
        "Relach.studio",
        "Lives.Store",
        "Vibes Kids VN",
        "Gen Z.Studio",
        "Five.Star",
    ],
    key=len,
    reverse=True,
)

XM_SPACED_SHOP = "XM Kỷ Nguyên"
XM_DOTTED_SHOP = "XM.Kỷ Nguyên"


def normalize_for_match(value: str) -> str:
    """Normalize OCR/PDF text so matching survives accents, spaces, and punctuation."""
    ascii_text = unicodedata.normalize("NFKD", value)
    ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    return re.sub(r"[^a-z0-9]+", "", ascii_text)


def normalize_shop_text(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", value or "")
    ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    return re.sub(r"\s+", " ", ascii_text)


def detect_xm_shop_name(text: str) -> str | None:
    normalized_text = normalize_shop_text(text)
    candidates: list[tuple[int, int, str]] = []

    for match in re.finditer(r"(?<![a-z0-9])xm\s*\.\s*ky\s+nguyen(?![a-z0-9])", normalized_text):
        candidates.append((match.start(), 0, XM_DOTTED_SHOP))

    for match in re.finditer(r"(?<![a-z0-9])xm\s+ky\s+nguyen(?![a-z0-9])", normalized_text):
        candidates.append((match.start(), 1, XM_SPACED_SHOP))

    if not candidates:
        return None

    return sorted(candidates)[0][2]


def detect_shop_name(text: str) -> str:
    xm_shop = detect_xm_shop_name(text)
    if xm_shop:
        return xm_shop

    normalized_text = normalize_for_match(text)
    for candidate in TIKTOK_SHOP_NAMES:
        if normalize_for_match(candidate) in normalized_text:
            return candidate
    return "Không xác định"


def detect_carrier(text: str) -> tuple[str, str]:
    normalized_text = normalize_for_match(text)

    viettel_match = re.search(r"(VTPVN\d+)", text, re.IGNORECASE)
    if viettel_match:
        return viettel_match.group(1), "Viettel"

    best_match = re.search(r"(TTVN\d+)", text, re.IGNORECASE)
    if best_match:
        return best_match.group(1), "BEST"

    jt_match = re.search(r"\b(8\d{10,14})\b", text)
    if jt_match:
        return jt_match.group(1), "JT"

    all_numbers = re.findall(r"\b\d{10,15}\b", text)
    valid_numbers = [n for n in all_numbers if not n.startswith("0")]
    tracking_code = Counter(valid_numbers).most_common(1)[0][0] if valid_numbers else "Unknown"

    if "jtexpress" in normalized_text or "jandt" in normalized_text:
        return tracking_code, "JT"
    if "bestexpress" in normalized_text:
        return tracking_code, "BEST"
    if "viettelpost" in normalized_text or "viettel" in normalized_text:
        return tracking_code, "Viettel"
    if "spxexpress" in normalized_text or "spx" in normalized_text:
        return tracking_code, "SPX"

    return tracking_code, "Khac"


def analyze_page_content(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    clean_text = re.sub(r"\s+", " ", text).strip()

    shop_name = detect_shop_name(clean_text)
    
    # 1. Bắt Order ID (GIỮ NGUYÊN BẢN GỐC)
    order_ids = re.findall(r"Order ID:\s*(\d+)", text)
    primary_order_id = order_ids[0] if order_ids else "Unknown"
    
    # Đếm số lượng Order ID để xác định trang Main/Phụ (GIỮ NGUYÊN BẢN GỐC)
    count_id = text.count("Order ID:")
    page_type = "Main" if count_id >= 2 else "Supplementary"

    # --- LOGIC NHẬN DIỆN ĐƠN VỊ VẬN CHUYỂN MỚI TỪ BẠN ---
    tracking_code, carrier = detect_carrier(text)

    # Nếu có mã vận đơn thì chắc chắn 100% là Main (GIỮ NGUYÊN BẢN GỐC)
    if tracking_code != "Unknown":
        page_type = "Main"

    # --- 2. LOGIC MỎ NEO (ĐÃ NÂNG CẤP ĐỂ CHỐNG LỖI ĐẢO LỘN TEXT) ---
    
    # A. XÁC ĐỊNH VẠCH ĐÍCH TRƯỚC (Qty Total)
    qty_idx = -1
    for i, line in enumerate(lines):
        if "Qty Total:" in line:
            qty_idx = i
            break

    # B. TÌM MỎ NEO TRÊN (Chỉ tìm "Product Name" trong vùng phía trên vạch đích)
    start_idx = -1
    search_limit = qty_idx if qty_idx != -1 else len(lines)
    
    for i in range(search_limit):
        if "Product Name" in lines[i]:
            start_idx = i
            break
            
    search_start = start_idx + 1 if start_idx != -1 else 0

    # C. CHỐT ĐIỂM KẾT THÚC CẮT (End Index)
    end_idx = len(lines)
    if qty_idx != -1:
        end_idx = qty_idx
    else:
        for i in range(search_start, len(lines)):
            if "Order ID:" in lines[i] and i > search_start + 2:
                end_idx = i
                break

    # --- 3. GOM VÀ CẮT SẢN PHẨM (GIỮ NGUYÊN LOGIC BOTTOM-UP BẢN GỐC) ---
    products = []
    
    if search_start < end_idx:
        product_block = lines[search_start : end_idx]
        
        # Danh sách từ rác giữ nguyên
        garbage_headers = [
            "Product Name", "SKU", "Seller SKU", "Qty", 
            "In transit by:", "Customer Message:", "Parent SKU"
        ]
        
        buffer_lines = []
        current_qty = 0
        
        for line in reversed(product_block):
            if any(h in line for h in garbage_headers):
                continue

            if line.isdigit() and len(line) < 4:
                if buffer_lines and current_qty > 0:
                    products.append(parse_tiktok_product(buffer_lines, current_qty))
                    buffer_lines = []
                current_qty = int(line)
            else:
                buffer_lines.insert(0, line)
        
        if buffer_lines and current_qty > 0:
            products.append(parse_tiktok_product(buffer_lines, current_qty))
            
    products.reverse()
    
    # DỮ LIỆU TRẢ VỀ GIỮ NGUYÊN 100% (Để app.py không bị lỗi)
    return {
        "tracking_code": tracking_code,
        "carrier": carrier,
        "shop_name": shop_name,
        "order_id": primary_order_id,
        "page_type": page_type,
        "products": products,
        "status": "OK" if products else "NO_PROD" 
    }

def parse_tiktok_product(buffer_lines, qty):
    """
    Hàm tách Tên và Phân loại dựa trên dấu chấm.
    """
    if not buffer_lines:
        return {"quantity": qty, "variant_raw": "", "product_name": "Unknown"}

    # Nối tất cả các dòng thành 1 chuỗi dài
    full_string = " ".join(buffer_lines)
    # Xử lý khoảng trắng thừa (nếu có 2 dấu cách liên tiếp -> thành 1)
    full_string = re.sub(r'\s+', ' ', full_string).strip()

    # LOGIC CỐT LÕI: Cắt theo dấu chấm "." cuối cùng
    if "." in full_string:
        # rsplit('.', 1) nghĩa là tách từ bên phải, lấy 1 lần tách
        parts = full_string.rsplit('.', 1)
        product_name = parts[0].strip()
        
        # Lấy phần phân loại (Variant)
        variant_raw = parts[1].strip()
        
        # XÓA KHOẢNG TRẮNG Ở PHÂN LOẠI
        # Để normalization.py xử lý regex dễ hơn (VD: "Màu Đen" -> "MàuĐen")
        variant_raw = variant_raw.replace(" ", "")
        
        if not variant_raw: 
            variant_raw = "Mặc định"
    else:
        # Trường hợp không có dấu chấm: Báo lỗi vào variant để người dùng biết
        product_name = full_string
        variant_raw = "Thiếu dấu chấm ngăn cách"

    return {
        "quantity": qty,
        "variant_raw": variant_raw, # Chuỗi này sẽ được gửi sang normalization.py
        "product_name": product_name
    }
