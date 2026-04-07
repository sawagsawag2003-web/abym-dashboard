import streamlit as st
import fitz
import pandas as pd
import zipfile
import io
import hashlib
import sys
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from database import init_db, save_to_sqlite, save_uploaded_pdf, to_project_relative

# Import trực tiếp
from extraction import analyze_page_content
from normalization import normalize_variant
from processing import process_and_group_pdf
from logger_system import log_hidden


def build_item_levels(category: str, color: str, size: str) -> tuple[str, str]:
    """Keep category as level 1, color as level 2, size as level 3."""
    _ = category
    level_2 = color
    level_3 = size
    return level_2, level_3


def extract_color_from_norm(norm: dict) -> str:
    """Use the last token in hinh_in as the color fallback."""
    hinh_in = str(norm.get("hinh_in") or "").strip()
    if "-" in hinh_in:
        return hinh_in.split("-")[-1].strip() or "Khac"
    return hinh_in or "Khac"


def normalize_text_key(value: str | None) -> str:
    """Normalize status strings so OCR/encoding variants compare reliably."""
    if not value:
        return ""
    ascii_text = unicodedata.normalize("NFKD", str(value))
    ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    return "".join(ch for ch in ascii_text if ch.isalnum())


def is_unknown_shop(value: str | None) -> bool:
    return normalize_text_key(value) in {"", "unknown", "khongxacdinh"}


def is_unknown_carrier(value: str | None) -> bool:
    return normalize_text_key(value) in {"", "unknown", "khac"}

st.set_page_config(page_title="TIKTOK - Bộ Xử Lý Nhãn In", layout="wide")
init_db()
# Thay thế st.title bằng Markdown để tùy chỉnh CSS
st.markdown(
    """
    <div style="
        background-color: #000000; 
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
                background-color: #000000;
                border-radius: 8px;
                padding: 8px 20px;
                margin-right: 20px;
                overflow: hidden;
            ">
                <span style='
                    font-weight: 900;
                    font-size: 1.8em;
                    letter-spacing: 2px;
                    position: relative;
                    z-index: 2;
                    color: #ffffff;
                    text-shadow: 
                        2px 2px 0px #FF0050, /* Red shadow */
                        -2px -2px 0px #00F2EA; /* Cyan shadow */
                '>TIKTOK</span>
            </div>
            <h1 style='
                margin: 0; 
                font-weight: 800; 
                font-size: 1.8em; 
                text-transform: uppercase;
                letter-spacing: 1px;
                color: #ffffff;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
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
                ">QUY TRÌNH VẬN HÀNH:</p>
                <p style="margin: 0; font-size: 0.95em; opacity: 0.9; line-height: 1.5;">1. Tải PDF lên -> 2. Kiểm tra <b>Bảng Chỉ Số</b> -> 3. Tải file ZIP đã chia theo SKU - DVVC.</p>
            </div>
            <div>
                <p style="
                    margin: 0 0 10px 0; 
                    font-weight: bold; 
                    font-size: 1.1em;
                    text-transform: uppercase;
                    color: #ffffff;
                ">KÝ HIỆU TRÊN GIẤY IN:</p>
                <p style="margin: 0; font-size: 0.95em; opacity: 0.9; line-height: 1.5;">⭕ <b>Vòng đỏ:</b> Phân loại có SL >1 | ⬛ <b>Mộc đen:</b> Đơn nhiều món </p>
            </div>
        </div>
    </div>
    """, 
    unsafe_allow_html=True
)

# --- 1. KHỞI TẠO SESSION STATE ---
if 'processed_files' not in st.session_state:
    st.session_state.processed_files = set() 
if 'all_pages_flat_list' not in st.session_state:
    st.session_state.all_pages_flat_list = []
if 'df_total' not in st.session_state:
    st.session_state.df_total = pd.DataFrame()
if 'error_logs' not in st.session_state:
    st.session_state.error_logs = [] # Danh sách lỗi
if 'total_original_pages' not in st.session_state:
    st.session_state.total_original_pages = 0 # Tổng số trang PDF gốc

# --- 2. HÀM HỖ TRỢ ---
def get_file_hash(file_bytes):
    return hashlib.md5(file_bytes).hexdigest()

def clear_data():
    st.session_state.processed_files = set()
    st.session_state.all_pages_flat_list = []
    st.session_state.df_total = pd.DataFrame()
    st.session_state.error_logs = []
    st.session_state.total_original_pages = 0
    st.toast("Đã xóa sạch dữ liệu cũ!", icon="🗑️")

if st.sidebar.button("🗑️ Xóa dữ liệu & Làm lại từ đầu", type="primary", use_container_width=True):
    clear_data()
    st.rerun()

# --- 3. INPUT FILE ---
uploaded_files = st.file_uploader("Tải lên file PDF TikTok", type="pdf", accept_multiple_files=True)

if 'last_upload_hash' not in st.session_state:
    st.session_state.last_upload_hash = []

# 1. Tính toán danh sách ID của các file đang có trên màn hình
current_file_hashes = []
if uploaded_files:
    for f in uploaded_files:
        file_bytes = f.read()
        current_file_hashes.append(hashlib.md5(file_bytes).hexdigest())
        f.seek(0) 

# 2. So sánh với lần trước. Nếu khác -> Xóa dữ liệu cũ
if current_file_hashes != st.session_state.last_upload_hash:
    clear_data()
    st.session_state.last_upload_hash = current_file_hashes

# Tự động xóa khi gỡ file
if not uploaded_files and len(st.session_state.all_pages_flat_list) > 0:
    clear_data()
    st.rerun()

# --- 4. XỬ LÝ DỮ LIỆU ---
if uploaded_files:
    names = ", ".join([f.name for f in uploaded_files])
    log_hidden(f"📥 TẢI LÊN: {len(uploaded_files)} file ({names})")
    new_files_detected = False
    
    current_upload_pages = 0
    for f in uploaded_files:
        try:
            temp_doc = fitz.open(stream=f.read(), filetype="pdf")
            current_upload_pages += len(temp_doc)
            f.seek(0) 
        except:
            pass
    st.session_state.total_original_pages = current_upload_pages

    order_context_map = {}
    
    progress_text = "Đang phân tích file..."
    my_bar = st.progress(0, text=progress_text)
    
    temp_pages_list = []
    saved_file_paths = {}
    
    for idx, uploaded_file in enumerate(uploaded_files):
        file_bytes = uploaded_file.read()
        file_hash = get_file_hash(file_bytes)
        uploaded_file.seek(0)
        
        if file_hash in st.session_state.processed_files:
            continue 
            
        new_files_detected = True
        st.session_state.processed_files.add(file_hash)
        saved_path = save_uploaded_pdf("TikTok", uploaded_file.name, file_bytes)
        saved_file_paths[uploaded_file.name] = to_project_relative(saved_path)
        
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        for i, page in enumerate(doc):
            text = page.get_text()
            extract_data = analyze_page_content(text)
            
            if extract_data['status'] != "OK" and extract_data['page_type'] == "Main":
                st.session_state.error_logs.append({
                    "File": uploaded_file.name,
                    "Trang": i + 1,
                    "Lý do": "Không tìm thấy sản phẩm",
                    "Nội dung thô (50 ký tự)": text[:50].replace("\n", " ")
                })

            oid = extract_data.get('order_id', 'Unknown')
            tcode = extract_data.get('tracking_code', 'Unknown')
            if oid != "Unknown":
                existing_context = order_context_map.get(oid, {})
                resolved_tracking = existing_context.get("tracking_code")
                resolved_carrier = existing_context.get("carrier")
                resolved_shop_name = existing_context.get("shop_name")

                if tcode != "Unknown":
                    resolved_tracking = tcode
                if extract_data.get("carrier") and not is_unknown_carrier(extract_data.get("carrier")):
                    resolved_carrier = extract_data.get("carrier")
                if extract_data.get("shop_name") and not is_unknown_shop(extract_data.get("shop_name")):
                    resolved_shop_name = extract_data.get("shop_name")

                order_context_map[oid] = {
                    "tracking_code": resolved_tracking or "Unknown",
                    "carrier": resolved_carrier or "Khac",
                    "shop_name": resolved_shop_name or "Không xác định",
                }
                
            temp_pages_list.append({
                "doc": doc,
                "page_index": i,
                "data": extract_data,
                "origin_file": uploaded_file.name
            })
        
        my_bar.progress((idx + 1) / len(uploaded_files), text=f"Đang xử lý {uploaded_file.name}...")

    my_bar.empty()

    if new_files_detected:
        preview_rows = []
        orders_data = []
        items_data = []
        for entry in temp_pages_list:
            data = entry['data']
            oid = data.get('order_id', 'Unknown')
            current_tracking = data.get('tracking_code', 'Unknown')
            
            is_synced = False
            order_context = order_context_map.get(oid, {})
            if current_tracking == "Unknown" and order_context.get("tracking_code"):
                current_tracking = order_context["tracking_code"]
                data['tracking_code'] = current_tracking
                is_synced = True

            if is_unknown_carrier(data.get("carrier")) and order_context.get("carrier") and not is_unknown_carrier(order_context["carrier"]):
                data["carrier"] = order_context["carrier"]
                is_synced = True

            if is_unknown_shop(data.get("shop_name")) and order_context.get("shop_name") and not is_unknown_shop(order_context["shop_name"]):
                data["shop_name"] = order_context["shop_name"]
                is_synced = True

            if current_tracking != "Unknown":
                orders_data.append({
                    "order_code": current_tracking,
                    "platform": "TikTok",
                    "carrier": data.get("carrier"),
                    "shop_name": data.get("shop_name"),
                    "ship_date": None,
                    "file_source": saved_file_paths.get(entry["origin_file"], entry["origin_file"]),
                    "created_at": datetime.now().isoformat(timespec="seconds"),
                })
            
            if data['products']:
                for p in data['products']:
                    norm = normalize_variant(p['variant_raw'])
                    color = extract_color_from_norm(norm)
                    level_2, level_3 = build_item_levels(norm["folder"], color, norm["size"])
                    
                    preview_rows.append({
                        "File Gốc": entry['origin_file'],
                        "Trang": entry['page_index'] + 1,
                        "Loại": "Phụ (Ghép)" if is_synced else "Gốc",
                        "Order ID": oid,
                        "Mã Vận Đơn": current_tracking,
                        "Tên Sản Phẩm": p.get('product_name', ''),
                        "Phân Loại Gốc": p['variant_raw'],
                        "SL": p['quantity'],
                        "Folder": norm['folder'],
                        "Hình In": norm['hinh_in'], 
                        "Size": norm['size'],
                        "Mã SP": norm['ma_sp'],
                        "Tên Sort": norm['sort_name']
                    })
                    if current_tracking != "Unknown":
                        items_data.append({
                            "order_code": current_tracking,
                            "category": norm["folder"],
                            "level_2": level_2,
                            "level_3": level_3,
                            "original_name": p.get("product_name") or p["variant_raw"],
                            "normalized_sku": norm["sort_name"],
                            "quantity": p["quantity"],
                        })
            else:
                preview_rows.append({
                    "File Gốc": entry['origin_file'],
                    "Trang": entry['page_index'] + 1,
                    "Loại": "Lỗi/Trống",
                    "Mã Vận Đơn": current_tracking,
                    "Tên Sản Phẩm": "KHÔNG TÌM THẤY SP",
                    "Phân Loại Gốc": "-",
                    "SL": 0,
                    "Folder": "Lỗi",
                    "Hình In": "-", "Size": "-", "Mã SP": "-", "Tên Sort": "-"
                })

            st.session_state.all_pages_flat_list.append(entry)

        if preview_rows:
            new_df = pd.DataFrame(preview_rows)
            st.session_state.df_total = pd.concat([st.session_state.df_total, new_df], ignore_index=True)

        if orders_data or items_data:
            save_to_sqlite(orders_data, items_data)

    # --- 5. HIỂN THỊ KẾT QUẢ ---
    if not st.session_state.df_total.empty:
        df_display = st.session_state.df_total
        
        # --- A. TÍNH TOÁN CHỈ SỐ ---
        total_output_pages = len(st.session_state.all_pages_flat_list)
        total_input_pages = st.session_state.total_original_pages
        total_products = df_display[df_display['SL'] > 0]['SL'].sum()
        
        tracking_counts = Counter(df_display['Mã Vận Đơn'])
        spam_orders = [k for k, v in tracking_counts.items() if v > 10]
        spam_count = len(spam_orders)
        
        # --- B. HIỂN THỊ METRIC ---
        c1, c2, c3, c4 = st.columns(4)
        
        if total_input_pages == total_output_pages:
            c1.markdown(f"**TỔNG SỐ TRANG (GỐC → KQ)**<br><span style='color:green; font-size:24px'>{total_input_pages} → {total_output_pages} (Khớp)</span>", unsafe_allow_html=True)
        else:
            diff = total_input_pages - total_output_pages
            c1.markdown(f"**TỔNG SỐ TRANG (GỐC → KQ)**<br><span style='color:red; font-size:24px'>{total_input_pages} → {total_output_pages} (Lệch {diff})</span>", unsafe_allow_html=True)

        c2.metric("TỔNG SẢN PHẨM", total_products)
        
        error_count = len(st.session_state.error_logs)
        c3.metric("SỐ TRANG LỖI", error_count, delta_color="inverse")
        
        if spam_count > 0:
            c4.markdown(f"**ĐƠN TRÙNG (>10)**<br><span style='color:red; font-size:24px'>{spam_count} Đơn</span>", unsafe_allow_html=True)
        else:
            c4.metric("ĐƠN TRÙNG (>10)", "0")

        st.divider()

        # --- C. BẢNG CHI TIẾT ---
        if error_count > 0:
            st.error(f"⚠️ Phát hiện {error_count} trang bị lỗi! Vui lòng kiểm tra:")
            df_error = pd.DataFrame(st.session_state.error_logs)
            st.dataframe(df_error, use_container_width=True)
            st.divider()

        # 2. Bảng Đơn Hàng Chính (CHỐT ĐÓNG GÓI VÀO EXPANDER, MẶC ĐỊNH ẨN)
        with st.expander("📋 Mở Chi Tiết Đơn Hàng", expanded=False):
            def highlight_row(row):
                if row['Mã Vận Đơn'] in spam_orders: 
                    return ['background-color: #ffcccc'] * len(row)
                if row['Loại'] == 'Phụ (Ghép)':
                    return ['background-color: #e6fffa'] * len(row)
                if row['SL'] == 0:
                    return ['background-color: #f0f0f0'] * len(row)
                return [''] * len(row)

            st.data_editor(
                df_display.style.apply(highlight_row, axis=1),
                column_config={
                    "Order ID": st.column_config.TextColumn("Order ID", width="medium"),
                    "Mã Vận Đơn": st.column_config.TextColumn("Mã Vận Đơn", width="medium"),
                    "Tên Sản Phẩm": st.column_config.TextColumn("Tên SP", width="large"),
                    "Hình In": st.column_config.TextColumn("Hình In (Mới)", width="medium"), 
                },
                hide_index=True,
                use_container_width=True,
                height=400
            )
        
        st.divider()

        # --- D. CÁC BẢNG THỐNG KÊ SONG SONG (ĐÃ FIX KHUẤT CHỮ) ---
        # Tăng tỷ lệ cho 2 cột đầu, giảm cột trống xuống để lấy không gian dãn chữ
        col_in, col_sku, col_trong = st.columns([2, 2, 3]) 

        with col_in:
            st.markdown("### Thống kê Hình In")
            if "Hình In" in df_display.columns:
                df_in = df_display.groupby(["Hình In"])["SL"].sum().reset_index()
                df_in = df_in.sort_values(by="SL", ascending=False)
                df_in = df_in[["SL", "Hình In"]]
                
                with st.expander("Thống kê Hình In", expanded=True):
                    st.dataframe(
                        df_in, 
                        use_container_width=True, 
                        hide_index=True,
                        height=1000,
                        column_config={
                            "SL": st.column_config.NumberColumn("Số Lượng", width="small"),
                            # Để width=None hoặc "large" để Streamlit tự ưu tiên dãn hết chữ
                            "Hình In": st.column_config.TextColumn("Hình In", width="large") 
                        }
                    )

        with col_sku:
            st.markdown("### Thống kê SKU")
            if "Tên Sort" in df_display.columns:
                df_sku = df_display.groupby("Tên Sort")["SL"].sum().reset_index()
                df_sku = df_sku.sort_values(by="SL", ascending=False)
                df_sku = df_sku[["SL", "Tên Sort"]]
                
                with st.expander("Thống kê SKU", expanded=True):
                    st.dataframe(
                        df_sku, 
                        use_container_width=True, 
                        hide_index=True,
                        height=1000,
                        column_config={
                            "SL": st.column_config.NumberColumn("SL", width="small"),
                            # "large" sẽ giúp các tên SKU dài không bị hiện dấu "..."
                            "Tên Sort": st.column_config.TextColumn("Tên Phân Loại", width="large")
                        }
                    )

                # --- E. XỬ LÝ FILE ---
                st.divider()
                if st.button("🚀 XỬ LÝ & TẢI FILE (GỘP NHÓM)", type="primary", use_container_width=True):
                    with st.spinner("Đang gộp file, sắp xếp đơn và vẽ vòng tròn..."):
                        zip_buffer = io.BytesIO()
                        with zipfile.ZipFile(zip_buffer, "w") as zf:
                            output_pdfs = process_and_group_pdf(st.session_state.all_pages_flat_list)
                            for fname, content in output_pdfs.items():
                                zf.writestr(fname, content)
                    
                    st.success("Đã xử lý xong!")
                    current_time_str = datetime.now().strftime("%d%m_%Hh%M")
                    dynamic_filename = f"Tiktok_SX_{current_time_str}.zip"

                    tong_don = len(st.session_state.df_total['Mã Vận Đơn'].unique()) if not st.session_state.df_total.empty else 0
                    log_hidden(f"✅ XỬ LÝ XONG: Xuất file {dynamic_filename} | Tổng đơn: {tong_don}")

                    st.download_button(
                        label="TẢI XUỐNG KẾT QUẢ (ZIP)", 
                        data=zip_buffer.getvalue(),
                        file_name=dynamic_filename, 
                        mime="application/zip",
                        use_container_width=True
                    )
            else:
                st.info("Vui lòng tải lên file PDF đơn hàng TikTok để bắt đầu.")
