$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ServerProcess = $null

Push-Location $Root
try {
    Write-Host "Preparing isolated test app data..."
    & node tests/support/prepare-test-app.mjs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $Python = Join-Path $Root ".venv\Scripts\python.exe"
    if (-not (Test-Path $Python)) {
        $Python = Join-Path $Root ".venv\Scripts\python"
    }
    if (-not (Test-Path $Python)) {
        throw "Could not find the project virtual environment Python at .venv\Scripts\python.exe. Create/activate the venv and install backend requirements first."
    }

    $env:FLEET_DATA_DIR = Join-Path $Root "tests\runtime-app\data"
    $env:API_CONTRACT_TARGET = "fastapi"
    $env:API_CONTRACT_FASTAPI_BASE_URL = "http://127.0.0.1:8001"

    Write-Host "Starting FastAPI on $env:API_CONTRACT_FASTAPI_BASE_URL ..."
    $ServerProcess = Start-Process `
        -FilePath $Python `
        -ArgumentList @("-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8001") `
        -WorkingDirectory $Root `
        -PassThru `
        -NoNewWindow

    $Ready = $false
    for ($Attempt = 1; $Attempt -le 30; $Attempt++) {
        if ($ServerProcess.HasExited) {
            throw "FastAPI server exited early with code $($ServerProcess.ExitCode)."
        }

        try {
            $Response = Invoke-WebRequest `
                -Uri "$env:API_CONTRACT_FASTAPI_BASE_URL/api.php?action=load" `
                -UseBasicParsing `
                -TimeoutSec 1

            if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) {
                $Ready = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not $Ready) {
        throw "FastAPI server did not become ready at $env:API_CONTRACT_FASTAPI_BASE_URL."
    }

    Write-Host "Running FastAPI API contract tests..."
    & npx.cmd playwright test tests/e2e/api-contract.spec.js --project=chromium --reporter=line
    exit $LASTEXITCODE
}
finally {
    if ($null -ne $ServerProcess -and -not $ServerProcess.HasExited) {
        Write-Host "Stopping FastAPI server..."
        Stop-Process -Id $ServerProcess.Id -Force
    }

    Pop-Location
}
