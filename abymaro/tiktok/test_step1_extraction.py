import streamlit as st
import fitz  # PyMuPDF
import re
import pandas as pd
from collections import Counter

# =======================================================
# LOGIC MỚI: CẮT THEO DẤU CHẤM & XÓA KHOẢNG TRẮNG PHÂN LOẠI
# =======================================================

def extract_tiktok_data(text):
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    # 1. Xác định Order ID & Tracking Code
    order_ids = re.findall(r"Order ID:\s*(\d+)", text)
    primary_order_id = order_ids[0] if order_ids else "Unknown"
    
    count_id = text.count("Order ID:")
    page_type = "Main" if count_id >= 2 else "Supplementary"

    tracking_code = "Unknown"
    all_numbers = re.findall(r'\b\d{10,15}\b', text)
    if all_numbers:
        valid_numbers = [n for n in all_numbers if not n.startswith('0')]
        if valid_numbers:
            tracking_code = Counter(valid_numbers).most_common(1)[0][0]
    
    # 2. KHOANH VÙNG DỮ LIỆU
    start_idx = -1
    for i, line in enumerate(lines):
        if "Product Name" in line: 
            start_idx = i
            break
            
    end_idx = len(lines)
    for i in range(len(lines) - 1, -1, -1):
        if "Order ID:" in lines[i] or "Qty Total:" in lines[i]:
            end_idx = i
            break
            
    products = []
    
    if start_idx != -1 and end_idx > start_idx:
        product_block = lines[start_idx+1 : end_idx]
        
        garbage_headers = [
            "Product Name", "SKU", "Seller SKU", "Qty", 
            "In transit by:", "Customer Message:"
        ]
        
        buffer_lines = []
        current_qty = 0
        
        for line in reversed(product_block):
            if any(h in line for h in garbage_headers) or "Order ID:" in line:
                continue

            if line.isdigit() and len(line) < 4:
                if buffer_lines:
                    products.append(parse_product_flatten(buffer_lines, current_qty))
                    buffer_lines = []
                current_qty = int(line)
            else:
                buffer_lines.insert(0, line)
        
        if buffer_lines and current_qty > 0:
            products.append(parse_product_flatten(buffer_lines, current_qty))
            
    products.reverse()
    return {
        "order_id": primary_order_id,
        "page_type": page_type,
        "tracking_code": tracking_code,
        "products": products
    }

def parse_product_flatten(buffer_lines, qty):
    """
    LOGIC: Nối dòng -> Cắt dấu chấm -> Xóa khoảng trắng phân loại
    """
    if not buffer_lines:
        return {"quantity": qty, "product_name": "Unknown", "classification": "", "variant_raw": ""}

    full_string = " ".join(buffer_lines)
    full_string = re.sub(r'\s+', ' ', full_string).strip()

    # Cắt theo dấu chấm "." cuối cùng
    if "." in full_string:
        parts = full_string.rsplit('.', 1)
        
        product_name = parts[0].strip()
        
        # --- THAY ĐỔI Ở ĐÂY: XÓA SẠCH KHOẢNG CÁCH ---
        # .replace(" ", "") sẽ biến "QN - Đen" thành "QN-Đen"
        classification = parts[1].replace(" ", "") 
        
        if not classification: 
            classification = "Mặc định/Không phân loại"
            
    else:
        product_name = full_string
        classification = "⚠️ Thiếu dấu chấm ngăn cách"

    return {
        "quantity": qty,
        "product_name": product_name,
        "classification": classification,
        "variant_raw": full_string
    }

# =======================================================
# GIAO DIỆN TEST
# =======================================================
st.set_page_config(page_title="Step 1: Test Extraction", layout="wide")
st.title("🛠️ Bước 1: Test Bóc Tách (No Space Variant)")
st.write("Quy tắc: Cắt dấu chấm `.` và xóa sạch khoảng trắng ở phần Phân loại.")

uploaded_file = st.file_uploader("Upload file PDF TikTok", type="pdf")

if uploaded_file:
    doc = fitz.open(stream=uploaded_file.read(), filetype="pdf")
    
    all_pages_data = []
    order_tracking_map = {} 
    
    for i, page in enumerate(doc):
        text = page.get_text()
        data = extract_tiktok_data(text)
        data['page_idx'] = i + 1
        if data['order_id'] != "Unknown" and data['tracking_code'] != "Unknown":
            order_tracking_map[data['order_id']] = data['tracking_code']
        all_pages_data.append(data)

    final_rows = []
    for data in all_pages_data:
        final_tracking = data['tracking_code']
        sync_status = "⚠️ Gốc"
        if final_tracking == "Unknown" and data['order_id'] in order_tracking_map:
            final_tracking = order_tracking_map[data['order_id']]
            sync_status = "✅ Đã điền"

        if data['products']:
            for p in data['products']:
                final_rows.append({
                    "Trang": data['page_idx'],
                    "Loại Trang": data['page_type'],
                    "SL": p['quantity'],
                    "Tên SP": p['product_name'],
                    "Phân Loại (No Space)": p['classification'],
                    "Gốc": p['variant_raw']
                })
        else:
             final_rows.append({
                "Trang": data['page_idx'],
                "Loại Trang": data['page_type'],
                "SL": 0,
                "Tên SP": "",
                "Phân Loại (No Space)": "",
                "Gốc": ""
            })

    df = pd.DataFrame(final_rows)
    
    def highlight(row):
        if "Thiếu dấu chấm" in str(row['Phân Loại (No Space)']): 
            return ['background-color: #fff3cd'] * len(row)
        return [''] * len(row)

    st.dataframe(df.style.apply(highlight, axis=1), use_container_width=True, height=600)