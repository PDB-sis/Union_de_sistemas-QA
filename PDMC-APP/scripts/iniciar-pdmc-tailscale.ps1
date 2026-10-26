param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$server = $null

function Invoke-Npm([string[]]$Arguments) {
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Fallo npm $($Arguments -join ' ')." }
}

function Get-TailscalePath {
    $command = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @(
        (Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Tailscale\tailscale.exe'),
        (Join-Path $env:LOCALAPPDATA 'Tailscale\tailscale.exe')
    )) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw 'Tailscale no esta instalado. Instala Tailscale e inicia sesion en esta PC.'
}

function Get-TailscaleStatus([string]$Executable) {
    $raw = & $Executable status --json
    if ($LASTEXITCODE -ne 0) { throw 'Tailscale no responde. Abre Tailscale e inicia sesion.' }
    return $raw | ConvertFrom-Json
}

function Get-ServeStatus([string]$Executable) {
    $raw = & $Executable serve status --json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar Tailscale Serve.' }
    if (!$raw) { return $null }
    return $raw | ConvertFrom-Json
}

function Get-LocalDatabaseMode {
    $configured = $env:DATABASE_URL
    if (!$configured) {
        $line = [regex]::Match((Get-Content -LiteralPath '.env.local' -Raw), '(?m)^DATABASE_URL\s*=\s*([^\r\n]+)')
        $configured = $line.Groups[1].Value.Trim().Trim('"', "'")
    }
    try { $database = [Uri]$configured } catch { throw 'DATABASE_URL no esta configurada correctamente en .env.local.' }
    if (!$database -or $database.Scheme -notin @('postgres','postgresql') -or !$database.Host) { throw 'DATABASE_URL no esta configurada correctamente en .env.local.' }
    if ($database.Host -in @('127.0.0.1','localhost') -and $database.Port -in @(55432,55434)) { return "local:$($database.Port)" }
    return 'external'
}

function Wait-Docker {
    $null = Get-Command docker.exe -ErrorAction Stop
    & docker.exe info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -eq 0) { return }
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (!(Test-Path -LiteralPath $desktop)) { throw 'Abre Docker Desktop y vuelve a iniciar PDMC.' }
    Start-Process -FilePath $desktop -WindowStyle Hidden
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 3
        & docker.exe info --format '{{.ServerVersion}}' *> $null
        if ($LASTEXITCODE -eq 0) { return }
    }
    throw 'Docker Desktop no respondio. Comprueba que PostgreSQL pueda iniciar.'
}

function Get-PdmcListener {
    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -in @('0.0.0.0','127.0.0.1','::','::1') } |
        Select-Object -First 1
    if (!$listener) { return $null }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (!$processInfo) { return $null }
    if ($processInfo.CommandLine -notmatch 'servidor-pdmc\.mjs') {
        throw 'El puerto 3000 esta ocupado por otro programa. Cierralo antes de iniciar PDMC.'
    }
    return $processInfo
}

try {
    $null = Get-Command node.exe -ErrorAction Stop
    $null = Get-Command npm.cmd -ErrorAction Stop
    $tailscale = Get-TailscalePath
    $service = Get-Service -Name Tailscale -ErrorAction Stop
    if ($service.Status -ne 'Running') {
        if ($CheckOnly) { throw 'El servicio Tailscale esta detenido; el inicio normal intentara activarlo.' }
        Start-Service -Name Tailscale
        $service.WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
    }
    $status = Get-TailscaleStatus $tailscale
    if ($status.BackendState -ne 'Running') {
        if ($CheckOnly) { throw "Tailscale esta en estado $($status.BackendState)." }
        & $tailscale up
        if ($LASTEXITCODE -ne 0) { throw 'Tailscale requiere iniciar sesion. Completa el acceso en su ventana y vuelve a intentar.' }
        $status = Get-TailscaleStatus $tailscale
        if ($status.BackendState -ne 'Running') { throw 'Tailscale aun no esta conectado.' }
    }
    $dns = [string]$status.Self.DNSName
    if (!$dns -or $dns -notmatch '^[a-z0-9.-]+\.$') { throw 'Tailscale no proporciono un nombre DNS valido.' }
    $publicOrigin = "https://$($dns.TrimEnd('.')):3000"
    $serve = Get-ServeStatus $tailscale
    $handler = $serve.Web."$($dns.TrimEnd('.')):3000".Handlers.'/'.Proxy
    $expected = 'https+insecure://127.0.0.1:3000'
    if ($handler -and $handler -ne $expected) { throw 'Tailscale Serve usa el puerto 3000 con otro destino. No se modifico esa configuracion.' }
    if (!$handler -and !$CheckOnly) {
        & $tailscale serve --bg --yes --https=3000 $expected
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo configurar Tailscale Serve en el puerto 3000.' }
        $serve = Get-ServeStatus $tailscale
        if ($serve.Web."$($dns.TrimEnd('.')):3000".Handlers.'/'.Proxy -ne $expected) { throw 'Tailscale Serve no confirmo el destino de PDMC.' }
    }

    if (!(Test-Path -LiteralPath '.env.local')) { throw 'Falta .env.local. Configura primero la base de datos y las credenciales propias.' }
    if (!(Test-Path -LiteralPath 'node_modules\next')) { throw 'Faltan dependencias. Ejecuta npm ci una vez.' }
    $databaseMode = Get-LocalDatabaseMode
    $existing = Get-PdmcListener
    if ($CheckOnly) {
        Write-Host "PDMC: comprobacion correcta. Tailscale: $publicOrigin" -ForegroundColor Green
        Write-Host "Base de datos: $databaseMode. Servidor PDMC existente: $([bool]$existing). Serve configurado: $([bool]$handler)."
        Write-Host 'El inicio normal compilara y arrancara PDMC. Esta comprobacion no cambio datos.'
        exit 0
    }

    if ($databaseMode -like 'local:*') {
        Wait-Docker
        $localPort = [int]($databaseMode.Split(':')[1])
        if ($localPort -eq 55434) {
            if (!(Test-Path -LiteralPath '.secrets\compose-desarrollo.yaml')) { throw 'Falta la configuración recuperable de la base de desarrollo.' }
            & docker.exe compose --project-name pdmc-desarrollo --file '.secrets\compose-desarrollo.yaml' up -d --wait --wait-timeout 90 postgres
        } else {
            & docker.exe compose up -d --wait --wait-timeout 90 postgres
        }
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL no esta listo.' }
    }
    Invoke-Npm @('run','db:migrate')
    Invoke-Npm @('run','db:check')

    # El build modifica .next. Solo detener el servidor propio justo antes de compilar.
    $current = Get-PdmcListener
    if ($current) {
        Write-Host 'Reiniciando la instancia anterior de PDMC...'
        try { Stop-Process -Id $current.ProcessId -ErrorAction Stop }
        catch {
            # Otro iniciador puede cerrar PDMC entre detectar el puerto y detenerlo.
            if (Get-Process -Id $current.ProcessId -ErrorAction SilentlyContinue) { throw }
        }
        for ($i=0; $i -lt 20 -and (Get-PdmcListener); $i++) { Start-Sleep -Milliseconds 500 }
        if (Get-PdmcListener) { throw 'La instancia anterior de PDMC no libero el puerto 3000.' }
    }
    Write-Host 'Compilando la version actualizada...'
    Invoke-Npm @('run','build')

    # El enlace publico de Tailscale es el origen principal para las operaciones autenticadas.
    # El enlace LAN configurado sigue autorizado como origen adicional.
    $environmentText = Get-Content -LiteralPath '.env.local' -Raw
    $lanOrigin = [regex]::Match($environmentText, '(?m)^PDMC_AUTH_ORIGIN=(https://[^\r\n]+)\s*$').Groups[1].Value.Trim()
    $configuredAdditional = [regex]::Match($environmentText, '(?m)^PDMC_AUTH_ADDITIONAL_ORIGINS=([^\r\n]*)$').Groups[1].Value.Trim()
    $otherOrigins = @($lanOrigin) + @($configuredAdditional.Split(',')) |
        ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne $publicOrigin } | Select-Object -Unique
    $env:PORT = '3000'
    $env:PDMC_AUTH_ORIGIN = $publicOrigin
    $env:PDMC_AUTH_ADDITIONAL_ORIGINS = $otherOrigins -join ','
    $logDir = Join-Path $root 'logs'
    $null = New-Item -ItemType Directory -Path $logDir -Force
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outputLog = Join-Path $logDir "pdmc-tailscale-$stamp.log"
    $errorLog = Join-Path $logDir "pdmc-tailscale-$stamp-error.log"
    $server = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'scripts/servidor-pdmc.mjs' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
    $ready = $false
    for ($i=0; $i -lt 40; $i++) {
        if ($server.HasExited) { break }
        try {
            $response = Invoke-WebRequest -Uri "$publicOrigin/login" -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw "PDMC no respondio por Tailscale. Revisa $outputLog y $errorLog" }
    Write-Host "`nPDMC listo: $publicOrigin" -ForegroundColor Green
    try { Set-Clipboard -Value $publicOrigin; Write-Host 'Enlace copiado al portapapeles.' } catch { }
    Write-Host 'Deja esta ventana abierta para mantener PDMC. Ctrl+C la cierra.'
    while (!$server.HasExited) { Start-Sleep -Seconds 2 }
    throw "PDMC termino inesperadamente. Revisa $errorLog"
} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($server -and !$server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
}
