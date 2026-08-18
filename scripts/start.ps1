param(
    [switch]$Dev = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

if ($Dev) {
    Write-Host "Starting Plugman in development mode..." -ForegroundColor Cyan
    npm start
    exit $LASTEXITCODE
}

$InstalledExe = Join-Path $env:LOCALAPPDATA "Programs\Plugman\Plugman.exe"
$DistExe = Join-Path $RootDir "dist\Plugman-win32-x64\Plugman.exe"

$ExePath = $null
if (Test-Path $InstalledExe) {
    $ExePath = $InstalledExe
} elseif (Test-Path $DistExe) {
    $ExePath = $DistExe
} else {
    Write-Host "Plugman.exe not found. Building and installing first..." -ForegroundColor Yellow
    & (Join-Path $ScriptDir "install.ps1")
    $ExePath = $InstalledExe
}

Write-Host "Launching Plugman ($ExePath)..." -ForegroundColor Green
Start-Process -FilePath $ExePath
