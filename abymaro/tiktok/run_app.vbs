Set WinScriptHost = CreateObject("WScript.Shell")
WinScriptHost.Run "cmd.exe /c streamlit run ""C:\Users\MainPC 2\Documents\abymaro\tiktok\app.py""", 0
Set WinScriptHost = Nothing