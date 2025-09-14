# Run the Skulltalker installation monitor
Write-Host "🎃 Starting Skulltalker installation monitor..." -ForegroundColor Green

# Execute the monitoring script
& .\scripts\monitor-skulltalker-install.ps1

Write-Host "Monitor has completed. Check the log file for full details." -ForegroundColor Yellow