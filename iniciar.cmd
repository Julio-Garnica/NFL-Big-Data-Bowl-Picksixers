@echo off
rem Inicia la app completa en http://localhost:8000 (API + dashboard). No requiere Node en el PATH.
setlocal
cd /d "%~dp0"
set "PATH=%~dp0.hackathon\.tools\node;%PATH%"
if not exist "dashboard\dist\index.html" (
  echo Compilando el dashboard...
  pushd dashboard
  call npm run build
  popd
)
echo Abre http://localhost:8000 en el navegador. Ctrl+C para detener.
"%~dp0.venv\Scripts\python.exe" -m uvicorn backend.main:app --port 8000
