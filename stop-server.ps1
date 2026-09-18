# Stops the background server and watchdog supervisor
$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = "c:\antigravity_projects\cold-mail-generator" }

# Signal watchdog to exit
$stopSignal = Join-Path $projectRoot ".stop_signal"
New-Item -Path $stopSignal -ItemType File -Force | Out-Null

# Stop any watchdog powershell processes
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*server-watchdog.ps1*" } | ForEach-Object {
    try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped watchdog supervisor process ID $($_.ProcessId)." -ForegroundColor Yellow
    } catch {}
}

# Stop server processes on ports 5001 or 5000
$ports = @(5001, 5000)
$stoppedAny = $false

foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            if ($procId -gt 0) {
                try {
                    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                    Write-Host "Stopped process ID $procId running on port $port." -ForegroundColor Yellow
                    $stoppedAny = $true
                } catch {}
            }
        }
    }
}

Start-Sleep -Seconds 1
Remove-Item $stopSignal -Force -ErrorAction SilentlyContinue

if ($stoppedAny) {
    Write-Host "✅ AI Resume Tailor server stopped successfully." -ForegroundColor Green
} else {
    Write-Host "No AI Resume Tailor server processes found." -ForegroundColor Gray
}
