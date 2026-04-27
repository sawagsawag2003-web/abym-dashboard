from __future__ import annotations

import hashlib
import io
import zipfile
from datetime import datetime
from typing import Callable

import fitz
import pandas as pd
import streamlit as st

from backend.database import save_to_sqlite, save_uploaded_pdf, to_project_relative


ShopeeAnalyzer = Callable[[str], dict]
ShopeeNormalizer = Callable[[str], dict]
ShopeeGrouper = Callable[[list[dict], dict[str, bytes]], dict[str, bytes]]


@st.cache_data(show_spinner=False)
def extract_shopee_pdf(file_name: str, file_bytes: bytes, _analyzer: ShopeeAnalyzer, _normalizer: ShopeeNormalizer) -> dict:
    """Phân tích một file PDF Shopee và trả về dữ liệu tuần tự hóa để cache."""
    preview_rows: list[dict] = []
    order_rows: list[dict] = []
    item_rows: list[dict] = []
    page_entries: list[dict] = []

    with fitz.open(stream=file_bytes, filetype="pdf") as document:
        total_pages = len(document)
        for page_index in range(total_pages):
            page = document.load_page(page_index)
            extract_data = _analyzer(page.get_text())

            page_entries.append(
                {
                    "page_index": page_index,
                    "origin_file": file_name,
                    "data": extract_data,
                }
            )

            tracking_code = extract_data.get("tracking_code")
            if tracking_code and tracking_code != "Khong thay":
                order_rows.append(
                    {
                        "order_code": tracking_code,
                        "platform": "Shopee",
                        "carrier": extract_data.get("carrier"),
                        "shop_name": extract_data.get("shop_name"),
                        "ship_date": None,
                        "file_source": file_name,
                        "created_at": datetime.now().isoformat(timespec="seconds"),
                    }
                )

            for product in extract_data.get("products", []):
                normalized_product = _normalizer(product["variant_raw"])
                preview_rows.append(
                    {
                        "Trang": page_index + 1,
                        "File Gốc": file_name,
                        "Tên Shop": extract_data.get("shop_name", "Không xác định"),
                        "Mã Vận Đơn": tracking_code or "Khong thay",
                        "DVVC": extract_data.get("carrier", "Khác"),
                        "Sản Phẩm": product["variant_raw"],
                        "SL": product["quantity"],
                        "Tổng SL": extract_data.get("total_quantity"),
                        "Folder": normalized_product["folder"],
                        "Hình In": normalized_product["hinh_in"],
                        "Size": normalized_product["size"],
                        "Mã SP": normalized_product["ma_sp"],
                        "Phân Loại Chuẩn": normalized_product["sort_name"],
                    }
                )
                if tracking_code and tracking_code != "Khong thay":
                    item_rows.append(
                        {
                            "order_code": tracking_code,
                            "category": normalized_product["folder"],
                            "original_name": product.get("full_name_debug") or product["variant_raw"],
                            "normalized_sku": normalized_product["sort_name"],
                            "quantity": product["quantity"],
                        }
                    )

    return {
        "page_entries": page_entries,
        "preview_rows": preview_rows,
        "order_rows": order_rows,
        "item_rows": item_rows,
        "page_count": total_pages,
    }


class ShopeeWorkflow:
    """Điều phối toàn bộ luồng ingest, đối soát và xuất file Shopee."""

    def __init__(self, analyzer: ShopeeAnalyzer, normalizer: ShopeeNormalizer, grouper: ShopeeGrouper) -> None:
        self.analyzer = analyzer
        self.normalizer = normalizer
        self.grouper = grouper

    @staticmethod
    def build_upload_hashes(uploaded_files: list) -> list[str]:
        return [hashlib.md5(uploaded_file.getvalue()).hexdigest() for uploaded_file in uploaded_files]

    @staticmethod
    def deduplicate_files(uploaded_files: list) -> tuple[list, list[str]]:
        valid_files = []
        duplicate_names = []
        seen_files = set()

        for uploaded_file in uploaded_files:
            file_identifier = (uploaded_file.name, uploaded_file.size)
            if file_identifier in seen_files:
                duplicate_names.append(uploaded_file.name)
                continue
            seen_files.add(file_identifier)
            valid_files.append(uploaded_file)

        return valid_files, duplicate_names

    def process_uploads(self, uploaded_files: list, should_persist_upload: bool) -> dict:
        all_pages_flat_list: list[dict] = []
        preview_rows: list[dict] = []
        orders_data: list[dict] = []
        items_data: list[dict] = []
        source_documents: dict[str, bytes] = {}
        saved_file_paths: dict[str, str] = {}
        total_original_pages = 0
        processing_errors: list[str] = []

        for uploaded_file in uploaded_files:
            try:
                file_bytes = uploaded_file.getvalue()
                source_documents[uploaded_file.name] = file_bytes
                if should_persist_upload:
                    saved_path = save_uploaded_pdf("Shopee", uploaded_file.name, file_bytes)
                    saved_file_paths[uploaded_file.name] = to_project_relative(saved_path)

                parsed_result = extract_shopee_pdf(uploaded_file.name, file_bytes, self.analyzer, self.normalizer)
                total_original_pages += parsed_result["page_count"]

                all_pages_flat_list.extend(parsed_result["page_entries"])
                preview_rows.extend(parsed_result["preview_rows"])
                orders_data.extend(parsed_result["order_rows"])
                items_data.extend(parsed_result["item_rows"])
            except Exception as exc:
                processing_errors.append(f"{uploaded_file.name}: {exc}")

        for order_row in orders_data:
            origin_file = order_row.get("file_source")
            order_row["file_source"] = saved_file_paths.get(origin_file, origin_file)

        if should_persist_upload and (orders_data or items_data):
            save_to_sqlite(orders_data, items_data)

        df_orders = pd.DataFrame(preview_rows)
        return {
            "all_pages_flat_list": all_pages_flat_list,
            "df_orders": df_orders,
            "total_original_pages": total_original_pages,
            "source_documents": source_documents,
            "errors": processing_errors,
        }

    @staticmethod
    def _carrier_sort_key(file_name: str) -> tuple[str, str]:
        carrier = file_name.rsplit(".", 1)[0].split("_", 1)[0]
        return carrier.casefold(), file_name.casefold()

    def build_output_pdfs(self, all_pages_flat_list: list[dict], source_documents: dict[str, bytes]) -> dict[str, bytes]:
        return self.grouper(all_pages_flat_list, source_documents)

    def build_zip_from_outputs(self, output_pdfs: dict[str, bytes]) -> bytes:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w") as archive:
            for file_name, file_content in sorted(output_pdfs.items(), key=lambda item: self._carrier_sort_key(item[0])):
                archive.writestr(file_name, file_content)
        return zip_buffer.getvalue()

    def build_merged_pdf_from_outputs(self, output_pdfs: dict[str, bytes]) -> bytes:
        merged_document = fitz.open()
        try:
            for file_name, file_content in sorted(output_pdfs.items(), key=lambda item: self._carrier_sort_key(item[0])):
                with fitz.open(stream=file_content, filetype="pdf") as source_document:
                    merged_document.insert_pdf(source_document)
            return merged_document.tobytes()
        finally:
            merged_document.close()

    def build_zip(self, all_pages_flat_list: list[dict], source_documents: dict[str, bytes]) -> bytes:
        return self.build_zip_from_outputs(self.build_output_pdfs(all_pages_flat_list, source_documents))

    def build_merged_pdf(self, all_pages_flat_list: list[dict], source_documents: dict[str, bytes]) -> bytes:
        return self.build_merged_pdf_from_outputs(self.build_output_pdfs(all_pages_flat_list, source_documents))
