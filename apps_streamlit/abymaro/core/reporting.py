from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class ShopeeMetrics:
    total_output_pages: int
    total_input_pages: int
    total_products: int
    page_status: str
    duplicates: pd.Series
    large_orders: pd.DataFrame


class ShopeeReportBuilder:
    """Tổng hợp chỉ số Shopee bằng thao tác vectorized trên DataFrame."""

    @staticmethod
    def build_metrics(df_orders: pd.DataFrame, total_input_pages: int, total_output_pages: int) -> ShopeeMetrics:
        if df_orders.empty:
            empty_duplicates = pd.Series(dtype="int64")
            empty_large_orders = pd.DataFrame(columns=["Tên Shop", "Mã Vận Đơn", "Số Lượng"])
            return ShopeeMetrics(
                total_output_pages=total_output_pages,
                total_input_pages=total_input_pages,
                total_products=0,
                page_status="Khớp" if total_input_pages == total_output_pages else "Lệch",
                duplicates=empty_duplicates,
                large_orders=empty_large_orders,
            )

        df_valid = df_orders.loc[df_orders["Mã Vận Đơn"].ne("Khong thay")].copy()
        duplicate_counts = df_valid.groupby("Mã Vận Đơn")["File Gốc"].nunique()
        duplicates = duplicate_counts.loc[duplicate_counts.gt(1)]

        if "Tổng SL" not in df_valid:
            df_valid["Tổng SL"] = 0
        df_valid["Tổng SL"] = pd.to_numeric(df_valid["Tổng SL"], errors="coerce").fillna(0)
        df_valid["SL"] = pd.to_numeric(df_valid["SL"], errors="coerce").fillna(0)

        grouped = (
            df_valid.groupby(["Mã Vận Đơn", "Tên Shop"], as_index=False)
            .agg(extracted_qty=("SL", "sum"), reported_qty=("Tổng SL", "max"))
        )
        grouped["Số Lượng"] = grouped["reported_qty"].where(grouped["reported_qty"].gt(0), grouped["extracted_qty"])
        large_orders = grouped.loc[grouped["Số Lượng"].gt(9), ["Tên Shop", "Mã Vận Đơn", "Số Lượng"]]

        return ShopeeMetrics(
            total_output_pages=total_output_pages,
            total_input_pages=total_input_pages,
            total_products=int(grouped["Số Lượng"].sum()),
            page_status="Khớp" if total_input_pages == total_output_pages else "Lệch",
            duplicates=duplicates,
            large_orders=large_orders,
        )


@dataclass
class TikTokMetrics:
    total_output_pages: int
    total_input_pages: int
    total_products: int
    error_count: int
    spam_orders: list[str]


class TikTokReportBuilder:
    """Tổng hợp chỉ số TikTok bằng phép tính vectorized."""

    @staticmethod
    def build_metrics(df_orders: pd.DataFrame, total_input_pages: int, total_output_pages: int, error_count: int) -> TikTokMetrics:
        if df_orders.empty:
            return TikTokMetrics(
                total_output_pages=total_output_pages,
                total_input_pages=total_input_pages,
                total_products=0,
                error_count=error_count,
                spam_orders=[],
            )

        order_counts = df_orders["Mã Vận Đơn"].fillna("").value_counts()
        spam_orders = order_counts.loc[order_counts.gt(10)].index.tolist()
        total_products = int(pd.to_numeric(df_orders.loc[df_orders["SL"].gt(0), "SL"], errors="coerce").fillna(0).sum())

        return TikTokMetrics(
            total_output_pages=total_output_pages,
            total_input_pages=total_input_pages,
            total_products=total_products,
            error_count=error_count,
            spam_orders=spam_orders,
        )
