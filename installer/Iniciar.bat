@echo off
rem Inicia o Poder em Xeque e abre o navegador. Para encerrar, feche esta janela ou use "Parar o Poder em Xeque".
setlocal
cd /d "%~dp0"
set "CONGRESSO_DB=%~dp0data\congresso.db"
set "PORT=3200"
set "HOSTNAME=127.0.0.1"
set "NODE_ENV=production"
title Poder em Xeque (http://127.0.0.1:3200)
echo.
echo  Poder em Xeque iniciando em http://127.0.0.1:3200
echo  Deixe esta janela aberta enquanto usa o site. Feche-a para encerrar.
echo.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:3200"
"%~dp0node.exe" server.js
pause
