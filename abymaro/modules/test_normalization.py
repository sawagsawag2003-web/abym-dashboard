import streamlit as st
import pandas as pd
# Import hàm từ file module
from normalization import normalize_variant

st.set_page_config(page_title="Test Normalization Batch", layout="wide")
st.title("🧪 Test Bước 2: Chuẩn hóa (Paste nhiều dòng)")

st.markdown("""
**Hướng dẫn:**
1. Copy danh sách tên phân loại từ file Excel hoặc Text (mỗi tên 1 dòng).
2. Paste vào ô bên dưới.
3. Bấm **Chạy Kiểm Tra**.
""")

# Ô nhập liệu lớn (Text Area)
input_blob = st.text_area(
    "Dán dữ liệu vào đây:", 
    height=300, 
    placeholder="SWT - DOZECAT Đen,XL (65-80kg)\n1. Áo thun, SU Trắng, L\n..."
)

if st.button("🚀 CHẠY KIỂM TRA", type="primary"):
    if not input_blob.strip():
        st.warning("Chưa có dữ liệu!")
    else:
        # Tách dòng
        lines = input_blob.strip().split('\n')
        
        results = []
        for line in lines:
            raw_line = line.strip()
            if not raw_line: continue # Bỏ qua dòng trống
            
            # Gọi hàm chuẩn hóa
            res = normalize_variant(raw_line)
            
            results.append({
                "Dữ Liệu Gốc": raw_line,
                "📂 Folder": res['folder'],
                "🏷️ Tên Sắp Xếp": res['sort_name'],
                "Mã": res['ma_sp'],
                "Màu": res['mau'],
                "Size": res['size']
            })
            
        # Hiển thị kết quả dạng bảng
        df = pd.DataFrame(results)
        
        st.success(f"Đã xử lý xong {len(results)} dòng.")
        st.dataframe(df, use_container_width=True, height=600)
        
        # Thống kê nhanh xem nó chia vào các folder nào
        st.divider()
        st.subheader("📊 Thống kê phân bổ Folder")
        st.bar_chart(df['📂 Folder'].value_counts())