[CmdletBinding()]
param(
    [switch]$SkipSecurityCheck
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$smartAppControlRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy"
$smartAppControlValueName = "VerifiedAndReputablePolicyState"

function Write-Section {
    param([Parameter(Mandatory)][string]$Title)

    Write-Host ""
    Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Get-SmartAppControlState {
    try {
        return [int](Get-ItemPropertyValue `
            -Path $smartAppControlRegistryPath `
            -Name $smartAppControlValueName `
            -ErrorAction Stop)
    }
    catch {
        return -1
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    Write-Section $Label
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Open-SmartAppControlSettings {
    try {
        Start-Process "windowsdefender://SmartAppControl"
    }
    catch {
        Start-Process "windowsdefender://AppBrowser"
    }
}

try {
    Write-Host "QuantSift Windows build assistant" -ForegroundColor Green
    Write-Host "Project: $projectRoot"

    if (-not $SkipSecurityCheck) {
        $smartAppControlState = Get-SmartAppControlState
        if ($smartAppControlState -ne 0) {
            Write-Section "Smart App Control must be turned off"
            Write-Host "Windows is currently blocking Rust build EXE/DLL files." -ForegroundColor Yellow
            Write-Host "The Smart App Control settings page will now open."
            Write-Host "Choose Off, then return to this window and press Enter."
            Write-Host ""
            Write-Host "Important: Microsoft normally requires a Windows reset/reinstall to turn" -ForegroundColor Yellow
            Write-Host "Smart App Control back on after it has been turned off." -ForegroundColor Yellow
            Write-Host ""
            Write-Host "This script does not edit the security registry or disable Defender." -ForegroundColor DarkGray

            Open-SmartAppControlSettings
            [void](Read-Host "Press Enter after Smart App Control shows Off")

            $smartAppControlState = Get-SmartAppControlState
            if ($smartAppControlState -ne 0) {
                throw "Smart App Control still appears active (state $smartAppControlState). Turn it off and run build-windows.cmd again."
            }
        }
    }

    Set-Location -LiteralPath $projectRoot

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "pnpm was not found. Install pnpm and reopen this script."
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "Cargo was not found. Install the Rust MSVC toolchain and reopen this script."
    }

    Invoke-CheckedCommand `
        -Label "Install dependencies" `
        -Executable "pnpm" `
        -Arguments @("install", "--frozen-lockfile")
    Invoke-CheckedCommand `
        -Label "Run tests" `
        -Executable "pnpm" `
        -Arguments @("test")
    Invoke-CheckedCommand `
        -Label "Type-check frontend" `
        -Executable "pnpm" `
        -Arguments @("lint")
    Invoke-CheckedCommand `
        -Label "Build Windows application" `
        -Executable "pnpm" `
        -Arguments @("tauri", "build")

    $bundleDirectory = Join-Path $projectRoot "src-tauri\target\release\bundle"
    $releaseExecutable = Join-Path $projectRoot "src-tauri\target\release\quantsift.exe"
    $packages = @()
    if (Test-Path -LiteralPath $bundleDirectory) {
        $packages += Get-ChildItem `
            -LiteralPath $bundleDirectory `
            -File `
            -Recurse `
            -Include "*.msi", "*.exe"
    }
    if (Test-Path -LiteralPath $releaseExecutable) {
        $packages += Get-Item -LiteralPath $releaseExecutable
    }

    if ($packages.Count -eq 0) {
        throw "The build completed, but no Windows package was found under $bundleDirectory."
    }

    Write-Section "Build complete"
    $packages |
        Sort-Object FullName -Unique |
        ForEach-Object { Write-Host $_.FullName -ForegroundColor Green }

    $preferredPackage = $packages |
        Where-Object Extension -eq ".exe" |
        Select-Object -First 1
    if (-not $preferredPackage) {
        $preferredPackage = $packages | Select-Object -First 1
    }

    Start-Process explorer.exe -ArgumentList "/select,`"$($preferredPackage.FullName)`""
    exit 0
}
catch {
    Write-Host ""
    Write-Host "Build stopped: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

