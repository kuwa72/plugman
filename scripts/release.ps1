param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $Version = $Pkg.version
}

if (-not $Version.StartsWith("v")) {
    $Tag = "v$Version"
} else {
    $Tag = $Version
}

Write-Host "=== Preparing Release: $Tag ===" -ForegroundColor Cyan

# Check git status
$Status = git status --porcelain
if ($Status) {
    Write-Host "Changes detected. Committing changes..." -ForegroundColor Yellow
    git add .
    git commit -m "chore: release $Tag"
}

# Check tag
$ExistingTag = git tag -l $Tag
if ($ExistingTag) {
    Write-Warning "Tag $Tag already exists locally."
    $Choice = Read-Host "Do you want to delete and recreate tag $Tag? (y/N)"
    if ($Choice -match "^[Yy]$") {
        git tag -d $Tag
    } else {
        Write-Error "Release aborted."
        exit 1
    }
}

Write-Host "Creating tag $Tag..." -ForegroundColor Green
git tag -a $Tag -m "Release $Tag"

Write-Host "Pushing branch and tag to origin..." -ForegroundColor Cyan
git push origin main
git push origin $Tag

Write-Host "✓ Pushed $Tag to origin. GitHub Actions will build and publish the release automatically!" -ForegroundColor Green
Write-Host "Monitor with: gh run list --workflow=release.yml" -ForegroundColor Yellow
