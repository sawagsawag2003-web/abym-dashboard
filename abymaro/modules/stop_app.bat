@off
taskkill /f /im python.exe /fi "COMMANDLINE eq *streamlit*"
taskkill /f /im streamlit.exe
pause