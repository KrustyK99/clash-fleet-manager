<#
.SYNOPSIS
  Build, copy, and recreate the Clash Fleet Manager FastAPI JSON container on a Synology NAS.

.DESCRIPTION
  This script automates the Synology Docker deployment path for the FastAPI JSON
  production-candidate runtime.

  It does:
    - build the local Docker image using npm run container:build
    - save the image to clash-fleet-manager-fastapi-json-local.tar
    - copy the image tar to the NAS using scp
    - upload a small remote deployment shell script
    - run the remote script with sudo over SSH
    - docker load the image on the NAS
    - stop/remove the existing candidate container
    - run a fresh candidate container
    - mount the live JSON data folder read/write
    - expose host port 8004 to container port 8001
    - smoke-test the app URL and API endpoints with retries

  It does NOT:
    - touch the existing PHP/Web Station app
    - change reverse proxy settings
    - change DNS
    - start MariaDB
    - commit or keep Docker image tar files in git

  The remote Docker step uses sudo. You will likely be prompted for your
  Synology password when the remote Docker deployment runs.

.EXAMPLE
  Dry run:
    .\Tools\deploy-fastapi-container-to-nas.ps1 `
      -NasHost 192.168.2.252 `
      -NasUser lincoln `
      -SshPort 34222 `
      -DryRun

.EXAMPLE
  Real deployment:
    .\Tools\deploy-fastapi-container-to-nas.ps1 `
      -NasHost 192.168.2.252 `
      -NasUser lincoln `
      -SshPort 34222 `
      -Yes

.EXAMPLE
  Real deployment with restart persistence:
    .\Tools\deploy-fastapi-container-to-nas.ps1 `
      -NasHost 192.168.2.252 `
      -NasUser lincoln `
      -SshPort 34222 `
      -RestartPolicy unless-stopped `
      -Yes
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$NasHost,

    [Parameter(Mandatory = $true)]
    [string]$NasUser,

    [int]$SshPort = 34222,

    [string]$ImageName = "clash-fleet-manager-fastapi-json:local",

    [string]$ImageTar = "clash-fleet-manager-fastapi-json-local.tar",

    [string]$ContainerName = "clash-fleet-manager-fastapi-json-production-candidate",

    [string]$RemoteDeployDir = "/volume1/docker/clash-fleet-manager-fastapi-json",

    [string]$DataDir = "/volume1/web/clash-timers/data",

    [int]$HostPort = 8004,

    [int]$ContainerPort = 8001,

    [string]$RemoteDockerPath = "/usr/local/bin/docker",

    [ValidateSet("no", "unless-stopped", "always", "on-failure")]
    [string]$RestartPolicy = "no",

    [int]$ConnectTimeoutSeconds = 8,

    [switch]$SkipBuild,

    [switch]$SkipSave,

    [switch]$SkipSmokeTest,

    [switch]$DryRun,

    [switch]$Yes,

    [switch]$VerboseRemote
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[ OK ] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Test-CommandAvailable {
    param([string]$CommandName)

    $cmd = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($null -eq $cmd) {
        throw "Required command not found: $CommandName"
    }

    Write-Ok "Found $CommandName at $($cmd.Source)"
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DisplayName,

        [Parameter(Mandatory = $true)]
        [string]$Exe,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Write-Step $DisplayName

    if ($VerboseRemote) {
        Write-Host "$Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    }

    if ($DryRun) {
        Write-Warn "Dry run: skipped command"
        return
    }

    & $Exe @Arguments
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "$DisplayName failed with exit code $exitCode"
    }
}

function Invoke-RemoteCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DisplayName,

        [Parameter(Mandatory = $true)]
        [string]$Command,

        [switch]$ForceTty
    )

    $target = "${NasUser}@${NasHost}"
    $args = @(
        "-p", "$SshPort",
        "-o", "ConnectTimeout=$ConnectTimeoutSeconds",
        "-o", "ServerAliveInterval=5",
        "-o", "ServerAliveCountMax=2"
    )

    if ($ForceTty) {
        $args += "-tt"
    }

    $args += $target
    $args += $Command

    Invoke-External -DisplayName $DisplayName -Exe "ssh" -Arguments $args
}

function Copy-ToNas {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LocalPath,

        [Parameter(Mandatory = $true)]
        [string]$RemotePath
    )

    $target = "${NasUser}@${NasHost}:$RemotePath"
    $args = @(
        "-O",
        "-P", "$SshPort",
        "-o", "ConnectTimeout=$ConnectTimeoutSeconds",
        $LocalPath,
        $target
    )

    Invoke-External -DisplayName "Copy $LocalPath to NAS:$RemotePath" -Exe "scp" -Arguments $args
}

function ConvertTo-ShellSingleQuoted {
    param([Parameter(Mandatory = $true)][string]$Value)
    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Invoke-HttpSmoke {
    param([Parameter(Mandatory = $true)][string]$BaseUrl)

    Write-Section "Smoke test"

    if ($SkipSmokeTest) {
        Write-Warn "Smoke test skipped by request"
        return
    }

    $verifyScript = Join-Path (Get-Location) "tests\support\verify-container-runtime.mjs"
    if (Test-Path $verifyScript) {
        Write-Step "Run project container smoke test against $BaseUrl"

        if ($DryRun) {
            Write-Warn "Dry run: skipped smoke test"
            return
        }

        $maxAttempts = 10
        $delaySeconds = 3

        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            Write-Step "Smoke test attempt $attempt of $maxAttempts"

            & node $verifyScript --base-url $BaseUrl
            $exitCode = $LASTEXITCODE

            if ($exitCode -eq 0) {
                Write-Ok "Project container smoke test passed"
                return
            }

            if ($attempt -lt $maxAttempts) {
                Write-Warn "Smoke test failed with exit code $exitCode; waiting $delaySeconds seconds before retry..."
                Start-Sleep -Seconds $delaySeconds
            }
        }

        throw "Project container smoke test failed after $maxAttempts attempts"
    }

    $paths = @(
        "/",
        "/api.php?action=load",
        "/api.php?action=loadViews"
    )

    foreach ($path in $paths) {
        $uri = "$BaseUrl$path"
        Write-Step "GET $uri"

        if ($DryRun) {
            Write-Warn "Dry run: skipped request"
            continue
        }

        $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 15
        if ($response.StatusCode -ne 200) {
            throw "$uri returned HTTP $($response.StatusCode)"
        }

        if ([string]::IsNullOrWhiteSpace($response.Content)) {
            throw "$uri returned an empty response"
        }

        Write-Ok "$uri returned HTTP 200"
    }
}

function Assert-RepoRoot {
    if (-not (Test-Path "package.json")) {
        throw "Run this script from the project root, where package.json exists."
    }

    if (-not (Test-Path "Dockerfile")) {
        throw "Run this script from the project root, where Dockerfile exists."
    }
}

function Confirm-Deployment {
    if ($DryRun -or $Yes) {
        return
    }

    Write-Host ""
    Write-Warn "This will recreate the NAS container:"
    Write-Host "  Container: $ContainerName"
    Write-Host "  NAS:       ${NasUser}@${NasHost}:$SshPort"
    Write-Host "  Port:      ${HostPort}:${ContainerPort}"
    Write-Host "  Data:      $DataDir mounted to /data"
    Write-Host ""
    Write-Host "The PHP/Web Station app is not touched, but the existing FastAPI candidate container will be stopped and replaced."
    Write-Host ""

    $answer = Read-Host "Type DEPLOY to continue"
    if ($answer -ne "DEPLOY") {
        throw "Deployment cancelled."
    }
}

function New-RemoteDeployScript {
    $qImageName = ConvertTo-ShellSingleQuoted $ImageName
    $qImageTar = ConvertTo-ShellSingleQuoted "$RemoteDeployDir/$ImageTar"
    $qContainerName = ConvertTo-ShellSingleQuoted $ContainerName
    $qDataDir = ConvertTo-ShellSingleQuoted $DataDir
    $qDockerPath = ConvertTo-ShellSingleQuoted $RemoteDockerPath
    $qHostPort = ConvertTo-ShellSingleQuoted "$HostPort"
    $qContainerPort = ConvertTo-ShellSingleQuoted "$ContainerPort"
    $qRestartPolicy = ConvertTo-ShellSingleQuoted $RestartPolicy

    return @"
#!/bin/sh
set -eu

IMAGE_NAME=$qImageName
IMAGE_TAR=$qImageTar
CONTAINER_NAME=$qContainerName
DATA_DIR=$qDataDir
DOCKER=$qDockerPath
HOST_PORT=$qHostPort
CONTAINER_PORT=$qContainerPort
RESTART_POLICY=$qRestartPolicy

echo ""
echo "=== Remote FastAPI JSON container deployment ==="
echo "Image:        `$IMAGE_NAME"
echo "Image tar:    `$IMAGE_TAR"
echo "Container:    `$CONTAINER_NAME"
echo "Data dir:     `$DATA_DIR"
echo "Docker:       `$DOCKER"
echo "Port:         `$HOST_PORT -> `$CONTAINER_PORT"
echo "Restart:      `$RESTART_POLICY"

echo ""
echo "=== Preflight checks ==="

if [ ! -x "`$DOCKER" ]; then
  echo "Docker binary is missing or not executable: `$DOCKER" >&2
  exit 127
fi

"`$DOCKER" version --format '{{.Server.Version}}' >/dev/null

if [ ! -f "`$IMAGE_TAR" ]; then
  echo "Missing image tar: `$IMAGE_TAR" >&2
  exit 1
fi

if [ ! -d "`$DATA_DIR" ]; then
  echo "Missing data directory: `$DATA_DIR" >&2
  exit 1
fi

if [ ! -f "`$DATA_DIR/timers.json" ]; then
  echo "Missing timers.json in `$DATA_DIR" >&2
  exit 1
fi

if [ ! -f "`$DATA_DIR/account_views.json" ]; then
  echo "Missing account_views.json in `$DATA_DIR" >&2
  exit 1
fi

echo "Data files:"
ls -l "`$DATA_DIR/timers.json" "`$DATA_DIR/account_views.json"

echo ""
echo "Checking whether another container is using host port `$HOST_PORT..."
OTHER_PORT_USER="`$("`$DOCKER" ps --format '{{.ID}} {{.Names}} {{.Ports}}' | grep ":`$HOST_PORT->\|:`$HOST_PORT-" | grep -v " `$CONTAINER_NAME " || true)"
if [ -n "`$OTHER_PORT_USER" ]; then
  echo "Another running container appears to be using host port `$HOST_PORT:" >&2
  echo "`$OTHER_PORT_USER" >&2
  exit 1
fi

echo ""
echo "=== Load image ==="
"`$DOCKER" load -i "`$IMAGE_TAR"

echo ""
echo "=== Replace container ==="
if "`$DOCKER" ps -a --format '{{.Names}}' | grep -Fxq "`$CONTAINER_NAME"; then
  echo "Stopping existing container: `$CONTAINER_NAME"
  "`$DOCKER" stop "`$CONTAINER_NAME" || true

  echo "Removing existing container: `$CONTAINER_NAME"
  "`$DOCKER" rm "`$CONTAINER_NAME" || true
else
  echo "No existing container named `$CONTAINER_NAME found."
fi

echo "Starting fresh container..."
"`$DOCKER" run -d \
  --name "`$CONTAINER_NAME" \
  -p "`$HOST_PORT:`$CONTAINER_PORT" \
  -e FLEET_STORE_BACKEND=json \
  -e FLEET_DATA_DIR=/data \
  -e FLEET_SERVE_APP=1 \
  -e FLEET_APP_DIR=/app \
  -v "`$DATA_DIR:/data" \
  --restart "`$RESTART_POLICY" \
  "`$IMAGE_NAME"

echo ""
echo "Waiting briefly for the container to start..."
sleep 3

echo ""
echo "=== Container status ==="
"`$DOCKER" ps --filter "name=`$CONTAINER_NAME" --format 'table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}'

echo ""
echo "=== Recent container logs ==="
"`$DOCKER" logs --tail 80 "`$CONTAINER_NAME" || true

echo ""
echo "Remote deployment complete."
"@
}

Write-Host "Clash Fleet Manager FastAPI NAS container deployment" -ForegroundColor Cyan
Write-Host "NAS:             ${NasUser}@${NasHost}:$SshPort"
Write-Host "Image:           $ImageName"
Write-Host "Image tar:       $ImageTar"
Write-Host "Container:       $ContainerName"
Write-Host "Remote deploy:   $RemoteDeployDir"
Write-Host "Data dir:        $DataDir"
Write-Host "Port:            ${HostPort}:${ContainerPort}"
Write-Host "Remote docker:   $RemoteDockerPath"
Write-Host "Restart policy:  $RestartPolicy"
if ($DryRun) {
    Write-Warn "DRY RUN MODE: commands will be printed/skipped, no deployment will occur."
}

Write-Section "Local checks"
Assert-RepoRoot
Test-CommandAvailable "ssh"
Test-CommandAvailable "scp"
Test-CommandAvailable "npm"
Test-CommandAvailable "node"

Confirm-Deployment

Write-Section "Local build/export"

if ($SkipBuild) {
    Write-Warn "Skipping image build"
} else {
    Invoke-External -DisplayName "Build local Docker image" -Exe "npm" -Arguments @("run", "container:build")
}

if ($SkipSave) {
    Write-Warn "Skipping image save"
} else {
    Invoke-External -DisplayName "Save local Docker image to tar" -Exe "npm" -Arguments @("run", "container:save")
}

if (-not $DryRun) {
    if (-not (Test-Path $ImageTar)) {
        throw "Expected image tar not found: $ImageTar"
    }

    $tarInfo = Get-Item $ImageTar
    Write-Ok "Image tar exists: $($tarInfo.FullName) ($([math]::Round($tarInfo.Length / 1MB, 2)) MB)"
}

Write-Section "Remote staging"

Invoke-RemoteCommand `
    -DisplayName "Create remote deployment directory" `
    -Command "mkdir -p '$RemoteDeployDir' && test -w '$RemoteDeployDir'"

$remoteScriptLocal = Join-Path $env:TEMP ("deploy-fastapi-container-to-nas-" + [guid]::NewGuid().ToString("N") + ".sh")
$remoteScriptName = "deploy-fastapi-container-to-nas.sh"
$remoteScriptPath = "$RemoteDeployDir/$remoteScriptName"

try {
    $remoteScriptText = New-RemoteDeployScript
    $remoteScriptText = $remoteScriptText -replace "`r`n", "`n"

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($remoteScriptLocal, $remoteScriptText, $utf8NoBom)

    Copy-ToNas -LocalPath $ImageTar -RemotePath "$RemoteDeployDir/$ImageTar"
    Copy-ToNas -LocalPath $remoteScriptLocal -RemotePath $remoteScriptPath

    Invoke-RemoteCommand `
        -DisplayName "Make remote deployment script executable" `
        -Command "chmod +x '$remoteScriptPath'"

    Write-Section "Remote deployment"

    Invoke-RemoteCommand `
        -DisplayName "Run remote Docker deployment with sudo" `
        -Command "sudo sh '$remoteScriptPath'" `
        -ForceTty
}
finally {
    if (Test-Path $remoteScriptLocal) {
        Remove-Item $remoteScriptLocal -Force
    }
}

$baseUrl = "http://${NasHost}:$HostPort"
Invoke-HttpSmoke -BaseUrl $baseUrl

Write-Section "Done"
Write-Ok "FastAPI JSON candidate deployment completed."
Write-Host ""
Write-Host "Candidate app URL:"
Write-Host "  $baseUrl"
Write-Host ""
Write-Host "Rollback PHP/Web Station URL remains untouched:"
Write-Host "  http://$NasHost/clash-timers/"
