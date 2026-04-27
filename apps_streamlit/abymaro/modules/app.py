from __future__ import annotations

import html
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

from abymaro.core.reporting import ShopeeReportBuilder
from abymaro.core.shopee_workflow import ShopeeWorkflow
from backend.database import init_db
from logger_system import log_hidden

try:
    from extraction import analyze_page_content
    from normalization import normalize_variant
    from processing import process_and_group_pdf
except ImportError:
    from extraction import analyze_page_content
    from normalization import normalize_variant
    from processing import process_and_group_pdf


def format_number(value: object) -> str:
    """Định dạng số theo kiểu dấu chấm phân tách hàng nghìn."""
    try:
        return f"{int(value):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def escape_text(value: object) -> str:
    return html.escape("" if value is None else str(value))


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
        f"{escape_text(label)}</span>"
    )


def build_table_rows(df_data: pd.DataFrame, columns: list[str], empty_message: str) -> str:
    if df_data.empty:
        return (
            f"<tr><td colspan='{len(columns)}' style='padding:18px;color:#64748b;"
            f"text-align:center;'>{escape_text(empty_message)}</td></tr>"
        )

    rows: list[str] = []
    for _, row in df_data.iterrows():
        cells = [
            f"<td style='padding:14px 16px;border-top:1px solid #f1f5f9;'>{escape_text(row.get(column, ''))}</td>"
            for column in columns
        ]
        rows.append(f"<tr>{''.join(cells)}</tr>")
    return "".join(rows)


@st.cache_resource(show_spinner=False)
def bootstrap_runtime() -> ShopeeWorkflow:
    """Khởi tạo tài nguyên dùng chung một lần cho app."""
    init_db()
    return ShopeeWorkflow(
        analyzer=analyze_page_content,
        normalizer=normalize_variant,
        grouper=process_and_group_pdf,
    )


st.set_page_config(page_title="SHOPEE - Bộ Xử Lý Nhãn In", layout="wide")
shopee_workflow = bootstrap_runtime()

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
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <div style="padding: 8px 0 20px 0;">
      <div style="display:flex;gap:24px;align-items:stretch;flex-wrap:wrap;">
        <div style="flex:2;min-width:320px;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:14px;">
              <div style="width:52px;height:52px;border-radius:18px;background:linear-gradient(135deg,#16a34a,#15803d);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:800;">
                S
              </div>
              <div>
                <div style="font-size:28px;font-weight:800;color:#0f172a;">Shopee Dashboard</div>
                <div style="font-size:14px;color:#64748b;">Hệ thống phân loại, kiểm soát và đóng gói nhãn in</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:10px 14px;">
              <div style="width:42px;height:42px;border-radius:14px;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-weight:800;color:#166534;">HT</div>
              <div>
                <div style="font-size:14px;font-weight:700;color:#0f172a;">HieuT</div>
                <div style="font-size:12px;color:#64748b;">Shopee Print Center</div>
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
        <div style="flex:1;min-width:260px;background:#F5402E;border-radius:28px;padding:28px;color:#ffffff;box-shadow:0 10px 30px rgba(245,64,46,0.24);display:flex;align-items:center;">
          <div style="font-size:40px;font-weight:800;">Luồng xử lý Shopee</div>
        </div>
      </div>
    </div>
    """,
    unsafe_allow_html=True,
)

uploaded_files = st.file_uploader("Tải lên file PDF Shopee", type="pdf", accept_multiple_files=True)

if "last_saved_upload_batch" not in st.session_state:
    st.session_state.last_saved_upload_batch = []

df_total = pd.DataFrame()
all_pages_flat_list: list[dict] = []
source_documents: dict[str, bytes] = {}
total_original_pages = 0

current_file_hashes = shopee_workflow.build_upload_hashes(uploaded_files) if uploaded_files else []
if not uploaded_files:
    st.session_state.last_saved_upload_batch = []

if uploaded_files:
    should_persist_upload = current_file_hashes != st.session_state.last_saved_upload_batch
    log_hidden(f"📥 TẢI LÊN: {len(uploaded_files)} file ({', '.join(file.name for file in uploaded_files)})")

    valid_files, duplicate_names = shopee_workflow.deduplicate_files(uploaded_files)
    for duplicate_name in duplicate_names:
        st.warning(f"Đã bỏ qua file trùng: **{duplicate_name}**")

    progress_bar = st.progress(0, text="Đang xử lý dữ liệu...")
    processing_result = shopee_workflow.process_uploads(valid_files, should_persist_upload)
    progress_bar.progress(1.0)
    progress_bar.empty()

    if should_persist_upload:
        st.session_state.last_saved_upload_batch = current_file_hashes

    for error_message in processing_result["errors"]:
        st.warning(f"Không thể xử lý file: {error_message}")

    df_total = processing_result["df_orders"]
    all_pages_flat_list = processing_result["all_pages_flat_list"]
    source_documents = processing_result["source_documents"]
    total_original_pages = processing_result["total_original_pages"]

    st.subheader("Đối chiếu và kiểm soát")
    if not df_total.empty:
        metrics = ShopeeReportBuilder.build_metrics(
            df_orders=df_total,
            total_input_pages=total_original_pages,
            total_output_pages=len(all_pages_flat_list),
        )
        df_total_indexed = df_total.set_index("Trang")

        overview_html = f"""
        <div style="margin: 10px 0 22px 0;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
              <div style="font-size:13px;color:#64748b;">Tổng số trang</div>
              <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(metrics.total_input_pages)} → {format_number(metrics.total_output_pages)}</div>
              <div style="margin-top:10px;">{build_badge(metrics.page_status, "green" if metrics.page_status == "Khớp" else "amber")}</div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
              <div style="font-size:13px;color:#64748b;">Tổng số sản phẩm</div>
              <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(metrics.total_products)} PCS</div>
              <div style="margin-top:10px;">{build_badge("Đã tổng hợp", "blue")}</div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
              <div style="font-size:13px;color:#64748b;">Đơn số lượng lớn hơn 9</div>
              <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(len(metrics.large_orders))} đơn</div>
              <div style="margin-top:10px;">{build_badge("OK" if metrics.large_orders.empty else "Gấp: cần nhắn tin 3 lần xác nhận", "green" if metrics.large_orders.empty else "red")}</div>
            </div>
            <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
              <div style="font-size:13px;color:#64748b;">Đơn trùng lặp cross-file</div>
              <div style="margin-top:10px;font-size:30px;font-weight:800;color:#0f172a;">{format_number(len(metrics.duplicates))} đơn</div>
              <div style="margin-top:10px;">{build_badge("OK" if metrics.duplicates.empty else "Trùng", "green" if metrics.duplicates.empty else "red")}</div>
            </div>
          </div>
        </div>
        """
        st.markdown(overview_html, unsafe_allow_html=True)

        if metrics.total_input_pages != metrics.total_output_pages:
            st.error(f"Lệch {metrics.total_input_pages - metrics.total_output_pages} trang. Có thể do trang trắng hoặc lỗi đọc PDF.")

        if not metrics.large_orders.empty:
            preview_large_orders = metrics.large_orders.head(8)
            large_order_rows = build_table_rows(
                preview_large_orders,
                ["Tên Shop", "Mã Vận Đơn", "Số Lượng"],
                "Không có dữ liệu đơn số lượng lớn.",
            )
            st.markdown(
                f"""
                <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:24px;padding:22px;margin-bottom:18px;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
                    <div>
                      <div style="font-size:18px;font-weight:800;color:#9f1239;">Cảnh báo đơn số lượng lớn</div>
                      <div style="margin-top:6px;font-size:14px;line-height:1.7;color:#881337;">
                        Có {format_number(len(metrics.large_orders))} đơn nhiều sản phẩm. Cần nhắn tin xác nhận với khách hàng trước khi xử lý tiếp.
                      </div>
                    </div>
                    {build_badge(f"{len(metrics.large_orders)} đơn cần kiểm tra", "red")}
                  </div>
                  <div style="margin-top:18px;overflow:auto;border:1px solid #ffe4e6;border-radius:18px;background:#ffffff;">
                    <table style="width:100%;border-collapse:collapse;font-size:14px;">
                      <thead style="background:#fff7f7;color:#64748b;">
                        <tr>
                          <th style="padding:14px 16px;text-align:left;">Tên shop</th>
                          <th style="padding:14px 16px;text-align:left;">Mã vận đơn</th>
                          <th style="padding:14px 16px;text-align:left;">Số lượng</th>
                        </tr>
                      </thead>
                      <tbody>{large_order_rows}</tbody>
                    </table>
                  </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            with st.expander("Chi tiết các đơn hàng số lượng lớn", expanded=True):
                st.markdown("**Bấm nút Copy ở góc trên bên phải khung mã để sao chép nhanh**")
                st.code(metrics.large_orders.to_csv(index=False, sep="\t"), language="text")

        if not metrics.duplicates.empty:
            duplicate_preview = df_total.loc[df_total["Mã Vận Đơn"].isin(metrics.duplicates.index), ["Trang", "File Gốc", "Tên Shop", "Mã Vận Đơn"]].sort_values("Mã Vận Đơn")
            duplicate_rows = build_table_rows(
                duplicate_preview.head(8),
                ["Trang", "File Gốc", "Tên Shop", "Mã Vận Đơn"],
                "Không có dữ liệu trùng lặp.",
            )
            st.markdown(
                f"""
                <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:22px;margin-bottom:18px;box-shadow:0 10px 30px rgba(15,23,42,0.06);">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
                    <div>
                      <div style="font-size:18px;font-weight:800;color:#0f172a;">Đơn trùng lặp cross-file</div>
                      <div style="margin-top:6px;font-size:14px;color:#64748b;">Danh sách xem nhanh các mã vận đơn xuất hiện ở nhiều file nguồn.</div>
                    </div>
                    {build_badge(f"{len(metrics.duplicates)} đơn trùng", "red")}
                  </div>
                  <div style="overflow:auto;border:1px solid #e2e8f0;border-radius:18px;">
                    <table style="width:100%;border-collapse:collapse;font-size:14px;">
                      <thead style="background:#f8fafc;color:#64748b;">
                        <tr>
                          <th style="padding:14px 16px;text-align:left;">Trang</th>
                          <th style="padding:14px 16px;text-align:left;">File gốc</th>
                          <th style="padding:14px 16px;text-align:left;">Tên shop</th>
                          <th style="padding:14px 16px;text-align:left;">Mã vận đơn</th>
                        </tr>
                      </thead>
                      <tbody>{duplicate_rows}</tbody>
                    </table>
                  </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
            with st.expander("Chi tiết các đơn trùng lặp cần kiểm tra", expanded=True):
                st.dataframe(duplicate_preview, use_container_width=True)

        with st.expander("Mở chi tiết đơn hàng", expanded=False):
            st.dataframe(df_total_indexed, use_container_width=True)

        st.divider()
        col_print, col_sku, _ = st.columns([1.2, 1.5, 2.5])
        with col_print:
            st.markdown("### Thống kê hình in")
            df_print = df_total.groupby("Hình In", as_index=False)["SL"].sum().sort_values("SL", ascending=False)
            with st.expander("Mở toàn bộ bảng hình in", expanded=True):
                st.dataframe(df_print[["SL", "Hình In"]], use_container_width=True, hide_index=True, height=1500)

        with col_sku:
            st.markdown("### Thống kê SKU")
            df_sku = df_total.groupby("Phân Loại Chuẩn", as_index=False)["SL"].sum().sort_values("SL", ascending=False)
            with st.expander("Mở toàn bộ bảng SKU", expanded=True):
                st.dataframe(df_sku[["SL", "Phân Loại Chuẩn"]], use_container_width=True, hide_index=True, height=1500)

        if st.button("Xử lý", type="primary", use_container_width=True):
            if not all_pages_flat_list:
                st.error("Không có dữ liệu để xử lý.")
            else:
                with st.spinner("Đang phân loại, vẽ vòng tròn và gộp file PDF..."):
                    output_pdfs = shopee_workflow.build_output_pdfs(all_pages_flat_list, source_documents)
                    zip_content = shopee_workflow.build_zip_from_outputs(output_pdfs)
                    merged_pdf_content = shopee_workflow.build_merged_pdf_from_outputs(output_pdfs)

                current_time_str = datetime.now().strftime("%d%m_%Hh%M")
                zip_filename = f"SHOPEE_SX_{current_time_str}.zip"
                pdf_filename = f"SHOPEE_SX_{current_time_str}.pdf"
                total_orders = len(df_total["Mã Vận Đơn"].dropna().unique())
                log_hidden(f"✅ XỬ LÝ XONG: Xuất file {zip_filename} và {pdf_filename} | Tổng đơn: {total_orders}")
                st.success("Đã xử lý xong. Tải file ở bên dưới.")
                col_zip, col_pdf = st.columns(2)
                with col_zip:
                    st.download_button(
                        label="Tải xuống kết quả ZIP",
                        data=zip_content,
                        file_name=zip_filename,
                        mime="application/zip",
                        use_container_width=True,
                    )
                with col_pdf:
                    st.download_button(
                        label="Tải xuống kết quả PDF",
                        data=merged_pdf_content,
                        file_name=pdf_filename,
                        mime="application/pdf",
                        use_container_width=True,
                    )
