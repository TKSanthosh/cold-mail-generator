# Add portable Node to PATH
$env:PATH = "C:\Users\Santhosh\.gemini\antigravity\scratch\node-portable\node-v20.11.1-win-x64;" + $env:PATH

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Starting Cold Email & Resume Generator  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Start Backend Server
Write-Host "[1/3] Starting backend Express API on port 5000..." -ForegroundColor Green
Start-Process -FilePath "node.exe" -ArgumentList "server/src/index.js" -NoNewWindow -PassThru

# Start Frontend Dev Server
Write-Host "[2/3] Starting frontend Vite client on port 5173..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev --prefix client" -NoNewWindow -PassThru

# Give it a second to spin up, then open browser
Start-Sleep -Seconds 3
Write-Host "[3/3] Opening browser..." -ForegroundColor Green
Start-Process "http://localhost:5173"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Both servers are running in background! " -ForegroundColor Cyan
Write-Host " To stop, close this terminal window.    " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Keep console open to tail logs if needed
while ($true) {
    Start-Sleep -Seconds 1
}
