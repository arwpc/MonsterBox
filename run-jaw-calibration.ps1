# Jaw Calibration Runner for Skulltalker RPI4b
Write-Host "🦴 Starting Jaw Calibration on Skulltalker RPI4b" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "Remote Target: 192.168.8.130" -ForegroundColor Yellow
Write-Host "Hardware: MG90S Servo on GPIO Pin 18" -ForegroundColor Yellow
Write-Host ""

# Create calibration execution script
$calibrationScript = @"
#!/bin/bash
echo '🦴 Jaw Calibration Starting on Skulltalker RPI4b'
cd /home/remote/MonsterBox || exit 1

echo 'Checking Python environment...'
python3 --version
echo 'Checking GPIO library...'
python3 -c "import lgpio; print('lgpio available')" 2>/dev/null || echo 'lgpio not available'

echo 'Starting jaw calibration...'
python3 scripts/chatterpi/jaw_calibration.py

echo 'Calibration complete. Results saved to jaw_calibration_results.json'
ls -la jaw_calibration_results.json 2>/dev/null || echo 'No results file found'
"@

# Write script to temporary file
$calibrationScript | Out-File -FilePath "temp-jaw-calibration.sh" -Encoding UTF8

Write-Host "Uploading calibration script to Skulltalker..." -ForegroundColor Green
scp temp-jaw-calibration.sh remote@192.168.8.130:/tmp/

Write-Host "Executing jaw calibration on remote hardware..." -ForegroundColor Green
ssh remote@192.168.8.130 "chmod +x /tmp/temp-jaw-calibration.sh && /tmp/temp-jaw-calibration.sh"

Write-Host ""
Write-Host "🔧 Post-Calibration Commands:" -ForegroundColor Cyan
Write-Host "View results: ssh remote@192.168.8.130 'cat /home/remote/MonsterBox/jaw_calibration_results.json'" -ForegroundColor White
Write-Host "Test jaw movement: ssh remote@192.168.8.130 'cd /home/remote/MonsterBox && python3 scripts/chatterpi/minimal_jaw_server.py'" -ForegroundColor White

# Cleanup
Remove-Item "temp-jaw-calibration.sh" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Press Enter to continue..." -ForegroundColor Yellow
Read-Host
