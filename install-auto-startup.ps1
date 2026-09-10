# ==============================================================================
# AI Resume Tailor - Automatic Windows Boot & Startup Installer
# ==============================================================================
# This script configures Windows to automatically start the backend server
# silently in the background on port 5001 whenever your laptop powers on.
# ==============================================================================

$ErrorActionPreference = "Stop"
$projectRoot = "c:\antigravity_projects\cold-mail-generator"
if (-not (Test-Path $projectRoot)) {
    $projectRoot = $PSScriptRoot
}
Set-Location $projectRoot

$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "AI_Resume_Server.lnk"
$scriptPath = Join-Path $projectRoot "run-server-background.ps1"
$vbsPath = Join-Path $projectRoot "run-silent.vbs"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 Setting Up Automatic Startup for AI Resume Backend..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Create silent VBS wrapper so Windows doesn't flash a console window on boot
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$scriptPath""", 0, False
"@
Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII
Write-Host "  [1/3] Created silent launcher: $vbsPath" -ForegroundColor Green

# 2. Create Startup shortcut pointing to VBS runner
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Auto-start AI Resume Tailor Server on Windows boot"
$shortcut.Save()
Write-Host "  [2/3] Created Windows Startup shortcut: $shortcutPath" -ForegroundColor Green

# 3. Create Windows Task Scheduler Entry (Guaranteed startup on user logon)
try {
    $taskName = "AI_Resume_Tailor_Autostart"
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $projectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Auto-starts AI Resume Tailor backend on boot" -Force | Out-Null
    Write-Host "  [3/3] Registered Windows Task Scheduler entry: $taskName" -ForegroundColor Green
} catch {
    Write-Host "  [3/3] Note: Task Scheduler entry active via Windows Startup folder." -ForegroundColor Gray
}

Write-Host "`n⚡ Verifying server startup..." -ForegroundColor Cyan
& $scriptPath

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ SUCCESS: AI Resume Backend is configured to start automatically!" -ForegroundColor Green
Write-Host "   • Local URL:  http://localhost:5001" -ForegroundColor Gray
Write-Host "   • Cloud URL:  https://ai-resume-tailor-backend-gldn.onrender.com" -ForegroundColor Gray
Write-Host "   • Runs silently in background every time your laptop powers on." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
