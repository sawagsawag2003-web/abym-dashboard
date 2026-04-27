Set WinScriptHost = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WinScriptHost.Run "cmd.exe /c streamlit run """ & scriptDir & "\app.py""", 0
Set WinScriptHost = Nothing
