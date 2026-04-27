import csv
import sqlite3
import sys
import urllib.request
from io import StringIO
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DB_PATH = PROJECT_ROOT / "backend" / "HoanHuy_Shopee.db"

GOOGLE_SHEET_ID = "1MZfWg0griTLNuWFgo38kF8ol1wT1Hj469h1DTQ1k93U"
HOANHUY_SHEET_GID = "431085623"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def fetch_sheet_csv() -> str:
    url = (
        f"https://docs.google.com/spreadsheets/d/{GOOGLE_SHEET_ID}/export"
        f"?format=csv&gid={HOANHUY_SHEET_GID}"
    )
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8-sig")


def init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS hoan_huy_shopee (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thoi_gian_hoan_ve TEXT,
            aaa TEXT,
            ten_shop TEXT,
            ma_van_don_di TEXT,
            ma_van_don_ve TEXT,
            trang_thai TEXT,
            san_pham TEXT,
            tong_tien TEXT,
            loai_don TEXT
        )
    """)

    conn.commit()
    return conn


def read_rows_from_csv(csv_text: str) -> list[tuple[str, str, str, str, str, str, str, str, str]]:
    reader = csv.reader(StringIO(csv_text))
    rows = list(reader)

    data: list[tuple[str, str, str, str, str, str, str, str, str]] = []
    for row in rows[1:]:
        if not any((cell or "").strip() for cell in row):
            continue

        padded = row[:9] + [""] * max(0, 9 - len(row))
        data.append(tuple((cell or "").strip() for cell in padded[:9]))

    return data


def replace_rows(conn: sqlite3.Connection, rows: list[tuple[str, str, str, str, str, str, str, str, str]]) -> None:
    cursor = conn.cursor()
    cursor.execute("DELETE FROM hoan_huy_shopee")
    cursor.executemany("""
        INSERT INTO hoan_huy_shopee (
            thoi_gian_hoan_ve,
            aaa,
            ten_shop,
            ma_van_don_di,
            ma_van_don_ve,
            trang_thai,
            san_pham,
            tong_tien,
            loai_don
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()


def main() -> None:
    csv_text = fetch_sheet_csv()
    rows = read_rows_from_csv(csv_text)

    conn = init_db(DB_PATH)
    try:
        replace_rows(conn, rows)
    finally:
        conn.close()

    print(f"Đã đồng bộ {len(rows)} dòng vào: {DB_PATH}")


if __name__ == "__main__":
    main()
