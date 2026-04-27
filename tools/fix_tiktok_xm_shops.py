from __future__ import annotations

import argparse
import csv
import re
import shutil
import sqlite3
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path


SPACED_SHOP = "XM Kỷ Nguyên"
DOTTED_SHOP = "XM.Kỷ Nguyên"
UNKNOWN_SHOP = "UNKNOWN"
AMBIGUOUS_SHOP = "AMBIGUOUS"


def normalize_for_rule(value: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFD", value or "")
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text


def detect_xm_shop_from_text(value: str) -> str:
    text = normalize_for_rule(value)

    dotted_patterns = [
        r"\bxm\s*\.\s*ky\s+nguyen\b",
        r"\bxm\s*\.\s*kỷ\s+nguyên\b",
    ]
    spaced_patterns = [
        r"\bxm\s+ky\s+nguyen\b",
        r"\bxm\s+kỷ\s+nguyên\b",
    ]

    dotted = any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in dotted_patterns)
    spaced = any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in spaced_patterns)

    if dotted and not spaced:
        return DOTTED_SHOP
    if spaced and not dotted:
        return SPACED_SHOP
    if dotted and spaced:
        return AMBIGUOUS_SHOP
    return UNKNOWN_SHOP


def import_fitz():
    try:
        import fitz  # type: ignore

        return fitz
    except Exception as exc:  # pragma: no cover - depends on target machine
        raise SystemExit(
            "Missing PyMuPDF. Install it on the data machine with: python -m pip install PyMuPDF\n"
            f"Import error: {exc}"
        ) from exc


def read_pdf_text(pdf_path: Path) -> str:
    fitz = import_fitz()
    text_parts: list[str] = []

    with fitz.open(pdf_path) as document:
        for page in document:
            text_parts.append(page.get_text())

    return "\n".join(text_parts)


def resolve_file_source(root: Path, file_source: str | None) -> Path | None:
    if not file_source:
        return None

    source_path = Path(file_source)
    if source_path.is_absolute():
        return source_path

    candidates = [
        root / "backend" / source_path,
        root / source_path,
    ]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


def fetch_candidate_orders(connection: sqlite3.Connection) -> list[sqlite3.Row]:
    connection.row_factory = sqlite3.Row
    return list(
        connection.execute(
            """
            SELECT id, order_code, platform, shop_name, file_source, created_at
            FROM Orders
            WHERE lower(platform) LIKE '%tiktok%'
              AND shop_name IS NOT NULL
              AND lower(shop_name) LIKE '%xm%'
            ORDER BY file_source, id
            """
        )
    )


def build_report_rows(root: Path, orders: list[sqlite3.Row]) -> list[dict[str, str]]:
    detected_by_source: dict[str, tuple[str, str]] = {}
    report_rows: list[dict[str, str]] = []

    for order in orders:
        file_source = order["file_source"] or ""

        if file_source not in detected_by_source:
            pdf_path = resolve_file_source(root, file_source)
            detected = UNKNOWN_SHOP
            reason = "missing file_source"

            if pdf_path is not None:
                name_detected = detect_xm_shop_from_text(pdf_path.name)
                if name_detected in {SPACED_SHOP, DOTTED_SHOP}:
                    detected = name_detected
                    reason = "filename"
                elif not pdf_path.exists():
                    detected = UNKNOWN_SHOP
                    reason = f"pdf not found: {pdf_path}"
                else:
                    try:
                        content_detected = detect_xm_shop_from_text(read_pdf_text(pdf_path))
                        detected = content_detected
                        reason = "pdf text" if content_detected in {SPACED_SHOP, DOTTED_SHOP} else content_detected.lower()
                    except Exception as exc:
                        detected = UNKNOWN_SHOP
                        reason = f"pdf read error: {exc}"

            detected_by_source[file_source] = (detected, reason)

        detected_shop, reason = detected_by_source[file_source]
        current_shop = order["shop_name"] or ""
        action = "skip"

        if detected_shop in {SPACED_SHOP, DOTTED_SHOP}:
            action = "update" if current_shop != detected_shop else "keep"

        report_rows.append(
            {
                "id": str(order["id"]),
                "order_code": order["order_code"] or "",
                "platform": order["platform"] or "",
                "current_shop": current_shop,
                "detected_shop": detected_shop,
                "action": action,
                "reason": reason,
                "file_source": file_source,
                "created_at": order["created_at"] or "",
            }
        )

    return report_rows


def write_report(report_path: Path, rows: list[dict[str, str]]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "id",
        "order_code",
        "platform",
        "current_shop",
        "detected_shop",
        "action",
        "reason",
        "file_source",
        "created_at",
    ]

    with report_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def backup_database(db_path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(f"{db_path.name}.bak-{timestamp}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def apply_updates(connection: sqlite3.Connection, rows: list[dict[str, str]]) -> int:
    updates = [
        (row["detected_shop"], row["id"])
        for row in rows
        if row["action"] == "update" and row["detected_shop"] in {SPACED_SHOP, DOTTED_SHOP}
    ]

    if not updates:
        return 0

    connection.executemany("UPDATE Orders SET shop_name = ? WHERE id = ?", updates)
    connection.commit()
    return len(updates)


def print_summary(rows: list[dict[str, str]], report_path: Path, applied: int | None = None) -> None:
    detected_counts = Counter(row["detected_shop"] for row in rows)
    action_counts = Counter(row["action"] for row in rows)

    print(f"Scanned rows: {len(rows)}")
    print("Detected:")
    for key, count in sorted(detected_counts.items()):
        print(f"  {key}: {count}")

    print("Actions:")
    for key, count in sorted(action_counts.items()):
        print(f"  {key}: {count}")

    if applied is not None:
        print(f"Applied updates: {applied}")

    print(f"Report: {report_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit and optionally fix TikTok XM shop names in backend/database.db."
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root that contains backend/database.db and backend/saved_orders.",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="Optional explicit path to database.db. Defaults to <root>/backend/database.db.",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Optional CSV report path. Defaults to <root>/tools/reports/fix_tiktok_xm_shops_<timestamp>.csv.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply safe updates. Without this flag the script only writes a report.",
    )
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    db_path = Path(args.db).expanduser().resolve() if args.db else root / "backend" / "database.db"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    report_path = (
        Path(args.report).expanduser().resolve()
        if args.report
        else root / "tools" / "reports" / f"fix_tiktok_xm_shops_{timestamp}.csv"
    )

    if not db_path.exists():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1

    connection = sqlite3.connect(db_path)
    try:
        orders = fetch_candidate_orders(connection)
        rows = build_report_rows(root, orders)
        write_report(report_path, rows)

        applied = None
        if args.apply:
            backup_path = backup_database(db_path)
            print(f"Backup created: {backup_path}")
            applied = apply_updates(connection, rows)

        print_summary(rows, report_path, applied)
    finally:
        connection.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
