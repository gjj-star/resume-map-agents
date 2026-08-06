@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if "%DEEPSEEK_API_KEY%"=="" (
  echo [warn] DEEPSEEK_API_KEY not set, using fallback in server/agents.js
)
node_modules\electron\dist\electron.exe . --no-sandbox --disable-gpu
