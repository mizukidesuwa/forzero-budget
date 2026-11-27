@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "NODE_EXE="
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%I"
  )
)

if not defined NODE_EXE (
  echo 未检测到 Node.js（需要 22 或更新版本），当前无法本机自动建房。
  echo 推荐直接下载免安装完整版 forzero-budget-windows-x64-*.zip（已内置 runtime\node.exe），
  echo 或安装 Node.js 22+ / 将便携版 node.exe 放到 runtime\node.exe。
  echo 正在直接打开单机/加房网页（可在设置导出存档或填入好友 IP 加入房间）…
  start "" "%~dp0index.html"
  timeout /t 8 >nul
  exit /b 0
)

set "LITCHI_SERVER=%~dp0server.mjs"
set "LITCHI_DIR=%~dp0"
powershell -NoProfile -WindowStyle Hidden -Command "$gameEntry = [string][char]34 + $env:LITCHI_SERVER + [char]34; Start-Process -FilePath $env:NODE_EXE -ArgumentList @($gameEntry, '--app', '--open') -WorkingDirectory $env:LITCHI_DIR -WindowStyle Hidden"
endlocal
