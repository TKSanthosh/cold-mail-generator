Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  RUNNING MASTER E2E & REGRESSION TEST SUITE" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

node tests/e2e_regression_suite.js
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`n✅ REGRESSION TESTING PASSED: 100% of checks succeeded with zero errors!`n" -ForegroundColor Green
} else {
    Write-Host "`n❌ REGRESSION TESTING FAILED with exit code $exitCode`n" -ForegroundColor Red
}

exit $exitCode
