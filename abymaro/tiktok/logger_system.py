import os
import re
from datetime import datetime
import streamlit as st # Dùng trực tiếp thư viện chuẩn

def log_hidden(message):
    """Hàm ghi log ẩn, soi từ IP, OS đến Trình duyệt (Bản cập nhật)"""
    try:
        # 1. Tạo thư mục chứa log
        log_folder = "log"
        if not os.path.exists(log_folder):
            os.makedirs(log_folder)
        
        # 2. Định dạng tên file theo ngày của TikTok
        log_filename = os.path.join(log_folder, f"log_tiktok_{datetime.now().strftime('%d%m%Y')}.txt")
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        # 3. Móc thông tin thiết bị bằng CÚ PHÁP MỚI
        headers = st.context.headers
        ip = headers.get("X-Forwarded-For", "Unknown-IP").split(",")[0]
        user_agent = headers.get("User-Agent", "Unknown-Device")
        
        # 4. Check hệ điều hành
        os_info = "Unknown OS"
        if "Windows NT 10.0" in user_agent: os_info = "Win 10/11"
        elif "iPhone OS" in user_agent:
            v = re.search(r"OS (\d+_\d+)", user_agent)
            os_info = f"iOS {v.group(1).replace('_','.')}" if v else "iPhone"
        elif "Android" in user_agent:
            v = re.search(r"Android (\d+)", user_agent)
            os_info = f"Android {v.group(1)}" if v else "Android"
        elif "Macintosh" in user_agent: os_info = "macOS"
        
        # 5. Check trình duyệt
        browser = "Unknown Browser"
        if "CocCoc" in user_agent: browser = "Cốc Cốc"
        elif "Edg/" in user_agent: browser = "Edge"
        elif "Chrome" in user_agent and "Safari" in user_agent: browser = "Chrome"
        elif "Safari" in user_agent: browser = "Safari"

        # 6. Viết vào sổ cái
        with open(log_filename, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{ip}] [{os_info}] [{browser}] {message}\n")
            
    except Exception as e:
        print(f"Lỗi ghi log: {e}")