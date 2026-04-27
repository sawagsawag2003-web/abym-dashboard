from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable


BACKEND_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_ROOT.parent
DB_PATH = BACKEND_ROOT / "database.db"
SAVED_ORDERS_ROOT = BACKEND_ROOT / "saved_orders"

UNKNOWN_MARKERS = {
    None,
    "",
    "Unknown",
    "Khong xac dinh",
    "Không xác định",
    "Khac",
}


def _sanitize_filename(filename: str) -> str:
    """Keep filenames safe across Windows and Next/Streamlit access."""
    safe_name = re.sub(r'[<>:"/\\|?*]+', "_", filename).strip()
    return safe_name or "uploaded.pdf"


def get_connection() -> sqlite3.Connection:
    """Open a SQLite connection configured for concurrent local reads."""
    connection = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    connection.execute("PRAGMA journal_mode=WAL;")
    connection.execute("PRAGMA foreign_keys=OFF;")
    return connection


def to_project_relative(path: Path) -> str:
    """Store file paths relative to the project root for portability."""
    try:
        return path.resolve().relative_to(BACKEND_ROOT.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _split_normalized_sku(normalized_sku: str | None) -> tuple[str | None, str | None]:
    """
    Extract color and size from the normalized SKU.
    Expected format: <base>-<color>-<size>
    Example: M@DRIW-TRẮNG-M -> (TRẮNG, M)
    """
    if not normalized_sku:
        return None, None

    sku = str(normalized_sku).strip()
    parts = sku.rsplit("-", 2)
    if len(parts) < 3:
        return None, None

    color = parts[-2].strip() or None
    size = parts[-1].strip() or None
    return color, size


def init_db() -> Path:
    """Create the SQLite database and all required tables."""
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS Orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_code TEXT,
                platform TEXT NOT NULL,
                carrier TEXT,
                shop_name TEXT,
                ship_date TEXT,
                file_source TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS Order_Items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_code TEXT,
                category TEXT,
                original_name TEXT,
                normalized_sku TEXT,
                color TEXT,
                size TEXT,
                quantity INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS Production_Log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ref_sku TEXT,
                action_type TEXT,
                quantity INTEGER NOT NULL,
                action_date TEXT,
                notes TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_orders_platform ON Orders(platform);
            CREATE INDEX IF NOT EXISTS idx_orders_order_code ON Orders(order_code);
            CREATE INDEX IF NOT EXISTS idx_items_order_code ON Order_Items(order_code);
            CREATE INDEX IF NOT EXISTS idx_items_normalized_sku ON Order_Items(normalized_sku);
            CREATE INDEX IF NOT EXISTS idx_production_ref_sku ON Production_Log(ref_sku);
            """
        )

        item_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(Order_Items)").fetchall()
        }
        if "color" not in item_columns:
            connection.execute("ALTER TABLE Order_Items ADD COLUMN color TEXT")
        if "size" not in item_columns:
            connection.execute("ALTER TABLE Order_Items ADD COLUMN size TEXT")

        connection.execute("CREATE INDEX IF NOT EXISTS idx_items_color ON Order_Items(color)")
        connection.execute("CREATE INDEX IF NOT EXISTS idx_items_size ON Order_Items(size)")

        existing_items = connection.execute(
            """
            SELECT id, normalized_sku
            FROM Order_Items
            WHERE (color IS NULL OR TRIM(color) = '')
               OR (size IS NULL OR TRIM(size) = '')
            """
        ).fetchall()
        if existing_items:
            connection.executemany(
                "UPDATE Order_Items SET color = ?, size = ? WHERE id = ?",
                [
                    (*_split_normalized_sku(normalized_sku), row_id)
                    for row_id, normalized_sku in existing_items
                ],
            )
    return DB_PATH


def save_uploaded_pdf(platform: str, original_filename: str, file_bytes: bytes) -> Path:
    """Store uploaded PDFs under saved_orders/{Platform}/{YYYY-MM}/."""
    now = datetime.now()
    month_folder = now.strftime("%Y-%m")
    target_dir = SAVED_ORDERS_ROOT / platform / month_folder
    target_dir.mkdir(parents=True, exist_ok=True)

    timestamp = now.strftime("%Y%m%d_%H%M%S_%f")
    safe_name = _sanitize_filename(original_filename)
    target_path = target_dir / f"{timestamp}_{safe_name}"
    target_path.write_bytes(file_bytes)
    return target_path


def _has_real_value(value: str | None) -> bool:
    if value is None:
        return False
    return str(value).strip() not in UNKNOWN_MARKERS


def _merge_orders(orders_data: Iterable[dict]) -> list[dict]:
    """
    Merge duplicated order rows inside the same save batch.
    Same file + same platform + same tracking code should be one order.
    """
    merged: dict[tuple[str | None, str | None, str | None], dict] = {}

    for row in orders_data:
        key = (
            row.get("order_code"),
            row.get("platform"),
            row.get("file_source"),
        )

        existing = merged.get(key)
        if not existing:
            merged[key] = dict(row)
            continue

        for field in ("carrier", "shop_name", "ship_date"):
            if not _has_real_value(existing.get(field)) and _has_real_value(row.get(field)):
                existing[field] = row.get(field)

        if not _has_real_value(existing.get("created_at")) and _has_real_value(row.get("created_at")):
            existing["created_at"] = row.get("created_at")

    return list(merged.values())


def _merge_items_by_order(item_rows: list[dict]) -> list[dict]:
    """
    Merge duplicated item rows inside the same save batch.
    Same order + same SKU + same original name should be summed.
    """
    merged: dict[tuple[str | None, str | None, str | None, str | None], dict] = {}

    for row in item_rows:
        key = (
            row.get("order_code"),
            row.get("category"),
            row.get("original_name"),
            row.get("normalized_sku"),
        )

        existing = merged.get(key)
        if not existing:
            merged[key] = dict(row)
            continue

        existing["quantity"] = int(existing.get("quantity", 0) or 0) + int(row.get("quantity", 0) or 0)

    return list(merged.values())


def save_to_sqlite(orders_data: Iterable[dict], items_data: Iterable[dict]) -> None:
    """
    Save extracted orders and items into SQLite.
    Rule: one order per platform + tracking code, regardless of PDF source.
    If the same order already exists from another PDF, skip the new one.
    """
    init_db()

    merged_orders = _merge_orders(orders_data)
    merged_items = _merge_items_by_order(list(items_data))

    incoming_order_keys = {
        (row.get("order_code"), row.get("platform"))
        for row in merged_orders
        if row.get("order_code") and row.get("platform")
    }

    accepted_order_keys: set[tuple[str, str]] = set()
    filtered_orders: list[dict] = []

    with get_connection() as connection:
        existing_order_keys = {
            (row[0], row[1])
            for row in connection.execute(
                """
                SELECT order_code, platform
                FROM Orders
                WHERE order_code IS NOT NULL AND platform IS NOT NULL
                """
            ).fetchall()
        }

        seen_in_batch: set[tuple[str, str]] = set()
        for row in merged_orders:
            order_code = row.get("order_code")
            platform = row.get("platform")
            if not order_code or not platform:
                continue

            order_key = (order_code, platform)
            if order_key in existing_order_keys:
                continue
            if order_key in seen_in_batch:
                continue

            seen_in_batch.add(order_key)
            accepted_order_keys.add(order_key)
            filtered_orders.append(row)

        order_rows = [
            (
                row.get("order_code"),
                row.get("platform"),
                row.get("carrier"),
                row.get("shop_name"),
                row.get("ship_date"),
                row.get("file_source"),
                row.get("created_at") or datetime.now().isoformat(timespec="seconds"),
            )
            for row in filtered_orders
        ]

        batch_order_codes = {
            row.get("order_code")
            for row in merged_orders
            if row.get("order_code")
        }
        item_rows = [
            (
                row.get("order_code"),
                row.get("category"),
                row.get("original_name"),
                row.get("normalized_sku"),
                *_split_normalized_sku(row.get("normalized_sku")),
                int(row.get("quantity", 0) or 0),
            )
            for row in merged_items
            if row.get("order_code") in batch_order_codes
        ]

        if order_rows:
            connection.executemany(
                """
                INSERT INTO Orders (
                    order_code,
                    platform,
                    carrier,
                    shop_name,
                    ship_date,
                    file_source,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                order_rows,
            )

        if item_rows:
            # Refresh item details for uploaded orders so DB matches the latest extracted PDF content.
            connection.executemany(
                "DELETE FROM Order_Items WHERE order_code = ?",
                [(order_code,) for order_code in sorted(batch_order_codes)],
            )
            connection.executemany(
                """
                INSERT INTO Order_Items (
                    order_code,
                    category,
                    original_name,
                    normalized_sku,
                    color,
                    size,
                    quantity
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                item_rows,
            )


if __name__ == "__main__":
    db_path = init_db()
    print(f"SQLite database ready: {db_path}")
