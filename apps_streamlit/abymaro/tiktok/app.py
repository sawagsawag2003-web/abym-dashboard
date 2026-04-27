from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[3]
STREAMLIT_APPS_ROOT = Path(__file__).resolve().parents[2]
for import_root in (PROJECT_ROOT, STREAMLIT_APPS_ROOT):
    if str(import_root) not in sys.path:
        sys.path.append(str(import_root))

from abymaro.core.config import TIKTOK_CONFIG
from abymaro.core.reporting import TikTokReportBuilder
from abymaro.core.session_state import SessionStateManager
from abymaro.core.tiktok_workflow import TikTokWorkflow
from backend.database import init_db
from extraction import analyze_page_content
from normalization import normalize_variant
from processing import process_and_group_pdf
from logger_system import log_hidden


def format_number(value: object) -> str:
    """Định dạng số theo kiểu dấu chấm phân tách hàng nghìn."""
    try:
        return f"{int(value):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def build_badge(label: str, tone: str = "slate") -> str:
    tones = {
        "green": "background:#dcfce7;color:#166534;",
        "amber": "background:#fef3c7;color:#92400e;",
        "red": "background:#fee2e2;color:#b91c1c;",
        "blue": "background:#dbeafe;color:#1d4ed8;",
        "slate": "background:#e2e8f0;color:#334155;",
    }
    return (
        f"<span style='display:inline-flex;align-items:center;border-radius:999px;"
        f"padding:6px 12px;font-size:12px;font-weight:700;{tones.get(tone, tones['slate'])}'>"
        f"{label}</span>"
    )


@st.cache_resource(show_spinner=False)
def bootstrap_runtime() -> tuple[TikTokWorkflow, SessionStateManager]:
    """Khởi tạo workflow và session manager dùng chung cho TikTok."""
    init_db()
    return (
        TikTokWorkflow(
            analyzer=analyze_page_content,
            normalizer=normalize_variant,
            grouper=process_and_group_pdf,
        ),
        SessionStateManager(TIKTOK_CONFIG.session_defaults),
    )


def clear_data(session_manager: SessionStateManager) -> None:
    """Xóa session_state để người dùng xử lý lại từ đầu."""
    session_manager.reset()
    st.toast("Đã xóa sạch dữ liệu cũ!", icon="🗑️")


def highlight_row(row: pd.Series, spam_orders: list[str]) -> list[str]:
    if row.get("Mã Vận Đơn") in spam_orders:
        return ["background-color: #ffcccc"] * len(row)
    if row.get("Loại") == "Phụ (Ghép)":
        return ["background-color: #e6fffa"] * len(row)
    if row.get("SL") == 0:
        return ["background-color: #f0f0f0"] * len(row)
    return [""] * len(row)


st.set_page_config(page_title="TIKTOK - Bộ Xử Lý Nhãn In", layout="wide", initial_sidebar_state="collapsed")
tiktok_workflow, session_manager = bootstrap_runtime()
session_manager.ensure()

st.markdown(
    """
    <style>
      .stApp {
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, 0.08), transparent 30%),
          radial-gradient(circle at top right, rgba(16, 185, 129, 0.08), transparent 28%),
          #f8fafc;
      }
      [data-testid="stHeader"] {
        background: rgba(255, 255, 255, 0.7);
      }
      [data-testid="stSidebar"] {
        background: #ffffff;
      }
      div[data-testid="stFileUploader"] section {
        border-radius: 24px;
        border: 1px solid #cbd5e1;
        background: rgba(255,255,255,0.88);
      }
      div[data-testid="stMetric"] {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        padding: 16px 18px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
      }
      div[data-testid="stExpander"] {
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        background: #ffffff;
        overflow: hidden;
      }
      .stButton > button, .stDownloadButton > button {
        border-radius: 16px;
        font-weight: 700;
      }
    </style>
    <div style="padding: 8px 0 20px 0;">
      <div style="display:flex;gap:24px;align-items:stretch;flex-wrap:wrap;">
        <div style="flex:2;min-width:320px;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:52px;height:52px;border-radius:18px;background:linear-gradient(135deg,#16a34a,#15803d);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:800;">
                T
              </div>
              <div>
                <div style="font-size:28px;font-weight:800;color:#0f172a;">TikTok Dashboard</div>
                <div style="font-size:14px;color:#64748b;">Hệ thống phân loại, kiểm soát và đóng gói nhãn in</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:10px 14px;">
              <div style="width:42px;height:42px;border-radius:14px;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-weight:800;color:#166534;">TT</div>
              <div>
                <div style="font-size:14px;font-weight:700;color:#0f172a;">HieuT</div>
                <div style="font-size:12px;color:#64748b;">TikTok Print Center</div>
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:22px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:18px;">
              <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Quy trình</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.7;color:#334155;">1. Tải PDF lên<br>2. Kiểm tra bảng chỉ số<br>3. Tải file ZIP đã chia theo SKU - DVVC</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:20px;padding:18px;">
              <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Ký hiệu in</div>
              <div style="margin-top:8px;font-size:14px;line-height:1.7;color:#334155;">Vòng đỏ: Phân loại có số lượng lớn hơn 1<br>Mực đen: Đơn nhiều món cần kiểm tra kỹ</div>
            </div>
          </div>
        </div>
        <div style="flex:1;min-width:260px;background:#0f172a;border-radius:28px;padding:28px;color:#ffffff;box-shadow:0 10px 30px rgba(15,23,42,0.14);display:flex;align-items:center;">
          <div style="font-size:40px;font-weight:800;">Luồng xử lý TikTok</div>
        </div>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar.expander("Tùy chọn dữ liệu", expanded=False):
    if st.button("🗑️ Xóa dữ liệu & Làm lại từ đầu", type="primary", use_container_width=True):
        clear_data(session_manager)
        st.rerun()

uploaded_files = st.file_uploader("Tải lên file PDF TikTok", type="pdf", accept_multiple_files=True)

current_file_hashes = [tiktok_workflow.get_file_hash(uploaded_file.getvalue()) for uploaded_file in uploaded_files] if uploaded_files else []
if current_file_hashes != st.session_state.last_upload_hash:
    clear_data(session_manager)
    st.session_state.last_upload_hash = current_file_hashes

if not uploaded_files and st.session_state.all_pages_flat_list:
    clear_data(session_manager)
    st.rerun()

if uploaded_files:
    log_hidden(f"📥 TẢI LÊN: {len(uploaded_files)} file ({', '.join(file.name for file in uploaded_files)})")
    progress_bar = st.progress(0, text="Đang phân tích file...")
    processing_result = tiktok_workflow.process_new_files(uploaded_files, st.session_state.processed_files)
    progress_bar.progress(1.0, text="Đã phân tích xong")
    progress_bar.empty()

    if processing_result["pages"]:
        st.session_state.processed_files.update(processing_result["new_hashes"])
        st.session_state.all_pages_flat_list.extend(processing_result["pages"])
        st.session_state.error_logs.extend(processing_result["error_logs"])
        st.session_state.total_original_pages += processing_result["total_original_pages"]
        st.session_state.source_documents.update(processing_result["source_documents"])
        if not processing_result["df_orders"].empty:
            st.session_state.df_total = pd.concat([st.session_state.df_total, processing_result["df_orders"]], ignore_index=True)

if not st.session_state.df_total.empty:
    metrics = TikTokReportBuilder.build_metrics(
        df_orders=st.session_state.df_total,
        total_input_pages=st.session_state.total_original_pages,
        total_output_pages=len(st.session_state.all_pages_flat_list),
        error_count=len(st.session_state.error_logs),
    )

    page_status = "Khớp" if metrics.total_input_pages == metrics.total_output_pages else "Lệch"
    duplicate_status = "OK" if not metrics.spam_orders else "Trùng"
    overview_html = f"""
    <div style="margin: 10px 0 22px 0;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <div style="font-size:13px;color:#64748b;">Tổng số trang</div>
          <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(metrics.total_input_pages)} → {format_number(metrics.total_output_pages)}</div>
          <div style="margin-top:10px;">{build_badge(page_status, "green" if page_status == "Khớp" else "amber")}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <div style="font-size:13px;color:#64748b;">Tổng số sản phẩm</div>
          <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(metrics.total_products)} PCS</div>
          <div style="margin-top:10px;">{build_badge("Đã tổng hợp", "blue")}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <div style="font-size:13px;color:#64748b;">Số trang lỗi</div>
          <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(metrics.error_count)} trang</div>
          <div style="margin-top:10px;">{build_badge("OK" if metrics.error_count == 0 else "Cần kiểm tra", "green" if metrics.error_count == 0 else "red")}</div>
        </div>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
          <div style="font-size:13px;color:#64748b;">Đơn trùng (&gt;10)</div>
          <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(len(metrics.spam_orders))} đơn</div>
          <div style="margin-top:10px;">{build_badge(duplicate_status, "green" if duplicate_status == "OK" else "red")}</div>
        </div>
      </div>
    </div>
    """
    st.markdown(overview_html, unsafe_allow_html=True)

    st.divider()

    if metrics.error_count:
        st.error(f"⚠️ Phát hiện {metrics.error_count} trang bị lỗi! Vui lòng kiểm tra:")
        st.dataframe(pd.DataFrame(st.session_state.error_logs), use_container_width=True)
        st.divider()

    with st.expander("📋 Mở Chi Tiết Đơn Hàng", expanded=False):
        st.data_editor(
            st.session_state.df_total.style.apply(lambda row: highlight_row(row, metrics.spam_orders), axis=1),
            column_config={
                "Order ID": st.column_config.TextColumn("Order ID", width="medium"),
                "Mã Vận Đơn": st.column_config.TextColumn("Mã Vận Đơn", width="medium"),
                "Tên Sản Phẩm": st.column_config.TextColumn("Tên SP", width="large"),
                "Hình In": st.column_config.TextColumn("Hình In", width="medium"),
            },
            hide_index=True,
            use_container_width=True,
            height=400,
        )

    st.divider()

    col_print, col_sku, _ = st.columns([2, 2, 3])
    with col_print:
        st.markdown("### Thống kê Hình In")
        df_print = st.session_state.df_total.groupby("Hình In", as_index=False)["SL"].sum().sort_values("SL", ascending=False)
        with st.expander("Thống kê Hình In", expanded=True):
            st.dataframe(df_print[["SL", "Hình In"]], use_container_width=True, hide_index=True, height=1000)

    with col_sku:
        st.markdown("### Thống kê SKU")
        df_sku = st.session_state.df_total.groupby("Tên Sort", as_index=False)["SL"].sum().sort_values("SL", ascending=False)
        with st.expander("Thống kê SKU", expanded=True):
            st.dataframe(df_sku[["SL", "Tên Sort"]], use_container_width=True, hide_index=True, height=1000)

        st.divider()
        if st.button("🚀 Xử Lý & Tải File (GỘP NHÓM)", type="primary", use_container_width=True):
            with st.spinner("Đang gộp file, sắp xếp đơn và vẽ vòng tròn..."):
                output_pdfs = tiktok_workflow.build_output_pdfs(
                    st.session_state.all_pages_flat_list,
                    st.session_state.source_documents,
                )
                zip_content = tiktok_workflow.build_zip_from_outputs(output_pdfs)
                merged_pdf_content = tiktok_workflow.build_merged_pdf_from_outputs(output_pdfs)

            current_time_str = datetime.now().strftime("%d%m_%Hh%M")
            zip_filename = f"Tiktok_SX_{current_time_str}.zip"
            pdf_filename = f"Tiktok_SX_{current_time_str}.pdf"
            total_orders = len(st.session_state.df_total["Mã Vận Đơn"].dropna().unique())
            log_hidden(f"✅ XỬ LÝ XONG: Xuất file {zip_filename} và {pdf_filename} | Tổng đơn: {total_orders}")
            st.success("Đã xử lý xong!")
            col_zip, col_pdf = st.columns(2)
            with col_zip:
                st.download_button(
                    label="TẢI XUỐNG KẾT QUẢ ZIP",
                    data=zip_content,
                    file_name=zip_filename,
                    mime="application/zip",
                    use_container_width=True,
                )
            with col_pdf:
                st.download_button(
                    label="TẢI XUỐNG KẾT QUẢ PDF",
                    data=merged_pdf_content,
                    file_name=pdf_filename,
                    mime="application/pdf",
                    use_container_width=True,
                )
else:
    st.info("Vui lòng tải lên file PDF đơn hàng TikTok để bắt đầu.")
