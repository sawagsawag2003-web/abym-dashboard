import os
import re
import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime

import fitz

IGNORE_CODES = {
    "VND",
    "SHOPEE",
    "TIKTOK",
    "SL",
    "COD",
}


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def normalize_code(value):
    return re.sub(r"\s+", "", (value or "").upper())


def extract_page_text(page):
    text = ""
    try:
        text = page.get_text("text") or ""
    except Exception:
        text = ""

    if text.strip():
        return text

    if hasattr(page, "get_textpage_ocr"):
        try:
            textpage = page.get_textpage_ocr(flags=0, language="eng")
            return page.get_text(textpage=textpage) or ""
        except Exception:
            return ""

    return ""


def detect_carrier(code):
    normalized = normalize_code(code)
    if normalized.startswith("SPXVN"):
        return "Shopee Express"
    if re.fullmatch(r"G[A-Z0-9]{7,20}", normalized):
        return "Giao Hang Nhanh"
    if normalized.startswith("VTP") or normalized.startswith("SHOPEEVTP"):
        return "Viettel Post"
    if normalized.startswith("TTVN"):
        return "Best Express"
    if normalized.startswith("330"):
        return "GHTK"
    if normalized.startswith("8") and normalized.isdigit() and len(normalized) == 12:
        return "J&T"
    if normalized.startswith("NJVN") or normalized.startswith("SPEV"):
        return "Ninja Van"
    return ""


def extract_codes_from_text(text):
    found = set()
    token_counter = Counter()

    for token in re.split(r"[^A-Za-z0-9-]+", (text or "").upper()):
        cleaned = token.strip("-")
        if cleaned:
            token_counter[cleaned] += 1

    for line in (text or "").splitlines():
        normalized_line = normalize_code(line)
        if normalized_line:
            token_counter[normalized_line] += 1

    for candidate, frequency in token_counter.items():
        if len(candidate) < 6 or len(candidate) > 24:
            continue
        if not re.fullmatch(r"[A-Z0-9-]+", candidate):
            continue
        if candidate in IGNORE_CODES:
            continue

        carrier = detect_carrier(candidate)
        if carrier == "J&T":
            if frequency >= 3:
                found.add((candidate, carrier))
            continue

        if candidate.isdigit():
            continue
        if not any(char.isdigit() for char in candidate):
            continue
        if not any(char.isalpha() for char in candidate):
            continue
        if carrier:
            found.add((candidate, carrier))
            continue
        if frequency >= 2 and len(candidate) >= 8:
            found.add((candidate, carrier))

    return sorted(found)


def extract_tiktok_order_ids_from_text(text):
    return sorted(set(re.findall(r"Order ID:\s*(\d+)", text or "")))


class TracerIndex:
    def __init__(self, root_path, db_path=None):
        self.root_path = os.path.abspath(root_path)
        self.db_path = os.path.abspath(db_path or os.path.join(self.root_path, ".tracer-index.db"))

    @contextmanager
    def get_connection(self):
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA temp_store=MEMORY")
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_db(self):
        os.makedirs(self.root_path, exist_ok=True)
        with self.get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS order_index (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_code TEXT NOT NULL,
                    carrier TEXT NOT NULL DEFAULT '',
                    file_path TEXT NOT NULL,
                    page_number INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    file_size INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS indexed_files (
                    file_path TEXT PRIMARY KEY,
                    file_size INTEGER NOT NULL,
                    modified_at REAL NOT NULL,
                    page_count INTEGER NOT NULL,
                    indexed_at TEXT NOT NULL
                )
                """
            )
            existing_columns = {
                row[1] for row in conn.execute("PRAGMA table_info(order_index)").fetchall()
            }
            if "carrier" not in existing_columns:
                conn.execute("ALTER TABLE order_index ADD COLUMN carrier TEXT NOT NULL DEFAULT ''")

            conn.execute("CREATE INDEX IF NOT EXISTS idx_order_code ON order_index(order_code)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_order_carrier ON order_index(carrier)")
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_order_page_unique "
                "ON order_index(order_code, file_path, page_number)"
            )

    def ensure_within_root(self, target_path):
        root_abs = os.path.abspath(self.root_path)
        target_abs = os.path.abspath(target_path)
        if os.path.commonpath([root_abs, target_abs]) != root_abs:
            raise ValueError("Target path is outside tracer root")
        return target_abs

    def get_relative_file_path(self, file_path):
        abs_root = os.path.abspath(self.root_path)
        abs_file = os.path.abspath(file_path)
        return os.path.relpath(abs_file, abs_root).replace("\\", "/")

    def is_file_indexed(self, conn, relative_path, file_size, modified_at):
        row = conn.execute(
            "SELECT file_size, modified_at FROM indexed_files WHERE file_path = ?",
            (relative_path,),
        ).fetchone()
        if not row:
            return False
        return row[0] == file_size and abs(row[1] - modified_at) < 0.0001

    def remove_file_index(self, conn, relative_path):
        conn.execute("DELETE FROM order_index WHERE file_path = ?", (relative_path,))
        conn.execute("DELETE FROM indexed_files WHERE file_path = ?", (relative_path,))

    def index_pdf_file(self, file_path, force=False):
        self.init_db()
        absolute_path = self.ensure_within_root(file_path)
        if not os.path.exists(absolute_path):
            return {"indexed": False, "reason": "missing"}

        file_stat = os.stat(absolute_path)
        relative_path = self.get_relative_file_path(absolute_path)

        with self.get_connection() as conn:
            if not force and self.is_file_indexed(conn, relative_path, file_stat.st_size, file_stat.st_mtime):
                return {"indexed": False, "reason": "unchanged", "file_path": relative_path}

            doc = fitz.open(absolute_path)
            try:
                self.remove_file_index(conn, relative_path)
                page_count = len(doc)
                page_rows = []
                created_at = datetime.fromtimestamp(file_stat.st_mtime).strftime("%d/%m/%Y %H:%M")

                for page_index in range(page_count):
                    page = doc.load_page(page_index)
                    text = extract_page_text(page)
                    for code, carrier in extract_codes_from_text(text):
                        page_rows.append((code, carrier, relative_path, page_index + 1, created_at, file_stat.st_size))

                if page_rows:
                    conn.executemany(
                        """
                        INSERT OR IGNORE INTO order_index(order_code, carrier, file_path, page_number, created_at, file_size)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        page_rows,
                    )

                conn.execute(
                    """
                    INSERT INTO indexed_files(file_path, file_size, modified_at, page_count, indexed_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(file_path) DO UPDATE SET
                        file_size = excluded.file_size,
                        modified_at = excluded.modified_at,
                        page_count = excluded.page_count,
                        indexed_at = excluded.indexed_at
                    """,
                    (relative_path, file_stat.st_size, file_stat.st_mtime, page_count, now_iso()),
                )
            finally:
                doc.close()

        return {"indexed": True, "file_path": relative_path, "page_count": page_count}

    def sync(self, force=False):
        self.init_db()
        indexed = 0
        skipped = 0

        if not os.path.isdir(self.root_path):
            return {"indexed": indexed, "skipped": skipped}

        for current_root, _, files in os.walk(self.root_path):
            for file_name in files:
                if not file_name.lower().endswith(".pdf"):
                    continue
                if file_name == os.path.basename(self.db_path):
                    continue

                file_path = os.path.join(current_root, file_name)
                result = self.index_pdf_file(file_path, force=force)
                if result.get("indexed"):
                    indexed += 1
                else:
                    skipped += 1

        return {"indexed": indexed, "skipped": skipped}

    def search_order_codes(self, codes):
        self.init_db()
        normalized_codes = []
        seen = set()

        for code in codes:
            normalized = normalize_code(code)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            normalized_codes.append(normalized)

        if not normalized_codes:
            return []

        placeholders = ", ".join("?" for _ in normalized_codes)
        with self.get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT order_code, file_path, page_number, created_at, file_size, carrier
                FROM order_index
                WHERE order_code IN ({placeholders})
                ORDER BY order_code ASC, created_at DESC, file_path ASC, page_number ASC
                """,
                normalized_codes,
            ).fetchall()

        return [
            {
                "orderId": row[0],
                "filePath": row[1],
                "fileName": os.path.basename(row[1]),
                "pageNumber": row[2],
                "createdAt": row[3],
                "fileSize": row[4],
                "carrier": row[5],
            }
            for row in rows
        ]

    def search_order_codes_in_files(self, items):
        grouped = {}
        for item in items or []:
            relative_path = item.get("filePath")
            order_id = item.get("orderId")
            if not relative_path or not order_id:
                continue
            grouped.setdefault(relative_path, []).append(item)

        results = []
        for relative_path, file_items in grouped.items():
            source_path = self.ensure_within_root(os.path.join(self.root_path, relative_path))
            if not os.path.exists(source_path):
                continue

            code_map = {}
            for item in file_items:
                normalized = normalize_code(item.get("orderId"))
                if not normalized:
                    continue
                code_map.setdefault(normalized, []).append(item)

            if not code_map:
                continue

            doc = fitz.open(source_path)
            try:
                scanned_pages = []
                tiktok_order_map = {}
                result_keys = set()

                for page_index in range(len(doc)):
                    page = doc.load_page(page_index)
                    text = extract_page_text(page)
                    tiktok_order_ids = extract_tiktok_order_ids_from_text(text)
                    page_codes = {
                        normalize_code(code): carrier for code, carrier in extract_codes_from_text(text)
                    }
                    scanned_pages.append(
                        {
                            "page_index": page_index,
                            "page_codes": page_codes,
                            "tiktok_order_ids": tiktok_order_ids,
                        }
                    )

                    for normalized_code, detected_carrier in page_codes.items():
                        if normalized_code not in code_map:
                            continue

                        for item in code_map[normalized_code]:
                            key = (item.get("orderId", ""), relative_path, page_index + 1)
                            if key not in result_keys:
                                result_keys.add(key)
                                results.append(
                                    {
                                        "orderId": item.get("orderId", ""),
                                        "carrier": item.get("carrier") or detected_carrier or "",
                                        "filePath": relative_path,
                                        "fileName": os.path.basename(relative_path),
                                        "pageNumber": page_index + 1,
                                        "createdAt": item.get("createdAt", ""),
                                        "fileSize": int(item.get("fileSize") or 0),
                                    }
                                )

                            for tiktok_order_id in tiktok_order_ids:
                                tiktok_order_map.setdefault(tiktok_order_id, []).append(item)

                for scanned_page in scanned_pages:
                    for tiktok_order_id in scanned_page["tiktok_order_ids"]:
                        for item in tiktok_order_map.get(tiktok_order_id, []):
                            page_number = scanned_page["page_index"] + 1
                            key = (item.get("orderId", ""), relative_path, page_number)
                            if key in result_keys:
                                continue

                            result_keys.add(key)
                            results.append(
                                {
                                    "orderId": item.get("orderId", ""),
                                    "carrier": item.get("carrier") or "",
                                    "filePath": relative_path,
                                    "fileName": os.path.basename(relative_path),
                                    "pageNumber": page_number,
                                    "createdAt": item.get("createdAt", ""),
                                    "fileSize": int(item.get("fileSize") or 0),
                                }
                            )
            finally:
                doc.close()

        results.sort(
            key=lambda row: (
                row.get("orderId", ""),
                row.get("createdAt", ""),
                row.get("filePath", ""),
                int(row.get("pageNumber", 0) or 0),
            ),
            reverse=False,
        )
        return results

    def get_database_stats(self):
        self.init_db()
        with self.get_connection() as conn:
            row = conn.execute("SELECT COUNT(*), COALESCE(SUM(file_size), 0) FROM indexed_files").fetchone()

        return {
            "totalFiles": row[0] if row else 0,
            "totalSizeBytes": row[1] if row else 0,
        }

    def write_single_page(self, relative_path, page_number, output_path):
        source_path = self.ensure_within_root(os.path.join(self.root_path, relative_path))
        doc = fitz.open(source_path)
        out_doc = fitz.open()
        try:
            out_doc.insert_pdf(doc, from_page=page_number - 1, to_page=page_number - 1)
            out_doc.save(output_path, garbage=4, deflate=True)
        finally:
            out_doc.close()
            doc.close()

        return {"outputPath": output_path}

    def merge_pages(self, items, output_path):
        out_doc = fitz.open()
        try:
            for item in items:
                source_path = self.ensure_within_root(os.path.join(self.root_path, item["filePath"]))
                page_number = int(item["pageNumber"])
                doc = fitz.open(source_path)
                try:
                    out_doc.insert_pdf(doc, from_page=page_number - 1, to_page=page_number - 1)
                finally:
                    doc.close()

            out_doc.save(output_path, garbage=4, deflate=True)
        finally:
            out_doc.close()

        return {"outputPath": output_path}
