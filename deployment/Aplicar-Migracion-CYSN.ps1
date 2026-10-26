<#
Aplica una migración de CYSN QA (CYSN_QA\backend\migrations) a una base
unificada que ya existe, adaptándola de public. al esquema cysn_qa igual que
Crear-Base-Unificada.ps1.

Ejemplo:
  .\deployment\Aplicar-Migracion-CYSN.ps1 -Migracion 003_agentes_tienda_up.sql -PgBin 'C:\Program Files\PostgreSQL\18\bin'

Con -GenerarSolo escribe el SQL adaptado en -Salida y no se conecta a PostgreSQL.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Migracion,
    [string]$PgBin = '',
    [string]$PgHost = 'localhost',
    [int]$PgPort = 5432,
    [string]$AdminUser = 'postgres',
    [string]$TargetDatabase = 'sistemas_unificados',
    [string]$Schema = 'cysn_qa',
    [switch]$GenerarSolo,
    [string]$Salida = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Migracion -notmatch '^\d{3}_[a-z0-9_]+_(up|down)\.sql$') {
    throw "Nombre de migración inválido: $Migracion (ejemplo: 003_agentes_tienda_up.sql)."
}
if ($Schema -notmatch '^[a-z_][a-z0-9_]*$') { throw "Esquema inválido: $Schema" }

$source = Join-Path $PSScriptRoot "..\CYSN_QA\backend\migrations\$Migracion"
if (-not (Test-Path -LiteralPath $source)) { throw "Falta la migración $source" }

# Misma adaptación que Crear-Base-Unificada.ps1.
$sql = [System.IO.File]::ReadAllText($source)
$sql = [regex]::Replace($sql, '(?m)^\\(?:un)?restrict.*\r?\n', '')
$sql = $sql -replace '\bpublic\.', "$Schema."
$sql = "SET search_path TO $Schema, public;`r`n" + $sql

if ($GenerarSolo) {
    if (-not $Salida) { throw "Indique -Salida con -GenerarSolo." }
    [System.IO.File]::WriteAllText($Salida, $sql, [System.Text.UTF8Encoding]::new($false))
    Write-Host "SQL adaptado escrito en $Salida" -ForegroundColor Green
    return
}

function Resolve-PgTool([string]$Name) {
    if ($PgBin) {
        $candidate = Join-Path $PgBin "$Name.exe"
        if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
    }
    $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw "No se encontró $Name.exe. Instale PostgreSQL client tools o use -PgBin 'C:\Program Files\PostgreSQL\18\bin'."
}
$psql = Resolve-PgTool 'psql'

$previousPassword = $env:PGPASSWORD
$bstr = [IntPtr]::Zero
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("nexoqa-" + [guid]::NewGuid() + ".sql")
try {
    if (-not $env:PGPASSWORD) {
        $secure = Read-Host "Contraseña del usuario PostgreSQL $AdminUser" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    [System.IO.File]::WriteAllText($temporary, $sql, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Aplicando $Migracion en $TargetDatabase (esquema $Schema)"
    & $psql -X -w -h $PgHost -p $PgPort -U $AdminUser -d $TargetDatabase -v ON_ERROR_STOP=1 -f $temporary
    if ($LASTEXITCODE -ne 0) { throw "Falló $Migracion. La migración corre en una transacción: no se aplicó nada." }
    Write-Host "Correcto: $Migracion aplicada." -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    $env:PGPASSWORD = $previousPassword
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
