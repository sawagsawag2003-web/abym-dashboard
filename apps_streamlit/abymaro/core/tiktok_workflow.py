from __future__ import annotations

import hashlib
import io
import unicodedata
import zipfile
from datetime import datetime
from typing import Callable

import fitz
import pandas as pd
import streamlit as st

from backend.database import save_to_sqlite, save_uploaded_pdf, to_project_relative


TikTokAnalyzer = Callable[[str], dict]
TikTokNormalizer = Callable[[str], dict]
TikTokGrouper = Callable[[list[dict], dict[str, bytes]], dict[str, bytes]]


@st.cache_data(show_spinner=False)
def extract_tiktok_pdf(file_name: str, file_bytes: bytes, _analyzer: TikTokAnalyzer) -> dict:
    """Phân tích một file TikTok thành dữ liệu tuần tự hóa để cache."""
    page_entries: list[dict] = []
    error_logs: list[dict] = []
    order_context_map: dict[str, dict] = {}

    with fitz.open(stream=file_bytes, filetype="pdf") as document:
        total_pages = len(document)
        for page_index in range(total_pages):
            page = document.load_page(page_index)
            text = page.get_text()
            extract_data = _analyzer(text)

            if extract_data.get("status") != "OK" and extract_data.get("page_type") == "Main":
                error_logs.append(
                    {
                        "File": file_name,
                        "Trang": page_index + 1,
                        "Lý do": "Không tìm thấy sản phẩm",
                        "Nội dung thô (50 ký tự)": text[:50].replace("\n", " "),
                    }
                )

            order_id = extract_data.get("order_id", "Unknown")
            tracking_code = extract_data.get("tracking_code", "Unknown")
            if order_id != "Unknown":
                existing_context = order_context_map.get(order_id, {})
                order_context_map[order_id] = {
                    "tracking_code": tracking_code if tracking_code != "Unknown" else existing_context.get("tracking_code", "Unknown"),
                    "carrier": extract_data.get("carrier") if extract_data.get("carrier") not in {"Khac", "Unknown", ""} else existing_context.get("carrier", "Khac"),
                    "shop_name": extract_data.get("shop_name") if extract_data.get("shop_name") not in {"Không xác định", "Unknown", ""} else existing_context.get("shop_name", "Không xác định"),
                }

            page_entries.append(
                {
                    "page_index": page_index,
                    "origin_file": file_name,
                    "data": extract_data,
                }
            )

    return {
        "page_entries": page_entries,
        "error_logs": error_logs,
        "order_context_map": order_context_map,
        "page_count": total_pages,
    }


class TikTokWorkflow:
    """Điều phối ingest TikTok với đồng bộ context giữa trang chính và trang phụ."""

    def __init__(self, analyzer: TikTokAnalyzer, normalizer: TikTokNormalizer, grouper: TikTokGrouper) -> None:
        self.analyzer = analyzer
        self.normalizer = normalizer
        self.grouper = grouper

    @staticmethod
    def get_file_hash(file_bytes: bytes) -> str:
        return hashlib.md5(file_bytes).hexdigest()

    @staticmethod
    def normalize_text_key(value: str | None) -> str:
        if not value:
            return ""
        ascii_text = unicodedata.normalize("NFKD", str(value))
        ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii")
        return "".join(character for character in ascii_text.lower() if character.isalnum())

    @classmethod
    def is_unknown_shop(cls, value: str | None) -> bool:
        return cls.normalize_text_key(value) in {"", "unknown", "khongxacdinh"}

    @classmethod
    def is_unknown_carrier(cls, value: str | None) -> bool:
        return cls.normalize_text_key(value) in {"", "unknown", "khac"}

    @staticmethod
    def extract_color_from_norm(normalized_item: dict) -> str:
        image_code = str(normalized_item.get("hinh_in") or "").strip()
        if "-" in image_code:
            return image_code.split("-")[-1].strip() or "Khac"
        return image_code or "Khac"

    @staticmethod
    def build_item_levels(category: str, color: str, size: str) -> tuple[str, str]:
        _ = category
        return color, size

    def process_new_files(self, uploaded_files: list, processed_hashes: set[str]) -> dict:
        source_documents: dict[str, bytes] = {}
        temp_pages_list: list[dict] = []
        error_logs: list[dict] = []
        order_context_map: dict[str, dict] = {}
        saved_file_paths: dict[str, str] = {}
        total_original_pages = 0
        new_hashes: set[str] = set()

        for uploaded_file in uploaded_files:
            try:
                file_bytes = uploaded_file.getvalue()
                file_hash = self.get_file_hash(file_bytes)
                if file_hash in processed_hashes:
                    continue

                new_hashes.add(file_hash)
                source_documents[uploaded_file.name] = file_bytes
                saved_path = save_uploaded_pdf("TikTok", uploaded_file.name, file_bytes)
                saved_file_paths[uploaded_file.name] = to_project_relative(saved_path)

                parsed_result = extract_tiktok_pdf(uploaded_file.name, file_bytes, self.analyzer)
                total_original_pages += parsed_result["page_count"]
                temp_pages_list.extend(parsed_result["page_entries"])
                error_logs.extend(parsed_result["error_logs"])
                order_context_map.update(parsed_result["order_context_map"])
            except Exception as exc:
                error_logs.append(
                    {
                        "File": uploaded_file.name,
                        "Trang": "-",
                        "Lý do": f"Lỗi đọc file: {exc}",
                        "Nội dung thô (50 ký tự)": "",
                    }
                )

        preview_rows, orders_data, items_data = self._finalize_batch(temp_pages_list, order_context_map, saved_file_paths)
        if orders_data or items_data:
            save_to_sqlite(orders_data, items_data)

        df_orders = pd.DataFrame(preview_rows)
        return {
            "pages": temp_pages_list,
            "df_orders": df_orders,
            "error_logs": error_logs,
            "source_documents": source_documents,
            "new_hashes": new_hashes,
            "total_original_pages": total_original_pages,
        }

    def _finalize_batch(self, page_entries: list[dict], order_context_map: dict[str, dict], saved_file_paths: dict[str, str]) -> tuple[list[dict], list[dict], list[dict]]:
        preview_rows: list[dict] = []
        orders_data: list[dict] = []
        items_data: list[dict] = []

        for entry in page_entries:
            data = dict(entry["data"])
            order_id = data.get("order_id", "Unknown")
            current_tracking = data.get("tracking_code", "Unknown")
            is_synced = False

            order_context = order_context_map.get(order_id, {})
            if current_tracking == "Unknown" and order_context.get("tracking_code"):
                current_tracking = order_context["tracking_code"]
                data["tracking_code"] = current_tracking
                is_synced = True

            if self.is_unknown_carrier(data.get("carrier")) and not self.is_unknown_carrier(order_context.get("carrier")):
                data["carrier"] = order_context["carrier"]
                is_synced = True

            if self.is_unknown_shop(data.get("shop_name")) and not self.is_unknown_shop(order_context.get("shop_name")):
                data["shop_name"] = order_context["shop_name"]
                is_synced = True

            if current_tracking != "Unknown":
                orders_data.append(
                    {
                        "order_code": current_tracking,
                        "platform": "TikTok",
                        "carrier": data.get("carrier"),
                        "shop_name": data.get("shop_name"),
                        "ship_date": None,
                        "file_source": saved_file_paths.get(entry["origin_file"], entry["origin_file"]),
                        "created_at": datetime.now().isoformat(timespec="seconds"),
                    }
                )

            if data.get("products"):
                for product in data["products"]:
                    normalized_item = self.normalizer(product["variant_raw"])
                    color = self.extract_color_from_norm(normalized_item)
                    level_2, level_3 = self.build_item_levels(normalized_item["folder"], color, normalized_item["size"])
                    preview_rows.append(
                        {
                            "File Gốc": entry["origin_file"],
                            "Trang": entry["page_index"] + 1,
                            "Loại": "Phụ (Ghép)" if is_synced else "Gốc",
                            "Order ID": order_id,
                            "Mã Vận Đơn": current_tracking,
                            "Tên Sản Phẩm": product.get("product_name", ""),
                            "Phân Loại Gốc": product["variant_raw"],
                            "SL": product["quantity"],
                            "Folder": normalized_item["folder"],
                            "Hình In": normalized_item["hinh_in"],
                            "Size": normalized_item["size"],
                            "Mã SP": normalized_item["ma_sp"],
                            "Tên Sort": normalized_item["sort_name"],
                        }
                    )
                    if current_tracking != "Unknown":
                        items_data.append(
                            {
                                "order_code": current_tracking,
                                "category": normalized_item["folder"],
                                "level_2": level_2,
                                "level_3": level_3,
                                "original_name": product.get("product_name") or product["variant_raw"],
                                "normalized_sku": normalized_item["sort_name"],
                                "quantity": product["quantity"],
                            }
                        )
            else:
                preview_rows.append(
                    {
                        "File Gốc": entry["origin_file"],
                        "Trang": entry["page_index"] + 1,
                        "Loại": "Lỗi/Trống",
                        "Mã Vận Đơn": current_tracking,
                        "Tên Sản Phẩm": "KHÔNG TÌM THẤY SP",
                        "Phân Loại Gốc": "-",
                        "SL": 0,
                        "Folder": "Lỗi",
                        "Hình In": "-",
                        "Size": "-",
                        "Mã SP": "-",
                        "Tên Sort": "-",
                    }
                )

        return preview_rows, orders_data, items_data

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
