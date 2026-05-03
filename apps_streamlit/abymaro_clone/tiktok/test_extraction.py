import streamlit as st
import fitz
import re
from collections import Counter

# --- LOGIC CẮT TÊN SP DẤU CHẤM ---
def parse_tiktok_product(buffer_lines, qty):
    full_string = " ".join(buffer_lines)
    full_string = re.sub(r'\s+', ' ', full_string).strip()

    if "." in full_string:
        parts = full_string.rsplit('.', 1)
        product_name = parts[0].strip()
        variant_raw = parts[1].replace(" ", "")
        if not variant_raw: 
            variant_raw = "Mặc định"
    else:
        product_name = full_string
        variant_raw = "Thiếu dấu chấm ngăn cách"

    return {
        "quantity": qty,
        "variant_raw": variant_raw,
        "product_name": product_name
    }

# --- LOGIC EXTRACTION MỚI HOÀN TOÀN ---
def analyze_page_content_TEST(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # 1. Bắt Order ID & Tracking Code
    order_ids = re.findall(r"Order ID:\s*(\d+)", text)
    primary_order_id = order_ids[0] if order_ids else "Unknown"
    
    tracking_code = "Unknown"
    all_numbers = re.findall(r'\b\d{10,15}\b', text)
    if all_numbers:
        valid_numbers = [n for n in all_numbers if not n.startswith('0')]
        if valid_numbers:
            tracking_code = Counter(valid_numbers).most_common(1)[0][0]

    page_type = "Main" if tracking_code != "Unknown" else "Supplementary"

    # --- LOGIC MỎ NEO (CHỐNG LỖI ĐẢO LỘN TEXT) ---
    
    # 2. XÁC ĐỊNH VẠCH ĐÍCH TRƯỚC (Qty Total)
    qty_idx = -1
    for i, line in enumerate(lines):
        if "Qty Total:" in line:
            qty_idx = i
            break

    # 3. TÌM MỎ NEO TRÊN (Chỉ tìm trong vùng phía trên vạch đích)
    start_idx = -1
    # Nếu có Qty Total, chỉ tìm Product Name từ trên đỉnh xuống Qty Total.
    # Nếu không có, mới tìm hết trang.
    search_limit = qty_idx if qty_idx != -1 else len(lines)
    
    for i in range(search_limit):
        if "Product Name" in lines[i]:
            start_idx = i
            break
            
    # Xác định điểm bắt đầu cắt thực tế
    search_start = start_idx + 1 if start_idx != -1 else 0

    # 4. CHỐT ĐIỂM KẾT THÚC CẮT (End Index)
    end_idx = len(lines)
    if qty_idx != -1:
        end_idx = qty_idx # Cắt ngay tại Qty Total
    else:
        # Nếu không có Qty Total, tìm Order ID nằm phía dưới vùng sản phẩm
        for i in range(search_start, len(lines)):
            if "Order ID:" in lines[i] and i > search_start + 2:
                end_idx = i
                break

    # 5. GOM VÀ CẮT SẢN PHẨM (Khối text an toàn)
    products = []
    product_block = [] 
    
    if search_start < end_idx:
        product_block = lines[search_start : end_idx]
        
        garbage_headers = [
            "Product Name", "SKU", "Seller SKU", "Qty", 
            "In transit by:", "Customer Message:", "Parent SKU"
        ]
        
        buffer_lines = []
        current_qty = 0
        
        # Quét ngược
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
    
    return {
        "page_type": page_type,
        "order_id": primary_order_id,
        "tracking_code": tracking_code,
        "product_count": len(products),
        "products": products,
        "DEBUG_BLOCK": product_block 
    }

# --- GIAO DIỆN STREAMLIT TEST ---
st.set_page_config(page_title="Test Extraction Logic", layout="wide")
st.title("🛠️ KHU VỰC TEST LOGIC BÓC TÁCH (V4)")

uploaded_file = st.file_uploader("Tải file PDF cần test vào đây", type="pdf")

if uploaded_file:
    doc = fitz.open(stream=uploaded_file.read(), filetype="pdf")
    
    st.success(f"Đã đọc thành công file PDF với {len(doc)} trang!")
    
    for i, page in enumerate(doc):
        text = page.get_text()
        result = analyze_page_content_TEST(text)
        
        with st.expander(f"📄 Trang {i + 1} - Lớp: {result['page_type']} - Order ID: {result['order_id']}", expanded=True):
            col1, col2 = st.columns(2)
            
            with col1:
                st.markdown("**1. Khối Text đã được cắt (Vùng an toàn):**")
                st.info("\n".join(result['DEBUG_BLOCK']) if result['DEBUG_BLOCK'] else "KHÔNG TÌM THẤY VÙNG TEXT")
                
                st.markdown("**2. Text thô toàn bộ trang (Để đối chiếu):**")
                st.code(text, language="text")
                
            with col2:
                st.markdown(f"**Kết quả bóc tách ({result['product_count']} sản phẩm):**")
                st.json(result['products'])
                st.write(f"Mã Vận Đơn (Nếu có): {result['tracking_code']}")