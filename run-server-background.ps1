# AI Resume Tailor & ATS Optimizer - Background Server Runner
$ErrorActionPreference = "SilentlyContinue"
$projectRoot = $PSScriptRoot
Set-Location $projectRoot

$port = 5001

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

# 2. Pull latest updates from Git if internet is available
try {
    git fetch origin main --quiet 2>$null
    git merge origin/main --quiet 2>$null
} catch {}

# 3. Launch Node.js server in the background
$logFile = Join-Path $projectRoot "server_background.log"
$errLogFile = Join-Path $projectRoot "server_background_err.log"
$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
Add-Content -Path $logFile -Value "`n=== Starting AI Resume Server at $timestamp ==="

Start-Process -FilePath "node" `
              -ArgumentList "server/src/index.js" `
              -WorkingDirectory $projectRoot `
              -RedirectStandardOutput $logFile `
              -RedirectStandardError $errLogFile `
              -WindowStyle Hidden

# 4. Wait briefly and verify startup
Start-Sleep -Seconds 3
try {
    $verify = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 3 -ErrorAction Stop
    if ($verify.status -eq 'ok') {
        Write-Output "✅ Server successfully started on http://localhost:$port"
    } else {
        Write-Output "⚠️ Server started but health check returned unexpected response."
    }
} catch {
    Write-Output "⚠️ Server was launched. Check server_background.log for details."
}
