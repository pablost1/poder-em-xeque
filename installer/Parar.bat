@echo off
rem Encerra o servidor do Poder em Xeque que estiver rodando na porta 3200.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3200" ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo Poder em Xeque encerrado.
timeout /t 2 /nobreak >nul
