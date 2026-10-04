param(
    [switch]$SkipScanner = $false,
    [switch]$Zip = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

Write-Host "=== [1/3] Preparing directories ===" -ForegroundColor Cyan
if (-not (Test-Path "bin")) { New-Item -ItemType Directory -Path "bin" | Out-Null }
if (-not (Test-Path "dist")) { New-Item -ItemType Directory -Path "dist" | Out-Null }

Write-Host "=== [2/3] Compiling vst_scanner.exe ===" -ForegroundColor Cyan
if (-not $SkipScanner) {
    if (Get-Command g++ -ErrorAction SilentlyContinue) {
        Write-Host "Compiling vst_scanner.cpp using g++..." -ForegroundColor Green
        g++ vst_scanner.cpp -o bin/vst_scanner.exe -municode -static -O2
        if (Get-Command strip -ErrorAction SilentlyContinue) {
            strip bin/vst_scanner.exe
        }
        Write-Host "✓ vst_scanner.exe compiled successfully." -ForegroundColor Green
    } elseif (Test-Path "bin/vst_scanner.exe") {
        Write-Host "✓ Using existing bin/vst_scanner.exe" -ForegroundColor Green
    } else {
        Write-Warning "g++ not found and bin/vst_scanner.exe does not exist. Skipping native scanner build."
    }
}

Write-Host "=== [3/3] Packaging Electron application ===" -ForegroundColor Cyan
npx @electron/packager . Plugman --platform=win32 --arch=x64 --out=dist --overwrite --icon=assets/icon.ico --asar.unpackDir="bin"

Write-Host "=== Build completed! ===" -ForegroundColor Green
$ExePath = Join-Path $RootDir "dist\Plugman-win32-x64\Plugman.exe"
Write-Host "Artifact: $ExePath" -ForegroundColor Yellow

if ($Zip) {
    Write-Host "=== [Extra] Creating ZIP archive ===" -ForegroundColor Cyan
    $ZipPath = Join-Path $RootDir "Plugman-win32-x64.zip"
    $DistDir = Join-Path $RootDir "dist\Plugman-win32-x64"
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Compress-Archive -Path "$DistDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal
    Write-Host "✓ Archive created: $ZipPath" -ForegroundColor Green
}

