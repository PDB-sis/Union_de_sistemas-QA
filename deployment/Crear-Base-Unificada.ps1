<#
Crea la base PostgreSQL unificada VACÍA para PDMC y CYSN QA.
Antes de cualquier reemplazo, genera respaldos custom de las bases existentes.
No copia datos de negocio: estos llegarán mediante los sincronizadores.
#>
[CmdletBinding()]
param(
    [string]$PgBin = '',
    [string]$PgHost = 'localhost',
    [int]$PgPort = 5432,
    [string]$AdminUser = 'postgres',
    [string]$PdmcSourceDatabase = 'pdmc',
    [string]$CysnSourceDatabase = 'cysn_qa',
    [string]$TargetDatabase = 'sistemas_unificados',
    [string]$BackupDirectory = "$PSScriptRoot\..\backups\servidor",
    [string]$StructureDirectory = "$PSScriptRoot\..\backups\unificada",
    [switch]$RecrearDestino
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
$pgDump = Resolve-PgTool 'pg_dump'
$createdb = Resolve-PgTool 'createdb'
$dropdb = Resolve-PgTool 'dropdb'

$required = @(
    '00_crear_esquemas.sql', '01_pdmc_estructura.sql',
    '02_cysn_qa_estructura.sql', '03_verificar_estructura.sql'
)
foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $StructureDirectory $file))) {
        throw "No existe la estructura requerida: $file en $StructureDirectory"
    }
}

$secure = Read-Host "Contraseña del usuario PostgreSQL $AdminUser" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

    function Test-Database([string]$Database) {
        & $psql -X -w -h $PgHost -p $PgPort -U $AdminUser -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$($Database.Replace("'", "''"))'" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "No se pudo consultar PostgreSQL." }
        return ((& $psql -X -w -h $PgHost -p $PgPort -U $AdminUser -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$($Database.Replace("'", "''"))'").Trim() -eq '1')
    }

    function Backup-Database([string]$Database) {
        $file = Join-Path $BackupDirectory ("{0}_{1}.dump" -f $Database, $stamp)
        Write-Host "Respaldando $Database en $file"
        & $pgDump -w -h $PgHost -p $PgPort -U $AdminUser -Fc --no-owner --no-acl -f $file $Database
        if ($LASTEXITCODE -ne 0) { throw "Falló el respaldo de $Database." }
        return $file
    }

    foreach ($database in @($PdmcSourceDatabase, $CysnSourceDatabase)) {
        if (Test-Database $database) { [void](Backup-Database $database) }
        else { Write-Host "No existe $database; no hay respaldo que generar." -ForegroundColor Yellow }
    }

    $targetExists = Test-Database $TargetDatabase
    if ($targetExists) {
        [void](Backup-Database $TargetDatabase)
        if (-not $RecrearDestino) {
            throw "La base destino $TargetDatabase ya existe. Se respaldó y no fue modificada. Para reemplazarla explícitamente ejecute otra vez con -RecrearDestino."
        }
        Write-Host "Eliminando destino existente después de respaldo: $TargetDatabase" -ForegroundColor Yellow
        & $dropdb -w -h $PgHost -p $PgPort -U $AdminUser $TargetDatabase
        if ($LASTEXITCODE -ne 0) { throw "No se pudo eliminar $TargetDatabase." }
    }

    Write-Host "Creando base vacía $TargetDatabase"
    & $createdb -w -h $PgHost -p $PgPort -U $AdminUser -T template0 -E UTF8 $TargetDatabase
    if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $TargetDatabase." }

    function Invoke-SqlFile([string]$File) {
        Write-Host "Aplicando $(Split-Path $File -Leaf)"
        & $psql -X -w -h $PgHost -p $PgPort -U $AdminUser -d $TargetDatabase -v ON_ERROR_STOP=1 -f $File
        if ($LASTEXITCODE -ne 0) { throw "Falló $(Split-Path $File -Leaf). La base nueva se conserva para diagnóstico." }
    }

    Invoke-SqlFile (Join-Path $StructureDirectory '00_crear_esquemas.sql')
    Invoke-SqlFile (Join-Path $StructureDirectory '01_pdmc_estructura.sql')
    Invoke-SqlFile (Join-Path $StructureDirectory '02_cysn_qa_estructura.sql')

    # Las migraciones fueron escritas para public; se adaptan temporalmente al esquema CYSN QA.
    $temporaryMigrationDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("nexoqamigrations-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $temporaryMigrationDirectory -Force | Out-Null
    try {
        foreach ($name in @('001_creacion_sync_up.sql', '002_creacion_corte_up.sql', '003_agentes_tienda_up.sql', '004_sitios_dim_tienda_up.sql', '005_agente_por_sitio_up.sql', '006_agente_filas_up.sql', '007_agente_creacion_up.sql')) {
            $source = Join-Path $PSScriptRoot "..\CYSN_QA\backend\migrations\$name"
            if (-not (Test-Path -LiteralPath $source)) { throw "Falta la migración $source" }
            $sql = [System.IO.File]::ReadAllText($source)
            $sql = [regex]::Replace($sql, '(?m)^\\(?:un)?restrict.*\r?\n', '')
            $sql = $sql -replace '\bpublic\.', 'cysn_qa.'
            $sql = "SET search_path TO cysn_qa, public;`r`n" + $sql
            $target = Join-Path $temporaryMigrationDirectory $name
            [System.IO.File]::WriteAllText($target, $sql, [System.Text.UTF8Encoding]::new($false))
            Invoke-SqlFile $target
        }
    }
    finally {
        if (Test-Path -LiteralPath $temporaryMigrationDirectory) { Remove-Item -LiteralPath $temporaryMigrationDirectory -Recurse -Force }
    }

    Invoke-SqlFile (Join-Path $StructureDirectory '03_verificar_estructura.sql')
    Write-Host "Correcto: $TargetDatabase fue creada vacía con esquemas pdmc y cysn_qa." -ForegroundColor Green
    Write-Host "Respaldos generados en: $BackupDirectory" -ForegroundColor Green
}
finally {
    $env:PGPASSWORD = $previousPassword
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}