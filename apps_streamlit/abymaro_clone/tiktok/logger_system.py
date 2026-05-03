import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
STREAMLIT_APPS_ROOT = Path(__file__).resolve().parents[2]
for import_root in (PROJECT_ROOT, STREAMLIT_APPS_ROOT):
    if str(import_root) not in sys.path:
        sys.path.append(str(import_root))

from abymaro_clone.core.config import LOG_DIR, TIKTOK_CONFIG
from abymaro_clone.core.logging_utils import RequestContextLogger

def log_hidden(message):
    """Wrapper tương thích ngược cho logger TikTok."""
    RequestContextLogger(LOG_DIR, TIKTOK_CONFIG.log_prefix).log(message)
