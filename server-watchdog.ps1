# ==============================================================================
# AI Resume Tailor & ATS Optimizer - Indefinite Process Supervisor / Watchdog
# ==============================================================================
$projectRoot = "c:\antigravity_projects\cold-mail-generator"
if (-not (Test-Path $projectRoot)) { $projectRoot = $PSScriptRoot }
Set-Location $projectRoot

$port = 5001
$env:PORT = "5001"
$env:NAUKRI_FORCE_HEADLESS = "true"

$logFile = Join-Path $projectRoot "server_background.log"
$errLogFile = Join-Path $projectRoot "server_background_err.log"
$stopSignal = Join-Path $projectRoot ".stop_signal"

if (Test-Path $stopSignal) {
    Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
}

while ($true) {
    if (Test-Path $stopSignal) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $logFile -Value "[$ts] Stop signal detected. Exiting watchdog supervisor."
        Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
        break
    }

    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $logFile -Value "[$ts] Supervisor: Launching AI Resume backend process..."

    $nodeArgs = @("--expose-gc", "--max-old-space-size=256", "server/src/index.js")
    $proc = Start-Process -FilePath "node" `
                          -ArgumentList $nodeArgs `
                          -WorkingDirectory $projectRoot `
                          -RedirectStandardOutput $logFile `
                          -RedirectStandardError $errLogFile `
                          -WindowStyle Hidden `
                          -PassThru

    if ($proc) {
        $proc.WaitForExit()
    }

    if (Test-Path $stopSignal) {
        $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        Add-Content -Path $logFile -Value "[$ts] Stop signal detected after node exit. Exiting watchdog supervisor."
        Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue
        break
    }

    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Add-Content -Path $logFile -Value "[$ts] WARNING: Node process exited. Respawning indefinitely in 2 seconds..."
    Start-Sleep -Seconds 2
}
