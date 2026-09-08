# Installs AI Resume Tailor Server into Windows Startup (starts silently on boot)
$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
Set-Location $projectRoot

$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "AI_Resume_Server.lnk"
$scriptPath = Join-Path $projectRoot "run-server-background.ps1"
$vbsPath = Join-Path $projectRoot "run-silent.vbs"

# 1. Create silent VBS wrapper so Windows doesn't flash a console window on boot
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$scriptPath""", 0, False
"@
Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII

# 2. Create Startup shortcut pointing to VBS runner
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Auto-start AI Resume Tailor Server on Windows boot"
$shortcut.Save()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "✅ AI Resume Server installed to Windows Startup!" -ForegroundColor Green
Write-Host "   Shortcut: $shortcutPath" -ForegroundColor Gray
Write-Host "   Target:   $vbsPath" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# 3. Test launch now
Write-Host "Starting server now..." -ForegroundColor Yellow
& $scriptPath
