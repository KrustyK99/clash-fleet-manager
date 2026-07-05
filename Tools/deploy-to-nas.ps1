<#
Deploy Clash Fleet Manager runtime files to a Synology/NAS web folder.

Usage examples:
  # From repo root or Tools folder, after editing $NasPath below:
  powershell -ExecutionPolicy Bypass -File .\deploy-to-nas.ps1

  # If the script lives in the Tools\
  powershell -ExecutionPolicy Bypass -File .\Tools\deploy-to-nas.ps1

  # Or pass the NAS path explicitly:
  powershell -ExecutionPolicy Bypass -File .\deploy-to-nas.ps1 -NasPath "\\YOUR-NAS\web\clash-fleet-manager"

This script intentionally does NOT deploy live data files such as:
  data\timers.json
  data\account_views.json
#>

param(
    [string]$SourceRoot = "",
    [string]$NasPath = "\\192.168.2.252\web\clash-timers\"
)

$ErrorActionPreference = "Stop"

function Write-Step($Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Copy-IfExists($Source, $DestinationDirectory) {
    if (Test-Path $Source) {
        Copy-Item -Path $Source -Destination $DestinationDirectory -Force
    }
}

# Resolve source root. This works whether the script lives in repo root or in Tools\.
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = $PSScriptRoot
    if (-not (Test-Path (Join-Path $SourceRoot "index.html"))) {
        $CandidateRoot = Join-Path $PSScriptRoot ".."
        if (Test-Path (Join-Path $CandidateRoot "index.html")) {
            $SourceRoot = (Resolve-Path $CandidateRoot).Path
        }
    }
} else {
    $SourceRoot = (Resolve-Path $SourceRoot).Path
}

if (-not (Test-Path (Join-Path $SourceRoot "index.html"))) {
    throw "Could not find index.html in SourceRoot: $SourceRoot"
}

if ($NasPath -eq "\\YOUR-NAS\web\clash-fleet-manager") {
    throw "Edit the NasPath default in this script or pass -NasPath '\\YOUR-NAS\web\clash-fleet-manager'."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stageRoot = Join-Path $env:TEMP "clash-fleet-manager-deploy-$timestamp"
$backupRoot = Join-Path $NasPath "_deploy_backups\$timestamp"

Write-Step "Preparing clean deployment package"
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

# Explicit runtime whitelist.
$fixedRuntimeFiles = @(
    "index.html",
    "styles.css",
    "api.php",
    "coc-data-map.js",
    "app-config.js"
)

foreach ($file in $fixedRuntimeFiles) {
    Copy-IfExists -Source (Join-Path $SourceRoot $file) -DestinationDirectory $stageRoot
}

Get-ChildItem -Path $SourceRoot -Filter "app-*.js" -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $stageRoot -Force
}

# Optional future asset folders. These are copied only if they exist.
foreach ($folder in @("assets", "images")) {
    $sourceFolder = Join-Path $SourceRoot $folder
    if (Test-Path $sourceFolder) {
        Copy-Item -Path $sourceFolder -Destination $stageRoot -Recurse -Force
    }
}

$manifestPath = Join-Path $stageRoot "deploy-manifest.txt"
$gitBranch = "unknown"
$gitCommit = "unknown"
try {
    Push-Location $SourceRoot
    $gitBranch = (git rev-parse --abbrev-ref HEAD 2>$null)
    $gitCommit = (git rev-parse --short HEAD 2>$null)
    Pop-Location
} catch {
    try { Pop-Location } catch {}
}

@"
Clash Fleet Manager deployment
Timestamp: $timestamp
SourceRoot: $SourceRoot
Git branch: $gitBranch
Git commit: $gitCommit

Protected data not copied:
- data/timers.json
- data/account_views.json
"@ | Set-Content -Path $manifestPath -Encoding UTF8

Write-Step "Checking NAS path"
New-Item -ItemType Directory -Path $NasPath -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $NasPath "data") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $NasPath "_deploy_backups") -Force | Out-Null

Write-Step "Backing up existing runtime files on NAS"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

foreach ($file in $fixedRuntimeFiles) {
    Copy-IfExists -Source (Join-Path $NasPath $file) -DestinationDirectory $backupRoot
}

Get-ChildItem -Path $NasPath -Filter "app-*.js" -File -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $backupRoot -Force
}
Copy-IfExists -Source (Join-Path $NasPath "deploy-manifest.txt") -DestinationDirectory $backupRoot

Write-Step "Deploying runtime files to NAS"
Copy-Item -Path (Join-Path $stageRoot "*") -Destination $NasPath -Recurse -Force

Write-Step "Deployment complete"
Write-Host "Source:  $SourceRoot"
Write-Host "NAS:     $NasPath"
Write-Host "Backup:  $backupRoot"
Write-Host "Staging: $stageRoot"
Write-Host ""
Write-Host "Protected: data/timers.json and data/account_views.json were not copied." -ForegroundColor Green
