import re
import unicodedata


def _normalize_rule_text(value):
    text = str(value or "").upper().strip()
    text = text.replace("Đ", "D")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text


def normalize_variant(raw_text):
    """
    Input example: "BanBiDZ-Den,M(37-46kg)" or "QN02-XamTieu,XL".
    Split the trailing size from the product text, then classify the item.
    """
    if not raw_text:
        return {
            "folder": "Khac",
            "sort_name": "ZZ_Unknown",
            "ma_sp": "Unknown",
            "size": "Unknown",
            "hinh_in": "Unknown",
        }

    text_upper = str(raw_text).upper().strip()
    size_pattern = r"(.*?)(?:,|-|\()?\b(XXL|2XL|3XL|4XL|XS|XL|S|M|L|100|110|120|130|140|150)(?![\w@]).*$"
    match = re.search(size_pattern, text_upper)

    if match:
        hinh_in_raw = match.group(1)
        size_raw = match.group(2)
    else:
        hinh_in_raw = text_upper
        size_raw = "Freesize"

    hinh_in_clean = hinh_in_raw.strip(" ,.-")
    if not hinh_in_clean:
        hinh_in_clean = "TRON (KHONG HINH)"

    check_text = _normalize_rule_text(hinh_in_clean)
    ma_sp = "SU"
    folder_name = "SU"

    if re.search(r"^BOP(?:-|$)", check_text):
        ma_sp = "BOP"
        folder_name = "BoP Kids Tici"
    elif re.search(r"^BO(?:-|$)", check_text):
        ma_sp = "BO"
        folder_name = "Bo Kids Tici"
    elif re.search(r"^KT(?:-|$)", check_text):
        ma_sp = "KT"
        folder_name = "Ao Kids Tici"
    elif re.search(r"^KQ(?:-|$)", check_text):
        ma_sp = "KQ"
        folder_name = "Short Kids Tici"
    elif re.search(r"^KP(?:-|$)", check_text):
        ma_sp = "KP"
        folder_name = "Raglan Kids Tici"
    elif re.search(r"QDA1", check_text):
        ma_sp = "QDA1"
        folder_name = "SHORT A Ni"
    elif re.search(r"GK01|JEANKIEU01", check_text):
        ma_sp = "JEAN_GK"
        folder_name = "JEAN GK"
    elif re.search(r"RETRODAM|RETRONHAT|DENTUYEN|XANHNHAT|XANHDAM", check_text):
        ma_sp = "JEAN_THUONG"
        folder_name = "JEAN THUONG"
    elif re.search(r"BG01", check_text):
        ma_sp = "BG01"
        folder_name = "QN Baggy"
    elif re.search(r"QN02|QN03|QNTRON", check_text):
        ma_sp = "QN_ONG_RONG"
        folder_name = "QN Ong Rong"
    elif re.search(r"SWT|WS", check_text):
        ma_sp = "SWEATER"
        folder_name = "SWEATER"

    sort_name = f"{hinh_in_clean}-{size_raw}"

    return {
        "folder": folder_name,
        "sort_name": sort_name,
        "ma_sp": ma_sp,
        "size": size_raw,
        "hinh_in": hinh_in_clean,
    }
