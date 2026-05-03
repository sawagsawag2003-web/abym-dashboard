import streamlit as st
import fitz  # PyMuPDF
import re
import pandas as pd

# --- HÀM XỬ LÝ TEXT (MÔ PHỎNG LOGIC TRONG EXTRACTION.PY) ---
def analyze_page_content_debug(text):
    """
    Hàm này mô phỏng logic của extraction.py để kiểm tra (debug).
    """
    # 1. LÀM PHẲNG VĂN BẢN (Flatten Text)
    # Thay thế xuống dòng bằng dấu cách để xử lý trường hợp mã bị rớt dòng
    clean_text = text.replace('\n', ' ').strip()
    clean_text = re.sub(r'\s+', ' ', clean_text) # Xóa khoảng trắng thừa
    
    # -----------------------------------------------------------
    # 2. TÌM MÃ VẬN ĐƠN (Logic mới theo yêu cầu)
    # -----------------------------------------------------------
    tracking_code = "Không thấy"
    carrier = "Khác"
    
    # --- LOGIC SPX ---
    match_spx = re.search(r"(SPXVN\d{10,})", clean_text)
    if match_spx:
        tracking_code = match_spx.group(1).strip()
        carrier = "SPX"
    
    # --- LOGIC GHN ---
    else:
        # Regex: Tìm "Mã vận đơn" -> dấu hai chấm/chấm -> Mã G...
        match_ghn = re.search(r"Mã\s+vận\s+đơn\s*[:.]?\s*(G[A-Z0-9]{7,})", clean_text, re.IGNORECASE)
        
        if match_ghn:
            tracking_code = match_ghn.group(1).strip()
            carrier = "GHN"
        else:
            # Fallback: Tìm mã G... đứng một mình nếu có chữ GHN trong trang
            match_ghn_raw = re.search(r"\b(G[A-Z0-9]{8,})\b", clean_text)
            if match_ghn_raw and ("GHN" in clean_text or "GIAO HANG" in clean_text.upper()):
                 tracking_code = match_ghn_raw.group(1).strip()
                 carrier = "GHN"

    # -----------------------------------------------------------
    # 3. TÌM TÊN PHÂN LOẠI (Yêu cầu 2)
    # -----------------------------------------------------------
    # Regex: Tìm từ "1." đến "L: <số>", bỏ qua chữ S ở giữa (fix lỗi S L:)
    pattern_prod = r"1\.\s+(.*?)[S\s]*L:\s*(\d+)"
    match_prod = re.search(pattern_prod, clean_text)
    
    status = "❌ Lỗi đọc nội dung"
    variant_cut = ""
    qty = 0
    full_name_debug = ""
    is_mixed = False

    # Check Đơn Hỗn Hợp (Nhiều món)
    if "2. " in clean_text and "Nội dung hàng" in clean_text:
        status = "⚠️ Đơn nhiều món (Mixed)"
        variant_cut = "Hàng nhiều món (Đơn Hỗn Hợp)"
        qty = 1 
        is_mixed = True
        
    elif match_prod:
        status = "✅ OK"
        full_name_debug = match_prod.group(1).strip()
        qty = int(match_prod.group(2))
        
        # --- LOGIC CẮT CHUỖI MỚI ---
        parts = full_name_debug.split(',')
        parts = [p.strip() for p in parts if p.strip()]
        
        if len(parts) >= 2:
            variant_cut = f"{parts[-2]}, {parts[-1]}"
        elif len(parts) == 1:
            variant_cut = parts[0]
        else:
            variant_cut = "Tên quá ngắn/Không có dấu phẩy"

        # --- XÓA KHOẢNG TRẮNG ---
        if variant_cut:
             variant_cut = variant_cut.replace(" ", "")
    
    return {
        "Mã Vận Đơn": tracking_code,
        "ĐVVC": carrier,
        "Trạng Thái": status,
        "Tên Phân Loại (Cắt & Clean)": variant_cut,
        "SL": qty,
        "Debug Full Tên": full_name_debug
    }

# --- GIAO DIỆN STREAMLIT ---
st.set_page_config(page_title="Test Logic Extraction Final", layout="wide")
st.title("🛠️ Test Extraction Module (Final Check)")
st.markdown("""
**Phiên bản này kiểm tra toàn bộ logic Extraction:**
1.  **Làm phẳng:** Nối các dòng bị ngắt quãng.
2.  **ĐVVC:** Bắt chính xác SPX và GHN (theo regex mới nhất).
3.  **Phân Loại:** Cắt 2 phần cuối sau dấu phẩy -> **XÓA TRẮNG DẤU CÁCH**.
""")

uploaded_file = st.file_uploader("Tải file PDF lên để kiểm tra", type="pdf")

if uploaded_file:
    doc = fitz.open(stream=uploaded_file.read(), filetype="pdf")
    results = []
    
    st.info(f"Đang xử lý {len(doc)} trang...")
    progress = st.progress(0)
    
    for i, page in enumerate(doc):
        text = page.get_text()
        data = analyze_page_content_debug(text)
        
        results.append({
            "Trang": i + 1,
            "Mã Vận Đơn": data["Mã Vận Đơn"], 
            "ĐVVC": data["ĐVVC"],
            "SL": data["SL"],
            "Tên Phân Loại (Kết quả)": data["Tên Phân Loại (Cắt & Clean)"], 
            "Trạng Thái": data["Trạng Thái"],
            # "Debug Tên Full": data["Debug Full Tên"]
        })
        progress.progress((i + 1) / len(doc))
        
    df = pd.DataFrame(results)
    
    # Hiển thị bảng kết quả
    st.dataframe(df, use_container_width=True, height=600)
    
    # Thống kê
    c1, c2, c3 = st.columns(3)
    c1.metric("Tổng Trang", len(doc))
    c2.metric("Đọc thành công", len(df[df['Trạng Thái'] == '✅ OK']))
    c3.metric("Không đọc được", len(df[df['Trạng Thái'] == '❌ Lỗi đọc nội dung']))
    
    # Soi lỗi (nếu có)
    err_df = df[df['Trạng Thái'] != '✅ OK']
    if not err_df.empty:
        st.error("Các trang sau không đọc được hoặc là đơn hỗn hợp:")
        st.dataframe(err_df)
    else:
        st.success("Tuyệt vời! Logic hoạt động hoàn hảo trên tất cả các trang.")