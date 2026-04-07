import streamlit as st
import fitz  # PyMuPDF
import re
import pandas as pd
from collections import Counter

# ==========================================
# CORE LOGIC: BÓC TÁCH TIKTOK (QUÉT NGƯỢC)
# ==========================================
def extract_tiktok_data(text): # Đã sửa tên hàm cho khớp với dòng gọi lệnh
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # 1. Xác định Order ID (Dùng để gom trang phụ sau này)
    order_ids = re.findall(r"Order ID:\s*(\d+)", text)
    primary_order_id = order_ids[0] if order_ids else "Unknown"
    
    # 2. Xác định Loại Trang
    count_id = text.count("Order ID:")
    page_type = "Main" if count_id >= 2 else "Supplementary"

    # 3. TÌM MÃ VẬN ĐƠN (Tracking Code) - Bổ sung lại logic
    tracking_code = "Unknown"
    all_numbers = re.findall(r'\b\d{10,15}\b', text)
    if all_numbers:
        # Loại bỏ các số bắt đầu bằng 0 (SĐT) và lấy số xuất hiện nhiều nhất
        valid_numbers = [n for n in all_numbers if not n.startswith('0')]
        if valid_numbers:
            tracking_code = Counter(valid_numbers).most_common(1)[0][0]
    
    # 4. Tách khối sản phẩm và quét ngược
    products = []
    qty_headers = [i for i, line in enumerate(lines) if line == "Qty"]
    footer_idx = next((i for i, line in enumerate(lines) if "Qty Total:" in line), len(lines))
    
    if qty_headers:
        start_search = qty_headers[0] + 1
        product_block = lines[start_search:footer_idx]
        garbage_headers = ["Product Name", "SKU", "Seller SKU", "Qty", "In transit by:", "Order ID:"]
        
        buffer_lines = []
        current_qty = 0
        
        for line in reversed(product_block):
            if any(header in line for header in garbage_headers):
                continue
                
            if line.isdigit() and len(line) < 4:
                if buffer_lines:
                    # --- LOGIC TÁCH TÊN VÀ PHÂN LOẠI Ở ĐÂY ---
                    # Giả định: 2 dòng cuối của buffer là Phân loại, còn lại là Tên
                    if len(buffer_lines) > 2:
                        name_part = " ".join(buffer_lines[:-2])      # Lấy từ đầu đến sát 2 dòng cuối
                        class_part = " ".join(buffer_lines[-2:])     # Lấy 2 dòng cuối
                    else:
                        name_part = buffer_lines[0] if buffer_lines else "Unknown"
                        class_part = " ".join(buffer_lines[1:]) if len(buffer_lines) > 1 else "Unknown"

                    products.append({
                        "quantity": current_qty,
                        "product_name": name_part,      # Tên sản phẩm tách riêng
                        "classification": class_part,   # Tên phân loại tách riêng
                        "variant_raw": " ".join(buffer_lines) # Vẫn giữ bản thô để đối chiếu
                    })
                    buffer_lines = []
                current_qty = int(line)
            else:
                buffer_lines.insert(0, line)
                
        # Chốt sản phẩm cuối cùng (Sản phẩm đầu tiên của trang)
        if buffer_lines and current_qty > 0:
            if len(buffer_lines) > 2:
                name_part = " ".join(buffer_lines[:-2])
                class_part = " ".join(buffer_lines[-2:])
            else:
                name_part = buffer_lines[0]
                class_part = " ".join(buffer_lines[1:])
                
            products.append({
                "quantity": current_qty,
                "product_name": name_part,
                "classification": class_part,
                "variant_raw": " ".join(buffer_lines)
            })
            
    products.reverse()
    return {
        "order_id": primary_order_id,
        "page_type": page_type,
        "tracking_code": tracking_code,
        "products": products
    }

# ==========================================
# GIAO DIỆN STREAMLIT
# ==========================================
st.set_page_config(page_title="Test TikTok Parser", layout="wide")
st.title("🎵 TikTok Order Parser Test")
st.write("### Trạng thái: Chờ tải tệp PDF TikTok...") 

uploaded_file = st.file_uploader("Chọn file PDF TikTok", type="pdf", key="tiktok_uploader_unique")

if uploaded_file:
    doc = fitz.open(stream=uploaded_file.read(), filetype="pdf")
    
    # 1. BỘ NHỚ TẠM ĐỂ ĐỒNG BỘ MÃ VẬN ĐƠN
    all_pages_raw_data = []
    order_tracking_map = {} # Lưu { "Order_ID": "Ma_Van_Don" }
    
    st.info(f"Đang phân tích {len(doc)} trang...")
    
    # QUÉT LẦN 1: Thu thập mã vận đơn từ các trang chính (Main)
    for i, page in enumerate(doc):
        text = page.get_text()
        data = extract_tiktok_data(text) # Gọi hàm bóc tách
        data['trang_index'] = i + 1
        
        # Nếu tìm thấy mã vận đơn thực sự, lưu vào bản đồ
        if data['order_id'] != "Unknown" and data['tracking_code'] != "Unknown":
            order_tracking_map[data['order_id']] = data['tracking_code']
        
        all_pages_raw_data.append(data)

    # QUÉT LẦN 2: Điền mã vận đơn vào trang phụ và tạo bảng
    all_rows = []
    for data in all_pages_raw_data:
        # Lấy mã vận đơn từ bộ nhớ nếu trang hiện tại bị "Unknown"
        final_tracking = data['tracking_code']
        if final_tracking == "Unknown" and data['order_id'] in order_tracking_map:
            final_tracking = order_tracking_map[data['order_id']]

        if data['products']:
            for p in data['products']:
                all_rows.append({
                    "Trang": data['trang_index'],
                    "Order ID": data['order_id'],
                    "Loại Trang": data['page_type'],
                    "Mã Vận Đơn": final_tracking, # Đã được đồng bộ
                    "SL": p['quantity'],
                    "Nội dung thô (Variant Raw)": p['variant_raw']
                })
        else:
            all_rows.append({
                "Trang": data['trang_index'],
                "Order ID": data['order_id'],
                "Loại Trang": data['page_type'],
                "Mã Vận Đơn": final_tracking,
                "SL": 0,
                "Nội dung thô (Variant Raw)": "⚠️ Trang phụ hoặc không có SP"
            })

    # HIỂN THỊ KẾT QUẢ
    df = pd.DataFrame(all_rows)
    st.divider()
    st.subheader("📝 Chi Tiết Từng Trang")
    
    # Hàm tô màu để phân biệt trang chính/phụ
    def highlight_row(row):
        if row['SL'] == 0: return ['background-color: #f0f0f0'] * len(row)
        if row['Loại Trang'] == 'supplementary': return ['background-color: #e6f3ff'] * len(row)
        return [''] * len(row)

    st.dataframe(df.style.apply(highlight_row, axis=1), use_container_width=True, height=400)