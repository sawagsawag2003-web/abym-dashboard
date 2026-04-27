from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

import streamlit as st


class RequestContextLogger:
    """Ghi log thao tác người dùng dựa trên header của Streamlit."""

    def __init__(self, log_dir: Path, log_prefix: str) -> None:
        self.log_dir = Path(log_dir)
        self.log_prefix = log_prefix

    def log(self, message: str) -> None:
        """Ghi log, nhưng không làm văng app nếu header hoặc file log lỗi."""
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            log_file = self.log_dir / f"{self.log_prefix}_{datetime.now():%d%m%Y}.txt"
            headers = getattr(st.context, "headers", {}) or {}
            ip_address = headers.get("X-Forwarded-For", headers.get("Host", "Unknown")).split(",")[0]
            user_agent = headers.get("User-Agent", "Unknown-Device")
            timestamp = datetime.now().strftime("%H:%M:%S")

            with log_file.open("a", encoding="utf-8") as file_handle:
                file_handle.write(
                    f"[{timestamp}] [{ip_address}] [{self._detect_os(user_agent)}] "
                    f"[{self._detect_browser(user_agent)}] {message}\n"
                )
        except Exception as exc:
            print(f"Lỗi ghi log: {exc}")

    @staticmethod
    def _detect_os(user_agent: str) -> str:
        if "Windows NT 10.0" in user_agent:
            return "Win 10/11"
        if "iPhone OS" in user_agent:
            match = re.search(r"OS (\d+_\d+)", user_agent)
            return f"iOS {match.group(1).replace('_', '.')}" if match else "iPhone"
        if "Android" in user_agent:
            match = re.search(r"Android (\d+)", user_agent)
            return f"Android {match.group(1)}" if match else "Android"
        if "Macintosh" in user_agent:
            return "macOS"
        return "Unknown OS"

    @staticmethod
    def _detect_browser(user_agent: str) -> str:
        if "CocCoc" in user_agent:
            return "Cốc Cốc"
        if "Edg/" in user_agent:
            return "Edge"
        if "Chrome" in user_agent and "Safari" in user_agent:
            return "Chrome"
        if "Safari" in user_agent:
            return "Safari"
        return "Unknown Browser"
