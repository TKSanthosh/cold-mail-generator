# AI Resume Tailor & ATS Optimizer - Background Server Runner
$ErrorActionPreference = "SilentlyContinue"
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = "c:\antigravity_projects\cold-mail-generator" }
Set-Location $projectRoot

$port = 5001
$env:PORT = "5001"
$env:NAUKRI_FORCE_HEADLESS = "true"

# 1. Check if server is already running
$isRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 2 -ErrorAction Stop
    if ($resp.status -eq 'ok') {
        $isRunning = $true
    }
} catch {
    $isRunning = $false
}

if ($isRunning) {
    Write-Output "AI Resume Tailor server is already running on port $port."
    exit 0
}

# 2. Launch Supervisor Watchdog in the background (Runs Indefinitely)
$watchdogScript = Join-Path $projectRoot "server-watchdog.ps1"

Start-Process -FilePath "powershell.exe" `
              -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogScript`"" `
              -WorkingDirectory $projectRoot `
              -WindowStyle Hidden

# 3. Wait briefly and verify startup
Start-Sleep -Seconds 3
try {
    $verify = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 3 -ErrorAction Stop
    if ($verify.status -eq 'ok') {
        Write-Output "✅ Server successfully started on http://localhost:$port (Indefinite supervisor active)"
    } else {
        Write-Output "⚠️ Server started but health check returned unexpected response."
    }
} catch {
    Write-Output "⚠️ Server was launched. Check server_background.log for details."
}
