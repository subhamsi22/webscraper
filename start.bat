@echo off
title Google CRM Finder - Web Edition
echo ========================================================
echo   Starting Google Business CRM Finder Web Application...
echo ========================================================
cd /d "%~dp0"
start "" http://localhost:3000
node server.js
pause
