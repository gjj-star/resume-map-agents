@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if "%DEEPSEEK_API_KEY%"=="" (
  echo [info] DEEPSEEK_API_KEY 未设置：开发模式可用 .env，应用内可在"专家介绍 - API 设置"配置
)
node_modules\electron\dist\electron.exe . --no-sandbox --disable-gpu
