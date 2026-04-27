from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
STREAMLIT_ROOT = PROJECT_ROOT / "apps_streamlit" / "abymaro"
BACKEND_ROOT = PROJECT_ROOT / "backend"
LOG_DIR = BACKEND_ROOT / "log"


@dataclass(frozen=True)
class PlatformConfig:
    """Cấu hình cố định cho từng nền tảng xử lý PDF."""

    platform_name: str
    log_prefix: str
    unknown_tracking: str
    unknown_shop: str
    unknown_carrier: str
    upload_label: str
    session_defaults: dict[str, object] = field(default_factory=dict)


SHOPEE_CONFIG = PlatformConfig(
    platform_name="Shopee",
    log_prefix="log_shopee",
    unknown_tracking="Khong thay",
    unknown_shop="Không xác định",
    unknown_carrier="Khác",
    upload_label="Tải lên file PDF Shopee",
    session_defaults={
        "last_saved_upload_batch": [],
    },
)


TIKTOK_CONFIG = PlatformConfig(
    platform_name="TikTok",
    log_prefix="log_tiktok",
    unknown_tracking="Unknown",
    unknown_shop="Không xác định",
    unknown_carrier="Khác",
    upload_label="Tải lên file PDF TikTok",
    session_defaults={
        "processed_files": set(),
        "all_pages_flat_list": [],
        "source_documents": {},
        "df_total": None,
        "error_logs": [],
        "total_original_pages": 0,
        "last_upload_hash": [],
    },
)
