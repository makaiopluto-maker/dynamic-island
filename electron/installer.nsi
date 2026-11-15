Unicode true
Name "Dynamic Island"
OutFile "../release/Dynamic-Island-Setup.exe"
InstallDir "$LOCALAPPDATA\Dynamic Island"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "../release/win-unpacked/"
  CreateShortcut "$DESKTOP\Dynamic Island.lnk" "$INSTDIR\Dynamic Island.exe"
  CreateDirectory "$SMPROGRAMS\Dynamic Island"
  CreateShortcut "$SMPROGRAMS\Dynamic Island\Dynamic Island.lnk" "$INSTDIR\Dynamic Island.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Dynamic Island\Uninstall Dynamic Island.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Dynamic Island.lnk"
  Delete "$SMPROGRAMS\Dynamic Island\Dynamic Island.lnk"
  Delete "$SMPROGRAMS\Dynamic Island\Uninstall Dynamic Island.lnk"
  RMDir "$SMPROGRAMS\Dynamic Island"
  RMDir /r "$INSTDIR"
SectionEnd
