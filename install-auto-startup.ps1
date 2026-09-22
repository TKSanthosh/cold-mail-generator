# ==============================================================================
# AI Resume Tailor - Automatic Windows Boot & Indefinite Process Installer
# ==============================================================================
$ErrorActionPreference = "Stop"
$projectRoot = "c:\antigravity_projects\cold-mail-generator"
if (-not (Test-Path $projectRoot)) { $projectRoot = $PSScriptRoot }
Set-Location $projectRoot

$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "AI_Resume_Server.lnk"
$scriptPath = Join-Path $projectRoot "run-server-background.ps1"
$vbsPath = Join-Path $projectRoot "run-silent.vbs"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 Setting Up Indefinite Background Process & Autostart..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Create silent VBS wrapper so Windows runs it without any console window
$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$scriptPath""", 0, False
"@
Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII
Write-Host "  [1/4] Created silent launcher: $vbsPath" -ForegroundColor Green

# 2. Windows Startup Folder shortcut
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "Auto-start AI Resume Tailor Server on Windows boot"
$shortcut.Save()
Write-Host "  [2/4] Created Windows Startup shortcut: $shortcutPath" -ForegroundColor Green

# 3. User Registry Run Key (Guaranteed trigger on every user logon)
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$regValue = "wscript.exe `"$vbsPath`""
Set-ItemProperty -Path $regPath -Name "AI_Resume_Tailor_Server" -Value $regValue -Force
Write-Host "  [3/4] Registered in Windows User Run Registry (HKCU\...\Run)" -ForegroundColor Green

# 4. Windows Task Scheduler Entry (Indefinite runtime, no 3-day limit, auto-restart on fail)
try {
    $taskName = "AI_Resume_Tailor_Autostart"
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $projectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
                                            -DontStopIfGoingOnBatteries `
                                            -ExecutionTimeLimit (New-TimeSpan -Days 0) `
                                            -RestartCount 999 `
                                            -RestartInterval (New-TimeSpan -Minutes 1) `
                                            -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs AI Resume Tailor backend indefinitely in background" -Force | Out-Null
    Write-Host "  [4/4] Configured Task Scheduler entry (Indefinite runtime & auto-restart on fail)" -ForegroundColor Green
} catch {
    Write-Host "  [4/4] Note: Windows Startup folder & Registry active for logon." -ForegroundColor Gray
}

Write-Host "`n⚡ Launching & Verifying indefinite background process..." -ForegroundColor Cyan
& $scriptPath

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ SUCCESS: Configured to run as an INDEFINITE background process!" -ForegroundColor Green
Write-Host "   • Local URL:     http://localhost:5001" -ForegroundColor Gray
Write-Host "   • Cloud Backup:  https://cold-mail-generator-6n7t.onrender.com" -ForegroundColor Gray
Write-Host "   • Self-Healing:  Restarts automatically if Node ever exits or crashes" -ForegroundColor Gray
Write-Host "   • Indefinite:    No execution time limits; runs continuously" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
