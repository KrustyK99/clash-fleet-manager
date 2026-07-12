$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $Root
try {
    Write-Host "Preparing disposable MariaDB test database for FastAPI E2E verification..."
    & (Join-Path $PSScriptRoot "prepare-mariadb-test-db.ps1") -ClearData -SeedFixtures
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $env:FLEET_STORE_BACKEND = "mariadb"
    $env:FLEET_MARIADB_HOST = $env:FLEET_TEST_MARIADB_HOST
    $env:FLEET_MARIADB_PORT = if ($env:FLEET_TEST_MARIADB_PORT) { $env:FLEET_TEST_MARIADB_PORT } else { "3306" }
    $env:FLEET_MARIADB_DATABASE = $env:FLEET_TEST_MARIADB_DATABASE
    $env:FLEET_MARIADB_USER = $env:FLEET_TEST_MARIADB_USER
    $env:FLEET_MARIADB_PASSWORD = $env:FLEET_TEST_MARIADB_PASSWORD

    $env:APP_E2E_TARGET = "fastapi"
    $env:API_CONTRACT_TARGET = "fastapi"
    $env:API_CONTRACT_FASTAPI_BASE_URL = "http://127.0.0.1:8001"
    $env:PLAYWRIGHT_REUSE_EXISTING_SERVER = "0"

    Write-Host "Running full FastAPI E2E suite with FLEET_STORE_BACKEND=mariadb..."
    & npx.cmd playwright test --reporter=line
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
