Unicode true
Name "Dynamic Island"
OutFile "../release/Dynamic-Island-Setup.exe"
InstallDir "$LOCALAPPDATA\Dynamic Island"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64

Page directory
Page instfiles

; The island stays running in the tray, and Windows will not replace a running exe.
Function CloseIsland
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "Dynamic Island.exe"'
  Pop $0
  Sleep 1200
  IfFileExists "$INSTDIR\Dynamic Island.exe" 0 done
  ClearErrors
  Delete "$INSTDIR\Dynamic Island.exe"
  IfErrors 0 done
  Sleep 1500
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "Dynamic Island.exe"'
  Pop $0
  Sleep 800
  done:
FunctionEnd

Section "Install"
  Call CloseIsland
  SetOutPath "$INSTDIR"
  File /r "../release/win-unpacked/"
  CreateShortcut "$DESKTOP\Dynamic Island.lnk" "$INSTDIR\Dynamic Island.exe"
  CreateDirectory "$SMPROGRAMS\Dynamic Island"
  CreateShortcut "$SMPROGRAMS\Dynamic Island\Dynamic Island.lnk" "$INSTDIR\Dynamic Island.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Dynamic Island\Uninstall Dynamic Island.lnk" "$INSTDIR\Uninstall.exe"
  Exec '"$INSTDIR\Dynamic Island.exe"'
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "Dynamic Island.exe"'
  Pop $0
  Sleep 800
  Delete "$DESKTOP\Dynamic Island.lnk"
  Delete "$SMPROGRAMS\Dynamic Island\Dynamic Island.lnk"
  Delete "$SMPROGRAMS\Dynamic Island\Uninstall Dynamic Island.lnk"
  RMDir "$SMPROGRAMS\Dynamic Island"
  RMDir /r "$INSTDIR"
SectionEnd
