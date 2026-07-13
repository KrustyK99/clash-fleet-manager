$steps = @(
    "verify:php",
    "verify:fastapi:e2e",
    "verify:fastapi:container:e2e",
    "deploy:nas",
    "container:save",
    "deploy:nas:fastapi:reuse-image"
)

$results = @()
$failed = $false

for ($i = 0; $i -lt $steps.Count; $i++) {
    $step = $steps[$i]

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "Starting: npm run $step"
    Write-Host "============================================================"

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    & npm run $step
    $exitCode = $LASTEXITCODE

    $stopwatch.Stop()

    if ($exitCode -eq 0) {
        $status = "PASSED"
        Write-Host "Completed successfully: $step"
    }
    else {
        $status = "FAILED"
        $failed = $true
        Write-Host "Failed: $step (exit code $exitCode)"
    }

    $results += [PSCustomObject]@{
        Step     = $step
        Status   = $status
        ExitCode = $exitCode
        Duration = $stopwatch.Elapsed.ToString("hh\:mm\:ss")
    }

    if ($failed) {
        for ($j = $i + 1; $j -lt $steps.Count; $j++) {
            $results += [PSCustomObject]@{
                Step     = $steps[$j]
                Status   = "SKIPPED"
                ExitCode = "-"
                Duration = "-"
            }
        }

        break
    }
}

Write-Host ""
Write-Host "============================================================"
Write-Host "VERIFY AND DEPLOY SUMMARY"
Write-Host "============================================================"
Write-Host ""

$results | Format-Table -AutoSize

Write-Host ""

if ($failed) {
    Write-Host "RESULT: FAILED - execution stopped after the first failure."
    exit 1
}
else {
    Write-Host "RESULT: SUCCESS - all verification and deployment steps completed."
    exit 0
}