@echo off
setlocal
cd /d "%~dp0"
title Cantinho do Petisco - Servidor local

where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py"
) else (
  where python >nul 2>nul
  if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Python nao foi encontrado no computador.
    echo Instale o Python e marque a opcao "Add Python to PATH".
    echo.
    pause
    exit /b 1
  )
  set "PY=python"
)

for /f %%P in ('powershell -NoProfile -Command "$l=[System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$l.Start();$p=$l.LocalEndpoint.Port;$l.Stop();$p"') do set "PORT=%%P"

if not defined PORT set "PORT=8765"

echo ============================================================
echo         CANTINHO DO PETISCO - SERVIDOR LOCAL
echo ============================================================
echo.
echo Pasta: %CD%
echo Endereco: http://127.0.0.1:%PORT%/
echo.

start "Cantinho do Petisco - servidor" /min cmd /c "%PY% -m http.server %PORT% --bind 127.0.0.1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

echo Site aberto no navegador.
echo Esta janela pode ser fechada; o servidor abriu em outra janela minimizada.
echo.
pause
