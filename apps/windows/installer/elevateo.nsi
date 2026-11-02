; Elevateo Mail Windows installer.
; AIDEV-NOTE: per-user install (no admin): writes under $LOCALAPPDATA and HKCU only.
; VERSION, PUBLISH_DIR and OUTFILE are passed by build/build-installer.sh from the single VERSION file.

!ifndef VERSION
  !error "Pass -DVERSION=x.y.z"
!endif
!ifndef PUBLISH_DIR
  !error "Pass -DPUBLISH_DIR=path to the dotnet publish output"
!endif
!ifndef OUTFILE
  !error "Pass -DOUTFILE=installer output path"
!endif

!ifndef UNINSTALL_MANIFEST
  !error "Pass -DUNINSTALL_MANIFEST=generated uninstall file list"
!endif

Unicode true
Name "Elevateo Mail ${VERSION}"
OutFile "${OUTFILE}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\ElevateoMail"
SetCompressor /SOLID lzma

!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ElevateoMail"

Section "Elevateo Mail"
  SetOutPath "$INSTDIR"
  ; Forward slash: source paths are resolved on the Linux build host by makensis.
  File /r "${PUBLISH_DIR}/*"

  CreateDirectory "$SMPROGRAMS\Elevateo Mail"
  CreateShortcut "$SMPROGRAMS\Elevateo Mail\Elevateo Mail.lnk" "$INSTDIR\Elevateo.Windows.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Elevateo Mail"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Elevateo"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Elevateo Mail\Elevateo Mail.lnk"
  RMDir "$SMPROGRAMS\Elevateo Mail"
  ; Remove only files the installer placed; Credential Manager entries are the app's sign-out job.
  ; AIDEV-NOTE: the build embeds exact installed paths; nonempty directories and unrelated files survive.
  !include "${UNINSTALL_MANIFEST}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
SectionEnd
