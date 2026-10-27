@echo off
chcp 65001 >nul
title 学习打卡服务（关闭窗口即停止）
cd /d "%~dp0server"

set NODE_EXE=C:\Users\GAOJINTIAN\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node

"%NODE_EXE%" server.mjs
echo.
echo 服务已停止，按任意键关闭...
pause >nul