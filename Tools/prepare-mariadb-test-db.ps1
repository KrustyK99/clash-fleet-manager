param(
    [switch]$ClearData,
    [switch]$SeedFixtures
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    $Python = Join-Path $Root ".venv\Scripts\python"
}
if (-not (Test-Path $Python)) {
    $Python = Join-Path $Root ".venv\bin\python"
}
if (-not (Test-Path $Python)) {
    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $PythonCommand) {
        $Python = $PythonCommand.Source
    }
}
if (-not (Test-Path $Python)) {
    throw "Could not find Python. Create the project virtual environment and install backend requirements first."
}

$Args = @("Tools\mariadb-test-db.py", "--apply-schema")
if ($ClearData) {
    $Args += "--clear"
}
if ($SeedFixtures) {
    $Args += "--seed-fixtures"
}

Push-Location $Root
try {
    & $Python @Args
    if ($LASTEXITCODE -ne 0) {
        throw "MariaDB test database preparation failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
