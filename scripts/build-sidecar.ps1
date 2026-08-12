[CmdletBinding()]
param(
    [string]$TargetTriple = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$requirements = Join-Path $projectRoot "sidecar\requirements.txt"
$entryPoint = Join-Path $projectRoot "sidecar\quantsift_sidecar.py"
$workDirectory = Join-Path $projectRoot "sidecar\.build"
$venvDirectory = Join-Path $workDirectory "venv-isolated"
$venvPython = Join-Path $venvDirectory "Scripts\python.exe"
$binaryDirectory = Join-Path $projectRoot "src-tauri\binaries"
if ($TargetTriple -ne "x86_64-pc-windows-msvc") {
    throw "Unsupported sidecar target '$TargetTriple'. Only x86_64-pc-windows-msvc is currently supported."
}

$binaryName = "quantsift-sidecar-$TargetTriple"
$binaryPath = Join-Path $binaryDirectory "$binaryName.exe"
$miniRacerFile = "mini_racer-0.14.1-py3-none-win_amd64.whl"
$miniRacerPath = Join-Path $workDirectory $miniRacerFile
$miniRacerUrl = "https://files.pythonhosted.org/packages/78/60/e0708ea8533e928f10f985be35af4c02dd2b61f4a7501dc88e8c927d85e5/$miniRacerFile"
$miniRacerSha256 = "4abd58c62c9955988dbc0cbf5a798914334fe570d2b192f8890bec20135ab6d1"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found. Python 3.10 or newer is required to build the market data service."
}

New-Item -ItemType Directory -Force -Path $workDirectory, $binaryDirectory | Out-Null

if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv $venvDirectory
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create the market data service build environment."
    }
}

if (-not (Test-Path -LiteralPath $miniRacerPath) -or
    (Get-FileHash -LiteralPath $miniRacerPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $miniRacerSha256) {
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        throw "curl.exe was not found. It is required to download the mini-racer runtime."
    }
    curl.exe -L --fail --retry 3 --retry-all-errors --connect-timeout 20 `
        --max-time 600 -C - --output $miniRacerPath $miniRacerUrl
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to download the mini-racer runtime."
    }
}

$miniRacerHash = (Get-FileHash -LiteralPath $miniRacerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($miniRacerHash -ne $miniRacerSha256) {
    throw "The mini-racer runtime checksum did not match the official PyPI artifact."
}

& $venvPython -m pip install --disable-pip-version-check --quiet $miniRacerPath
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install the mini-racer runtime."
}

& $venvPython -m pip install --disable-pip-version-check --quiet `
    --timeout 60 `
    --retries 2 `
    --requirement $requirements `
    "pyinstaller==6.22.0"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install market data service build dependencies."
}

& $venvPython -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --name $binaryName `
    --distpath $binaryDirectory `
    --workpath (Join-Path $workDirectory "work") `
    --specpath $workDirectory `
    --collect-all akshare `
    $entryPoint
if ($LASTEXITCODE -ne 0) {
    throw "Failed to freeze the market data service."
}

if (-not (Test-Path -LiteralPath $binaryPath)) {
    throw "Market data service build completed without producing $binaryPath."
}

Write-Host "Bundled market data service: $binaryPath" -ForegroundColor Green
