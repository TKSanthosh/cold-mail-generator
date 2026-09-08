# Removes AI Resume Tailor Server from Windows Startup
$startupFolder = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Startup)
$shortcutPath = Join-Path $startupFolder "AI_Resume_Server.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item -Path $shortcutPath -Force
    Write-Host "✅ AI Resume Server removed from Windows Startup." -ForegroundColor Green
} else {
    Write-Host "Startup shortcut was not found in: $shortcutPath" -ForegroundColor Gray
}
