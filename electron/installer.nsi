Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

!define PRODUCT_NAME "Dynamic Island"
!define PRODUCT_VERSION "1.1.0"
!define PRODUCT_REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define RUN_REG "Software\Microsoft\Windows\CurrentVersion\Run"

Name "${PRODUCT_NAME}"
OutFile "../release/Dynamic-Island-Setup.exe"
InstallDir "$LOCALAPPDATA\${PRODUCT_NAME}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "${PRODUCT_NAME}"

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

; The island stays running in the tray, and Windows will not replace a running exe.
!macro KillIsland
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${PRODUCT_NAME}.exe"'
  Pop $0
  Sleep 800
!macroend

Function CloseIsland
  !insertmacro KillIsland
  Sleep 400
  IfFileExists "$INSTDIR\${PRODUCT_NAME}.exe" 0 done
  ClearErrors
  Delete "$INSTDIR\${PRODUCT_NAME}.exe"
  IfErrors 0 done
  Sleep 1500
  !insertmacro KillIsland
  done:
FunctionEnd

Function RunUninstaller
  IfFileExists "$INSTDIR\Uninstall.exe" 0 missing
  ExecWait '"$INSTDIR\Uninstall.exe"'
  Return
  missing:
    MessageBox MB_OK|MB_ICONINFORMATION "이 PC에는 ${PRODUCT_NAME}가 설치되어 있지 않습니다."
FunctionEnd

Function .onInit
  ReadRegStr $0 HKCU "${PRODUCT_REG}" "InstallLocation"
  ${If} $0 != ""
    StrCpy $INSTDIR "$0"
  ${EndIf}

  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/uninstall" $R1
  ${IfNot} ${Errors}
    Call RunUninstaller
    Quit
  ${EndIf}

  IfFileExists "$INSTDIR\Uninstall.exe" ask done
  ask:
    MessageBox MB_YESNO|MB_ICONQUESTION "Dynamic Island가 이미 설치되어 있습니다.$\n$\n예: 이 PC에서 제거합니다.$\n아니오: 그대로 다시 설치합니다." IDYES remove IDNO done
  remove:
    Call RunUninstaller
    Quit
  done:
FunctionEnd

Section "Install"
  Call CloseIsland
  SetOutPath "$INSTDIR"
  File /r "../release/win-unpacked/"
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\제거.lnk" "$INSTDIR\Uninstall.exe"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall Dynamic Island.lnk"

  WriteRegStr HKCU "${PRODUCT_REG}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${PRODUCT_REG}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKCU "${PRODUCT_REG}" "Publisher" "${PRODUCT_NAME}"
  WriteRegStr HKCU "${PRODUCT_REG}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${PRODUCT_REG}" "DisplayIcon" "$INSTDIR\${PRODUCT_NAME}.exe"
  WriteRegStr HKCU "${PRODUCT_REG}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${PRODUCT_REG}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${PRODUCT_REG}" "NoModify" 1
  WriteRegDWORD HKCU "${PRODUCT_REG}" "NoRepair" 1
  WriteRegDWORD HKCU "${PRODUCT_REG}" "EstimatedSize" 287712

  Exec '"$INSTDIR\${PRODUCT_NAME}.exe"'
SectionEnd

Section "Uninstall"
  !insertmacro KillIsland
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\제거.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall Dynamic Island.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$SMSTARTUP\${PRODUCT_NAME}.lnk"
  Delete "$SMSTARTUP\dynamic-island.lnk"
  DeleteRegValue HKCU "${RUN_REG}" "dynamic-island"
  DeleteRegValue HKCU "${RUN_REG}" "${PRODUCT_NAME}"
  DeleteRegKey HKCU "${PRODUCT_REG}"
  RMDir /r "$INSTDIR"
SectionEnd
