$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $Root
try {
    Write-Host "Preparing disposable MariaDB test database for FastAPI contract verification..."
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

    Write-Host "Running FastAPI API contract verification with FLEET_STORE_BACKEND=mariadb..."
    & (Join-Path $PSScriptRoot "verify-fastapi-contract.ps1")
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
