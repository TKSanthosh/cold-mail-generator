# Stops the background server running on port 5001 or 5000
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

if ($stoppedAny) {
    Write-Host "✅ AI Resume Tailor server stopped successfully." -ForegroundColor Green
} else {
    Write-Host "No AI Resume Tailor server processes found on ports 5001 or 5000." -ForegroundColor Gray
}
