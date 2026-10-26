param([Parameter(Mandatory=$true)][string]$Address)
$ErrorActionPreference = 'Stop'
$ip = $null
if (![System.Net.IPAddress]::TryParse($Address, [ref]$ip) -or $ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { throw 'IPv4 invalida.' }
$root = Split-Path -Parent $PSScriptRoot
$secretDirectory = Join-Path $root '.secrets'
$null = New-Item -ItemType Directory -Path $secretDirectory -Force
$thumbPath = Join-Path $secretDirectory 'pdmc-lan-thumbprint'
$pfxPath = Join-Path $secretDirectory 'pdmc-lan.pfx'
$passPath = Join-Path $secretDirectory 'pdmc-lan-password'
$publicPath = Join-Path $root 'PDMC_Certificado_Red.cer'
if ((Test-Path -LiteralPath $thumbPath) -and (Test-Path -LiteralPath $pfxPath) -and (Test-Path -LiteralPath $passPath) -and (Test-Path -LiteralPath $publicPath)) {
    $thumb = (Get-Content -LiteralPath $thumbPath -Raw).Trim()
    if ($thumb -match '^[A-Fa-f0-9]{40}$') {
        $existing = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumb" -ErrorAction SilentlyContinue
        if ($existing -and $existing.NotAfter -gt (Get-Date).AddDays(7) -and $existing.Subject -eq "CN=PDMC $Address") {
            Write-Host 'Certificado HTTPS existente conservado.'
            return
        }
    }
}
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$password = [Convert]::ToBase64String($bytes)
$certificate = New-SelfSignedCertificate -Type Custom -Subject "CN=PDMC $Address" -FriendlyName 'PDMC HTTPS red local' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -NotAfter (Get-Date).AddYears(1) -TextExtension @("2.5.29.17={text}DNS=localhost&IPAddress=$Address&IPAddress=127.0.0.1", '2.5.29.37={text}1.3.6.1.5.5.7.3.1')
$securePassword = ConvertTo-SecureString -String $password -AsPlainText -Force
$null = Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $securePassword
$null = Export-Certificate -Cert $certificate -FilePath $publicPath
[IO.File]::WriteAllText($passPath,$password,[Text.Encoding]::ASCII)
[IO.File]::WriteAllText($thumbPath,$certificate.Thumbprint,[Text.Encoding]::ASCII)
Write-Host 'Certificado HTTPS creado. La clave privada permanece en .secrets.'
Write-Host "Certificado publico para instalar como confiable en las PCs: $publicPath"
Write-Host "Huella SHA1 para identificarlo en Windows: $($certificate.Thumbprint)"
