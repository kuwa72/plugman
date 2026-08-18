$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

$DistDir = Join-Path $RootDir "dist\Plugman-win32-x64"
$DistExe = Join-Path $DistDir "Plugman.exe"

if (-not (Test-Path $DistExe)) {
    Write-Host "=== Building Plugman first ===" -ForegroundColor Yellow
    & (Join-Path $ScriptDir "build.ps1")
}

$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\Plugman"
$InstallExe = Join-Path $InstallDir "Plugman.exe"

Write-Host "=== [1/3] Copying files to $InstallDir ===" -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path "$DistDir\*" -Destination $InstallDir -Recurse -Force
Write-Host "✓ Copied application files to $InstallDir" -ForegroundColor Green

Write-Host "=== [2/3] Creating Windows shortcuts ===" -ForegroundColor Cyan
$WScriptShell = New-Object -ComObject WScript.Shell

# スタートメニューショートカット
$StartMenuPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs", "Plugman.lnk")
$StartShortcut = $WScriptShell.CreateShortcut($StartMenuPath)
$StartShortcut.TargetPath = $InstallExe
$StartShortcut.WorkingDirectory = $InstallDir
$StartShortcut.Description = "Plugman - VST Plugin Manager"
$StartShortcut.Save()
Write-Host "✓ Start Menu shortcut created: $StartMenuPath" -ForegroundColor Green

# デスクトップショートカット
$DesktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$DesktopShortcutPath = Join-Path $DesktopPath "Plugman.lnk"
$DesktopShortcut = $WScriptShell.CreateShortcut($DesktopShortcutPath)
$DesktopShortcut.TargetPath = $InstallExe
$DesktopShortcut.WorkingDirectory = $InstallDir
$DesktopShortcut.Description = "Plugman - VST Plugin Manager"
$DesktopShortcut.Save()
Write-Host "✓ Desktop shortcut created: $DesktopShortcutPath" -ForegroundColor Green

Write-Host "=== [3/3] Installation completed successfully! ===" -ForegroundColor Green
Write-Host "Installed: $InstallExe" -ForegroundColor Yellow
