<#
Prepara y levanta el backend CYSN QA en 127.0.0.1:5082.
Caddy es quien lo publica por HTTPS; este script no abre puertos públicos.
#>
[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\Users\Administrator\Documents\servicios IAN\ServicioQA\CYSN_QA',
    [int]$Port = 5082,
    [switch]$SincronizarCreacion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$backend = Join-Path $ProjectRoot 'backend'
$python = Join-Path $backend '.venv\Scripts\python.exe'
$envFile = Join-Path $backend '.env'
$requirements = Join-Path $PSScriptRoot 'requirements-qa-production.txt'
$logs = Join-Path $backend 'logs'

foreach ($path in @($backend, $envFile, $requirements)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Falta el archivo o carpeta requerida: $path" }
}
if (-not (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    throw 'Python 3.11+ no está disponible en PATH.'
}

New-Item -ItemType Directory -Path $logs -Force | Out-Null
if (-not (Test-Path -LiteralPath $python)) {
    Write-Host 'Creando entorno virtual Python...'
    & python.exe -m venv (Join-Path $backend '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno virtual.' }
}

Write-Host 'Instalando dependencias del backend QA...'
& $python -m pip install --upgrade pip
& $python -m pip install -r $requirements
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }

$ocupado = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($ocupado) {
    throw "El puerto $Port ya está ocupado por PID $($ocupado[0].OwningProcess). No se inició otra instancia."
}

$apiOut = Join-Path $logs 'qa-api.out.log'
$apiErr = Join-Path $logs 'qa-api.err.log'
$procesoApi = Start-Process -FilePath $python -WorkingDirectory $backend -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port',"$Port" -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
Start-Sleep -Seconds 3

try {
    $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
    if ($health.status -ne 'ok') { throw 'La API no reportó estado ok.' }
    Write-Host "Backend QA iniciado. PID=$($procesoApi.Id) Puerto=127.0.0.1:$Port" -ForegroundColor Green
    $health | ConvertTo-Json -Compress
}
catch {
    if (-not $procesoApi.HasExited) { Stop-Process -Id $procesoApi.Id -Force }
    throw "El backend QA no inició correctamente. Revise $apiErr. Detalle: $($_.Exception.Message)"
}

if ($SincronizarCreacion) {
    $syncOut = Join-Path $logs 'creacion-sync.out.log'
    $syncErr = Join-Path $logs 'creacion-sync.err.log'
    $procesoSync = Start-Process -FilePath $python -WorkingDirectory $backend -ArgumentList '-m','app.sync.creacion','--loop','--intervalo','60' -RedirectStandardOutput $syncOut -RedirectStandardError $syncErr -PassThru
    Write-Host "Worker CREACION iniciado. PID=$($procesoSync.Id)" -ForegroundColor Green
}