<#
Compila el agente y su instalador y arma el paquete para los sitios:

    .\construir.ps1            # desde CYSN_QA\agente_tienda, con .venv (pyinstaller, pyodbc, pywin32)

Resultado: dist\NexoQAAgente-<fecha>.zip con
    Instalar-NexoQA.exe          (se abre como administrador)
    NexoQAAgenteTienda\          (servicio de Windows)
    NexoQAAgenteTiendaConsola\   (la misma lógica en consola: primera carga y pruebas)
    LEEME-INSTALACION.txt
El paquete no lleva config.env, tokens ni claves.
#>
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $py)) { throw "Falta $py (python -m venv .venv; .venv\Scripts\pip install pyinstaller pyodbc pywin32)." }

foreach ($spec in 'NexoQAAgenteTienda.spec', 'NexoQAAgenteTiendaConsola.spec', 'InstalarNexoQA.spec') {
    Write-Host "Compilando $spec..."
    # PyInstaller escribe su registro en stderr: en PowerShell 5.1 eso no debe contar como error.
    $ErrorActionPreference = 'Continue'
    & $py -m PyInstaller --noconfirm --log-level WARN $spec 2>&1 | ForEach-Object { "$_" } | Out-Host
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller falló con $spec." }
}

foreach ($carpeta in 'NexoQAAgenteTienda', 'NexoQAAgenteTiendaConsola') {
    $destino = Join-Path 'dist' $carpeta
    Copy-Item README.md, config.env.example $destino -Force
    Copy-Item consultas $destino -Recurse -Force
}

$nombre = "NexoQAAgente-$(Get-Date -Format yyyyMMdd)"
$paquete = Join-Path 'dist' $nombre
if (Test-Path $paquete) { Remove-Item $paquete -Recurse -Force }
New-Item -ItemType Directory $paquete | Out-Null
Copy-Item 'dist\Instalar-NexoQA.exe' $paquete
Copy-Item 'dist\NexoQAAgenteTienda', 'dist\NexoQAAgenteTiendaConsola' $paquete -Recurse
@'
INSTALAR EL AGENTE NEXO QA EN UNA TIENDA, BODEGA O PC DE CREACION

1. Descomprima esta carpeta completa en el PC del sitio (por ejemplo en el Escritorio).
2. Doble clic en Instalar-NexoQA.exe y acepte el permiso de administrador.
3. Pegue el AGENT_CODE y el AGENT_TOKEN del sitio (clic derecho para pegar; el token no se ve).
4. El instalador hace el resto:
   - busca el SQL Server del PC y la base (BD_SPDV, GDC_CASA_MATRIZ o CREACION);
   - crea el usuario de solo lectura nexoqa_agente (si la cuenta de Windows no es
     administradora de SQL Server, pide un usuario administrador, por ejemplo sa;
     esa clave no se guarda);
   - copia el agente a C:\NexoQA, hace la primera carga e instala el servicio
     "NEXO QA - Agente de Tienda", que arranca solo al encender el PC;
   - evita que el PC se suspenda mientras esté enchufado.
5. Al terminar puede borrar esta carpeta. El registro queda en C:\NexoQA\instalacion.log
   y el del agente en C:\NexoQA\agente\agente.log.

Volver a ejecutarlo actualiza el agente y conserva el codigo y el token.
Opciones: Instalar-NexoQA.exe --help
'@ | Set-Content (Join-Path $paquete 'LEEME-INSTALACION.txt') -Encoding UTF8

$zip = Join-Path $PSScriptRoot "$paquete.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
# Con Python: rutas con "/" dentro del zip (Compress-Archive de PowerShell 5.1 usa "\" y falla si el
# antivirus tiene abierto un archivo recién copiado).
& $py -c "import shutil,sys; shutil.make_archive(sys.argv[1][:-4], 'zip', sys.argv[2])" $zip (Join-Path $PSScriptRoot $paquete)
if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $zip." }
Write-Host "Paquete listo: $zip"
