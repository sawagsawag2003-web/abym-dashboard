import streamlit as st
import fitz
import pandas as pd
import zipfile
import io
import sys
import hashlib
from datetime import datetime
from pathlib import Path
from logger_system import log_hidden

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from database import init_db, save_to_sqlite, save_uploaded_pdf, to_project_relative

# Import linh hoạt các module
try:
    from extraction import analyze_page_content
    from normalization import normalize_variant
    from processing import process_and_group_pdf
except ImportError:
    from extraction import analyze_page_content
    from normalization import normalize_variant
    from processing import process_and_group_pdf


st.set_page_config(page_title="SHOPEE - Bộ Xử Lý Nhãn In", layout="wide")
init_db()

st.markdown(
    """
    <div style="
        background-color: #fd5f32; 
        padding: 25px; 
        border-radius: 16px; 
        margin-bottom: 25px; 
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        color: #ffffff;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    ">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="
                position: relative;
                background-color: #fd5f32;
                border-radius: 8px;
                padding: 8px 20px;
                margin-right: 20px;
                overflow: hidden;
            ">
                <span style='
                    font-weight: 900;
                    font-size: 2.8em;
                    letter-spacing: 1.5px;
                    position: relative;
                    z-index: 2;
                    color: #ffffff;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                '>SHOPEE</span>
            </div>
            <h1 style='
                margin: 0; 
                font-weight: 800; 
                font-size: 1.8em; 
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #ffffff;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            '>
                Hệ Thống Phân Loại & Gộp Nhãn In
            </h1>
        </div>
        <div style="
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 30px; 
            border-top: 2px solid rgba(255,255,255,0.2); 
            padding-top: 20px;
        ">
            <div>
                <p style="
                    margin: 0 0 10px 0; 
                    font-weight: bold; 
                    font-size: 1.1em;
                    text-transform: uppercase;
                    color: #ffffff;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                ">QUY TRÌNH VẬN HÀNH:</p>
                <p style="margin: 0;text-shadow: 2px 2px 2px rgba(0,0,0,0.15); font-size: 0.95em; opacity: 1; line-height: 1.5;">1. Tải PDF lên -> 2. Kiểm tra <b>Bảng Chỉ Số</b> -> 3. Tải file ZIP đã chia theo SKU - DVVC.</p>
            </div>
            <div>
                <p style="
                    margin: 0 0 10px 0; 
                    font-weight: bold; 
                    font-size: 1.1em;
                    text-transform: uppercase;
                    color: #ffffff;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                ">KÝ HIỆU TRÊN GIẤY IN:</p>
                <p style="margin: 0;text-shadow: 2px 2px 2px rgba(0,0,0,0.15); font-size: 0.95em; opacity: 1; line-height: 1.5;">⭕ <b>Vòng đỏ:</b> Phân loại có SL >1 | ⬛ <b>Mộc đen:</b> Đơn nhiều món </p>
            </div>
        </div>
    </div>
    """, 
    unsafe_allow_html=True
)

# 1. Tai nhieu file cung luc
uploaded_files = st.file_uploader("Tải lên file PDF Shopee", type="pdf", accept_multiple_files=True)

if "last_saved_upload_batch" not in st.session_state:
    st.session_state.last_saved_upload_batch = []

current_file_hashes = []
if uploaded_files:
    for f in uploaded_files:
        file_bytes = f.read()
        current_file_hashes.append(hashlib.md5(file_bytes).hexdigest())
        f.seek(0)
else:
    st.session_state.last_saved_upload_batch = []

if uploaded_files:
    should_persist_upload = current_file_hashes != st.session_state.last_saved_upload_batch

    # --- LOG ẨN KHI TẢI LÊN ---
    names = ", ".join([f.name for f in uploaded_files])
    log_hidden(f"📥 TẢI LÊN: {len(uploaded_files)} file ({names})")

    # --- BUOC 1: LOC FILE TRUNG LAP ---
    valid_files = []
    seen_files = set()
    for f in uploaded_files:
        file_identifier = (f.name, f.size)
        if file_identifier not in seen_files:
            seen_files.add(file_identifier)
            valid_files.append(f)
        else:
            st.warning(f"Da bo qua file trung: **{f.name}**")

    # --- BUOC 2: KHOI TAO BIEN LUU TRU ---
    all_pages_flat_list = [] 
    preview_rows = []
    orders_data = []
    items_data = []
    saved_file_paths = {}
    total_original_pages = 0

    # --- BUOC 3: QUET DU LIEU TUNG FILE ---
    progress_bar = st.progress(0, text="Dang xu ly du lieu...")
    
    for idx, uploaded_file in enumerate(valid_files):
        uploaded_file.seek(0)
        file_bytes = uploaded_file.read()

        if should_persist_upload:
            saved_path = save_uploaded_pdf("Shopee", uploaded_file.name, file_bytes)
            saved_file_paths[uploaded_file.name] = to_project_relative(saved_path)
        
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        total_original_pages += len(doc) 
        
        for i, page in enumerate(doc):
            text = page.get_text()
            extract_data = analyze_page_content(text)
            
            all_pages_flat_list.append({
                "doc": doc,            
                "page_index": i,       
                "data": extract_data,  
                "origin_file": uploaded_file.name 
            })

            tracking_code = extract_data.get("tracking_code")
            if tracking_code and tracking_code != "Khong thay":
                orders_data.append({
                    "order_code": tracking_code,
                    "platform": "Shopee",
                    "carrier": extract_data.get("carrier"),
                    "shop_name": extract_data.get("shop_name"),
                    "ship_date": None,
                    "file_source": saved_file_paths.get(uploaded_file.name, uploaded_file.name),
                    "created_at": datetime.now().isoformat(timespec="seconds"),
                })
            
            if extract_data['products']:
                for p in extract_data['products']:
                    norm = normalize_variant(p['variant_raw'])
                    preview_rows.append({
                        "Trang": i + 1,
                        "File Goc": uploaded_file.name,
                        "Tên Shop": extract_data.get('shop_name', 'Không xác định'), # <--- ĐÃ THÊM CỘT TÊN SHOP VÀO BẢNG
                        "Ma Van Don": extract_data['tracking_code'],
                        "DVVC": extract_data['carrier'],
                        "San Pham": p['variant_raw'],
                        "SL": p['quantity'],
                        "Tong SL": extract_data.get('total_quantity'),
                        "Folder": norm['folder'],
                        "Hinh In": norm['hinh_in'],
                        "Size": norm['size'],
                        "Ma SP": norm['ma_sp'],
                        "Phan Loai Chuan": norm['sort_name']
                    })
                    if tracking_code and tracking_code != "Khong thay":
                        items_data.append({
                            "order_code": tracking_code,
                            "category": norm["folder"],
                            "original_name": p.get("full_name_debug") or p["variant_raw"],
                            "normalized_sku": norm["sort_name"],
                            "quantity": p["quantity"],
                        })
        
        progress_bar.progress((idx + 1) / len(valid_files))

    progress_bar.empty() 
    df_total = pd.DataFrame(preview_rows)

    if should_persist_upload and (orders_data or items_data):
        save_to_sqlite(orders_data, items_data)
        st.session_state.last_saved_upload_batch = current_file_hashes

    # --- BUOC 4: KHU VUC DOI CHIEU & KIEM SOAT ---
    st.subheader("ĐỐI CHIẾU - KIỂM SOÁT TRÙNG LẶP & ĐƠN LỚN")
    
    if not df_total.empty:
        df_total = df_total.set_index("Trang")

        tong_trang_da_doc = len(all_pages_flat_list) 
        tong_san_pham = df_total['SL'].sum()         
        
        df_valid = df_total[df_total['Ma Van Don'] != "Khong thay"].copy()
        
        # Check trùng lặp
        check_cross = df_valid.groupby('Ma Van Don')['File Goc'].nunique()
        real_duplicates = check_cross[check_cross > 1]

        # --- LOGIC ĐƠN LỚN (>9) ---
        df_valid['Tong SL'] = df_valid['Tong SL'].fillna(0)
        order_qty_df = df_valid.groupby(['Ma Van Don', 'Tên Shop']).agg(
            extracted_qty=('SL', 'sum'),
            reported_qty=('Tong SL', 'max')
        ).reset_index()
        order_qty_df['So Luong'] = order_qty_df.apply(
            lambda row: row['reported_qty'] if row['reported_qty'] and row['reported_qty'] > 0 else row['extracted_qty'],
            axis=1
        )
        large_orders = order_qty_df[order_qty_df['So Luong'] > 9]

        tong_san_pham = order_qty_df['So Luong'].sum()

        # Xác định màu sắc cảnh báo
        status_dup_tag = "OK" if real_duplicates.empty else "TRÙNG"
        d_color_dup = "normal" if real_duplicates.empty else "inverse"

        status_large_tag = "OK" if large_orders.empty else "GẤP: Cần nhắn tin 3 lần xác nhận"
        d_color_large = "normal" if large_orders.empty else "inverse"

        # Hiển thị 4 cột Metric
        c1, c2, c3, c4 = st.columns(4)
        
        status_trang = "KHỚP" if total_original_pages == tong_trang_da_doc else "LỆCH"
        c1.metric("TỔNG SỐ TRANG", f"{total_original_pages} -> {tong_trang_da_doc}", delta=status_trang)
        
        c2.metric("TỔNG SỐ SẢN PHẨM", f"{tong_san_pham} PCS")
        
        c3.metric("ĐƠN SỐ LƯỢNG LỚN (>9)", f"{len(large_orders)} ĐƠN", delta=status_large_tag, delta_color=d_color_large)
        
        c4.metric("ĐƠN TRÙNG LẶP (Cross-File)", f"{len(real_duplicates)} ĐƠN", delta=status_dup_tag, delta_color=d_color_dup)

        if total_original_pages != tong_trang_da_doc:
            st.error(f"Lệch {total_original_pages - tong_trang_da_doc} trang! Có thể do trang trắng hoặc lỗi đọc PDF.")
        
        # BANNER CẢNH BÁO ĐƠN LỚN
        if not large_orders.empty:
            st.markdown(
                "<div style='padding:16px; background:#d32f2f; color:#ffffff; border-radius:12px; "
                "font-size:1.05rem; font-weight:700; margin-bottom:12px;'>"
                "🚨 CẢNH BÁO ĐƠN LỚN: Có "
                f"{len(large_orders)} đơn nhiều sản phẩm. Cần nhắn tin xác nhận với khách hàng (nhắn 3 lần không rep, yêu cầu Support Shopee Hủy)." 
                "</div>",
                unsafe_allow_html=True
            )
            with st.expander("🚨 CHI TIẾT CÁC ĐƠN HÀNG SỐ LƯỢNG LỚN", expanded=True):
                df_large_display = large_orders[['Tên Shop', 'Ma Van Don', 'So Luong']]
                st.markdown("**👉 Bấm vào nút Copy ở góc trên bên phải khung xám**")
                tsv_data = df_large_display.to_csv(index=False, sep='\t')
                st.code(tsv_data, language="text")

        # BẢNG ĐƠN TRÙNG (Giữ nguyên)
        if not real_duplicates.empty:
            with st.expander("📝 CHI TIẾT CÁC ĐƠN TRÙNG LẶP !! CẦN KIỂM TRA !!", expanded=True):
                df_dup_show = df_valid[df_valid['Ma Van Don'].isin(real_duplicates.index)]
                st.dataframe(df_dup_show.sort_values("Ma Van Don"), use_container_width=True)
    
    st.divider()

    # --- BUOC 5: HIEN THI THONG KE ---
    with st.expander("📋 Mở Chi Tiết Đơn Hàng", expanded=False):
        st.dataframe(df_total, use_container_width=True)
        
    st.divider()

    col_in, col_sku, col_trong = st.columns([1.2, 1.5, 2.5])

    with col_in:
        st.markdown("### Thống kê Hình In")
        if not df_total.empty and "Hinh In" in df_total.columns:
            df_in = df_total.groupby(["Hinh In"])["SL"].sum().reset_index()
            df_in = df_in.sort_values(by="SL", ascending=False)
            df_in = df_in[["SL", "Hinh In"]]
            
            with st.expander("Mở toàn bộ bảng Hình In", expanded=True):
                st.dataframe(
                    df_in, 
                    use_container_width=True, 
                    hide_index=True,
                    height=1500,
                    column_config={
                        "SL": st.column_config.NumberColumn("SL", width="small"),
                        "Hinh In": st.column_config.TextColumn("Hình In") 
                    }
                )

    with col_sku:
        st.markdown("### Thống kê SKU")
        if not df_total.empty and "Phan Loai Chuan" in df_total.columns:
            df_sku = df_total.groupby("Phan Loai Chuan")["SL"].sum().reset_index()
            df_sku = df_sku.sort_values(by="SL", ascending=False)
            df_sku = df_sku[["SL", "Phan Loai Chuan"]]
            
            with st.expander("Mở toàn bộ bảng SKU", expanded=True):
                st.dataframe(
                    df_sku, 
                    use_container_width=True, 
                    hide_index=True,
                    height=1500,
                    column_config={
                        "SL": st.column_config.NumberColumn("SL", width="small"),
                        "Phan Loai Chuan": st.column_config.TextColumn("Phân Loại SKU")
                    }
                )

    # --- BUOC 6: NUT XU LY VA XUAT FILE ZIP ---
    if st.button("XỬ LÝ", type="primary", use_container_width=True):
        if not all_pages_flat_list:
            st.error("kHÔNG CÓ DỮ LIỆU ĐỂ XỬ LÝ")
        else:
            with st.spinner("Đang phân loại, vẽ vòng tròn và gộp file PDF...."):
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w") as zf:
                    output_pdfs = process_and_group_pdf(all_pages_flat_list)
                    for fname, content in output_pdfs.items():
                        zf.writestr(fname, content)
            
            st.success("ĐÃ XỬ LÝ DONG, TẢI FILE BÊN DƯỚI")
            
            current_time_str = datetime.now().strftime("%d%m_%Hh%M")
            dynamic_filename = f"SHOPEE_SX_{current_time_str}.zip"

            tong_don = len(df_total['Ma Van Don'].unique()) if not df_total.empty else 0
            log_hidden(f"✅ XỬ LÝ XONG: Xuất file {dynamic_filename} | Tổng đơn: {tong_don}")
            
            st.download_button(
                label="TẢI XUỐNG KẾT QUẢ",
                data=zip_buffer.getvalue(),
                file_name=dynamic_filename,
                mime="application/zip",
                use_container_width=True
            )
