@echo off
chcp 65001 >nul
title Физика сабағы — сервер
cd /d "%~dp0"

rem "where" жеткіліксіз: Windows-та Python-ның бос сілтемесі болуы мүмкін, сондықтан іске қосып тексереміз
python --version >nul 2>nul
if not errorlevel 1 goto withpython
py --version >nul 2>nul
if not errorlevel 1 goto withpy

echo.
echo   Python табылмады. python.org сайтынан орнатыңыз
echo   (орнатқанда "Add python.exe to PATH" белгісін қойыңыз).
echo.
pause
exit /b

:withpython
python server.py %*
pause
exit /b

:withpy
py server.py %*
pause
