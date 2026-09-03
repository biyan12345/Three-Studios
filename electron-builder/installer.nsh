!macro killRunningStreamplayStudio
  ClearErrors
  ExecWait '"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
!macroend

!ifndef BUILD_UNINSTALLER
Var legacyInstallDir
Var legacyUninstallString
Var legacyUninstallerPath
!endif

!macro recoverBrokenUninstaller ROOT_KEY
  IfErrors 0 +3
    DetailPrint "Old uninstaller could not be launched. Attempting manual cleanup."
    Goto manual_cleanup_${ROOT_KEY}

  ${if} $R0 != 0
    DetailPrint "Old uninstaller failed. Attempting manual cleanup."
    Goto manual_cleanup_${ROOT_KEY}
  ${endif}

  Return

  manual_cleanup_${ROOT_KEY}:
    ClearErrors
    !insertmacro killRunningStreamplayStudio
    StrCpy $legacyInstallDir ""
    StrCpy $legacyUninstallString ""
    StrCpy $legacyUninstallerPath ""
    ReadRegStr $legacyInstallDir ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ReadRegStr $legacyUninstallString ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      StrCmp "$legacyUninstallString" "" 0 +2
      ReadRegStr $legacyUninstallString ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY_2}" "UninstallString"
    !endif
    StrCmp "$legacyUninstallString" "" +5 0
      !insertmacro GetInQuotes $legacyUninstallerPath "$legacyUninstallString"
      StrCmp "$legacyInstallDir" "" 0 +3
      Push "$legacyUninstallerPath"
      Call GetFileParent
      Pop $legacyInstallDir
    Delete "$oldDesktopLink"
    Delete "$oldStartMenuLink"
    StrCmp "$oldMenuDirectory" "" +2 0
      RMDir "$SMPROGRAMS\$oldMenuDirectory"
    StrCmp "$legacyInstallDir" "" +2 0
      RMDir /r "$legacyInstallDir"
    DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey ${ROOT_KEY} "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    DeleteRegKey ${ROOT_KEY} "${INSTALL_REGISTRY_KEY}"
    ClearErrors
    StrCpy $R0 0
!macroend

!macro customInit
  !insertmacro killRunningStreamplayStudio
!macroend

!macro customUnInit
  !insertmacro killRunningStreamplayStudio
!macroend

!macro customUnInstallCheck
  !insertmacro recoverBrokenUninstaller SHELL_CONTEXT
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro recoverBrokenUninstaller HKEY_CURRENT_USER
!macroend
