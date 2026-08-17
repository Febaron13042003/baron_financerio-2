@echo off
setlocal EnableExtensions

REM ============================================================
REM  Baron Financeiro - Launcher para Windows
REM ============================================================

set "APP_DIR=%~dp0"
set "INDEX=%APP_DIR%index.html"
set "PROFILE=%LOCALAPPDATA%\BaronFinanceiro\profile"

if not exist "%INDEX%" (
  echo ERRO: index.html nao encontrado em "%APP_DIR%"
  pause
  exit /b 1
)

if not exist "%LOCALAPPDATA%\BaronFinanceiro" mkdir "%LOCALAPPDATA%\BaronFinanceiro" >nul 2>&1
if not exist "%PROFILE%" mkdir "%PROFILE%" >nul 2>&1
if not exist "%PROFILE%\Default" mkdir "%PROFILE%\Default" >nul 2>&1
if not exist "%PROFILE%\First Run" type nul > "%PROFILE%\First Run"

if exist "%APP_DIR%.browser-profile" rmdir /s /q "%APP_DIR%.browser-profile" >nul 2>&1

REM Caminho como file:/// — substitui barra invertida por barra
set "URL=file:///%INDEX:\=/%"

REM Localiza Edge ou Chrome
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo Edge/Chrome nao encontrados. Abrindo no navegador padrao...
  start "" "%URL%"
  goto :eof
)

REM Aspas em torno de %URL% e %PROFILE% sao essenciais para preservar espacos do caminho
start "" "%BROWSER%" --app="%URL%" --user-data-dir="%PROFILE%" --window-size=1280,820 --no-first-run --no-default-browser-check --disable-default-apps --disable-sync --disable-background-networking --disable-component-update --disable-features=Translate,InterestFeedContentSuggestions,ChromeWhatsNewUI,msEdgeSplashScreen,msImplicitSignin,msWelcomeTour,msShowFeatureTour --disable-notifications --no-pings

endlocal
