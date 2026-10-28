param(
    [switch]$CheckOnly,
    [switch]$ConfigureFirewall,
    [ValidateRange(3000, 3010)][int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$serverProcess = $null
$syncProcess = $null

function Get-LanAddresses {
    $adapters = @(Get-NetAdapter -Physical | Where-Object Status -eq 'Up')
    foreach ($adapter in $adapters) {
        Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' }
    }
}

function Invoke-Npm {
    param([string[]]$NpmArguments)
    & npm.cmd @NpmArguments
    if ($LASTEXITCODE -ne 0) { throw "Fallo npm $($NpmArguments -join ' '). No se iniciara una aplicacion incompleta." }
}

function Test-DockerReady {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & docker.exe info --format '{{.ServerVersion}}' *> $null
        return $LASTEXITCODE -eq 0
    } finally { $ErrorActionPreference = $previousPreference }
}

try {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $null = Get-Command npm.cmd -ErrorAction Stop
    $addresses = @(Get-LanAddresses)
    if (!$addresses.Count) { throw 'No hay una conexion Wi-Fi o Ethernet con IPv4. Conecta esta PC a la red local.' }

    if ($ConfigureFirewall) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'La regla del firewall necesita permisos de administrador.' }
        $ruleName = "PDMC-LAN-TCP-$Port"
        $interfaces = @($addresses | Select-Object -ExpandProperty InterfaceAlias -Unique)
        $existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
        if ($existingRule) {
            $existingRule | Set-NetFirewallRule -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -InterfaceAlias $interfaces -Program $nodePath | Out-Null
        } else {
            New-NetFirewallRule -Name $ruleName -DisplayName "PDMC - Red local TCP $Port" -Enabled True -Direction Inbound -Action Allow -Profile Any -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -InterfaceAlias $interfaces -Program $nodePath | Out-Null
        }
        exit 0
    }

    Write-Host "`nPDMC - Inicio para la red local" -ForegroundColor Cyan
    Write-Host 'Redes fisicas detectadas:'
    $addresses | ForEach-Object { Write-Host "  $($_.InterfaceAlias): $($_.IPAddress)" }
    if ($CheckOnly) {
        Write-Host "Node: $(& node.exe --version)"
        Write-Host "Build disponible: $(Test-Path -LiteralPath (Join-Path $projectRoot '.next\BUILD_ID'))"
        Write-Host 'Diagnostico completado sin cambiar firewall, archivos ni servicios.'
        exit 0
    }

    if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\next\dist\bin\next'))) {
        Write-Host 'Instalando las dependencias del proyecto...'
        Invoke-Npm -NpmArguments @('ci')
    }

    # Never print the connection URL or password. Respect an external database.
    $dbMode = 'const env=require("@next/env");env.loadEnvConfig(process.cwd());try {const u=new URL(process.env.DATABASE_URL);console.log(["127.0.0.1","localhost"].includes(u.hostname)&&u.port==="55432"?"local":"external")}catch{console.log("missing")}' | & node.exe
    if ($LASTEXITCODE -ne 0 -or $dbMode -notin @('local', 'external')) {
        throw 'DATABASE_URL no esta configurada correctamente. Conserve .env.local y la carpeta .secrets del proyecto.'
    }
    if ($dbMode -eq 'local') {
        $null = Get-Command docker.exe -ErrorAction Stop
        Write-Host 'Comprobando Docker y PostgreSQL...'
        if (!(Test-DockerReady)) {
            $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
            if (!(Test-Path -LiteralPath $desktop)) { throw 'Abre Docker Desktop y vuelve a ejecutar este archivo.' }
            Start-Process -FilePath $desktop -WindowStyle Hidden
            $dockerReady = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                Start-Sleep -Seconds 3
                if (Test-DockerReady) { $dockerReady = $true; break }
                if ($attempt % 5 -eq 0) { Write-Host 'Esperando a Docker Desktop...' }
            }
            if (!$dockerReady) { throw 'Docker no respondio. Termina de iniciarlo y vuelve a ejecutar el BAT.' }
        }
        & docker.exe compose --file 'docker\compose.yaml' up -d --wait --wait-timeout 90 postgres
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL no esta listo. Revisa Docker Desktop. No se borraron volumenes ni datos.' }
    }
    Write-Host 'Comprobando esquema, conexion y configuracion de la API...'
    Invoke-Npm -NpmArguments @('run', 'db:migrate')
    Invoke-Npm -NpmArguments @('run', 'db:check')

    # Use the production build already validated by the project. Avoid rebuilding
    # over another running instance. Build only if no production build exists.
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot '.next\BUILD_ID'))) {
        Write-Host 'Generando la version de produccion...'
        Invoke-Npm -NpmArguments @('run', 'build')
    }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort)
    $available = @(3000..3010 | Where-Object { $_ -notin $listeners })
    if (!$available.Count) { throw 'Los puertos 3000 a 3010 estan ocupados. Cierra un iniciador anterior y reintenta.' }
    $Port = $available[0]
    if ($Port -ne 3000) { Write-Host "El puerto 3000 esta ocupado. Se usara $Port sin cerrar otros procesos." }

    Write-Host "Preparando acceso TCP $Port solo desde la red local..."
    Write-Host 'Si Windows pide permiso de administrador, acepta para configurar el firewall.'
    $firewallArgs = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ConfigureFirewall -Port $Port"
    $firewallProcess = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $firewallArgs -PassThru -Wait
    if ($firewallProcess.ExitCode -ne 0) { throw 'No se pudo habilitar el firewall. Ejecuta el BAT y acepta el permiso de Windows; si el equipo es administrado, solicita habilitar el puerto indicado.' }

    $primaryAddress = $addresses[0].IPAddress
    & (Join-Path $PSScriptRoot 'preparar-https.ps1') -Address $primaryAddress
    $env:PORT = [string]$Port
    $env:PDMC_AUTH_ORIGIN = "https://${primaryAddress}:$Port"
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss' 
    $logDirectory = Join-Path $projectRoot 'logs'
    $null = New-Item -ItemType Directory -Path $logDirectory -Force
    $outputLog = Join-Path $logDirectory "pdmc-red-$stamp.log"
    $errorLog = Join-Path $logDirectory "pdmc-red-$stamp-error.log"
    $nextPath = Join-Path $PSScriptRoot 'servidor-pdmc.mjs'
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList "`"$nextPath`"" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ($serverProcess.HasExited) { break }
        try {
            # Probe TLS with the exact generated certificate as CA, never ignore verification.
            $probe = 'const https=require("node:https"),fs=require("node:fs");const r=https.get(process.env.PDMC_AUTH_ORIGIN+"/login",{ca:new (require("node:crypto").X509Certificate)(fs.readFileSync("PDMC_Certificado_Red.cer")).toString()},res=>{res.resume();process.exitCode=res.statusCode===200?0:1});r.setTimeout(3000,()=>{r.destroy();process.exitCode=1});r.on("error",()=>{process.exitCode=1});'
            $probe | & node.exe *> $null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 1
        } catch { Start-Sleep -Seconds 1 }
    }
    if (!$ready) { throw "La API no respondio correctamente. Revisa $errorLog y $outputLog" }

    $links = @($env:PDMC_AUTH_ORIGIN)
    $linkFile = Join-Path $projectRoot 'Enlace_PDMC_Red.txt'
    (@('PDMC - Enlaces para otra PC en la misma red', '') + $links + @('', 'Mantener esta PC encendida y el iniciador abierto. La IP puede cambiar al reconectar la red.')) | Set-Content -LiteralPath $linkFile -Encoding UTF8
    # Consultas automaticas a SQL Server: solo si PDMC_SQLSERVER_ENABLED=true.
    $syncMode = 'const env=require("@next/env");env.loadEnvConfig(process.cwd());console.log(process.env.PDMC_SQLSERVER_ENABLED==="true"?"on":"off")' | & node.exe
    if ($syncMode -eq 'on') {
        $syncLog = Join-Path $logDirectory "sync-sqlserver-$stamp.log"
        $syncErrorLog = Join-Path $logDirectory "sync-sqlserver-$stamp-error.log"
        $syncProcess = Start-Process -FilePath $nodePath -ArgumentList '--conditions=react-server','--import','tsx','backend/scripts/sincronizar-sqlserver.ts' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $syncLog -RedirectStandardError $syncErrorLog -PassThru
        Write-Host "Consultas automaticas a SQL Server iniciadas. Registro: $syncLog"
    } else {
        Write-Host 'Consultas automaticas a SQL Server desactivadas (PDMC_SQLSERVER_ENABLED).'
    }
    Write-Host "`nAPLICACION Y POSTGRESQL LISTOS" -ForegroundColor Green
    Write-Host 'Copia el enlace correspondiente a tu Wi-Fi o Ethernet:'
    foreach ($link in $links) { Write-Host "  $link" -ForegroundColor Cyan }
    if ($links.Count -eq 1) {
        try { Set-Clipboard -Value $links[0]; Write-Host 'Enlace copiado al portapapeles: puedes pegarlo con Ctrl+V.' } catch { Write-Host 'Copia el enlace mostrado arriba.' }
    }
    Write-Host "Tambien se guardo en: $linkFile"
    Write-Host 'Mantiene esta ventana abierta. Ctrl+C detiene esta instancia.'
    Write-Host 'Si la otra PC no conecta, comprueba que no sea una red de invitados o con aislamiento entre equipos.'
    Write-Host 'Acceso protegido: se requiere una cuenta activa y certificado confiable.'
    Write-Host 'Instala PDMC_Certificado_Red.cer como certificado raiz confiable en cada PC antes de ingresar contrasenas.'
    $syncWarned = $false
    while (!$serverProcess.HasExited) {
        if ($null -ne $syncProcess -and $syncProcess.HasExited -and !$syncWarned) {
            Write-Host "ATENCION: las consultas automaticas a SQL Server se detuvieron. Revisa $syncErrorLog" -ForegroundColor Yellow
            $syncWarned = $true
        }
        Start-Sleep -Seconds 2
    }
    if ($serverProcess.ExitCode -ne 0) { throw "El servidor termino con error. Revisa $errorLog" }
} catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    # Stop only the child started by this launcher; never kill unrelated Node apps.
    if ($null -ne $syncProcess -and !$syncProcess.HasExited) {
        Stop-Process -Id $syncProcess.Id -ErrorAction SilentlyContinue
    }
    if ($null -ne $serverProcess -and !$serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
    }
}
