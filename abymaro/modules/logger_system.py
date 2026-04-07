import os
import re
from datetime import datetime
import streamlit as st 

def log_hidden(message):
    """Hàm ghi log ẩn cho Shopee, lấy IP chuẩn trong LAN"""
    try:
        log_folder = "log"
        if not os.path.exists(log_folder):
            os.makedirs(log_folder)
        
        # Tên file log dành riêng cho Shopee
        log_filename = os.path.join(log_folder, f"log_shopee_{datetime.now().strftime('%d%m%Y')}.txt")
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        # Lấy thông tin Header bằng cú pháp mới của Streamlit
        headers = st.context.headers
        
        # Tuyệt chiêu lấy IP: Tìm X-Forwarded-For trước, nếu không có thì lôi thẻ Host ra
        ip = headers.get("X-Forwarded-For", headers.get("Host", "Unknown")).split(",")[0]
        user_agent = headers.get("User-Agent", "Unknown-Device")
        
        # Check Hệ điều hành
        os_info = "Unknown OS"
        if "Windows NT 10.0" in user_agent: os_info = "Win 10/11"
        elif "iPhone OS" in user_agent:
            v = re.search(r"OS (\d+_\d+)", user_agent)
            os_info = f"iOS {v.group(1).replace('_','.')}" if v else "iPhone"
        elif "Android" in user_agent:
            v = re.search(r"Android (\d+)", user_agent)
            os_info = f"Android {v.group(1)}" if v else "Android"
        elif "Macintosh" in user_agent: os_info = "macOS"
        
        # Check Trình duyệt
        browser = "Unknown Browser"
        if "CocCoc" in user_agent: browser = "Cốc Cốc"
        elif "Edg/" in user_agent: browser = "Edge"
        elif "Chrome" in user_agent and "Safari" in user_agent: browser = "Chrome"
        elif "Safari" in user_agent: browser = "Safari"

        # Ghi log
        with open(log_filename, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{ip}] [{os_info}] [{browser}] {message}\n")
            
    except Exception as e:
        print(f"Lỗi ghi log: {e}")