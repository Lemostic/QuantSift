@echo off
setlocal
title QuantSift Windows Builder

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1"
set "BUILD_EXIT=%ERRORLEVEL%"

if not "%BUILD_EXIT%"=="0" (
  echo.
  echo QuantSift build failed with exit code %BUILD_EXIT%.
  pause
)

exit /b %BUILD_EXIT%

