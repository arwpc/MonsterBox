@echo off
echo 🦴 Starting Jaw Calibration on Skulltalker RPI4b
echo =================================================
echo Remote Target: 192.168.8.130
echo Hardware: MG90S Servo on GPIO Pin 18
echo.

echo Creating calibration script...
echo #!/bin/bash > temp-jaw-calibration.sh
echo echo '🦴 Jaw Calibration Starting on Skulltalker RPI4b' >> temp-jaw-calibration.sh
echo cd /home/remote/MonsterBox ^|^| exit 1 >> temp-jaw-calibration.sh
echo echo 'Checking Python environment...' >> temp-jaw-calibration.sh
echo python3 --version >> temp-jaw-calibration.sh
echo echo 'Checking GPIO library...' >> temp-jaw-calibration.sh
echo python3 -c "import lgpio; print('lgpio available')" 2^>/dev/null ^|^| echo 'lgpio not available' >> temp-jaw-calibration.sh
echo echo 'Starting jaw calibration...' >> temp-jaw-calibration.sh
echo python3 scripts/chatterpi/jaw_calibration.py >> temp-jaw-calibration.sh
echo echo 'Calibration complete. Results saved to jaw_calibration_results.json' >> temp-jaw-calibration.sh
echo ls -la jaw_calibration_results.json 2^>/dev/null ^|^| echo 'No results file found' >> temp-jaw-calibration.sh

echo Uploading calibration script to Skulltalker...
scp temp-jaw-calibration.sh remote@192.168.8.130:/tmp/

echo Executing jaw calibration on remote hardware...
ssh remote@192.168.8.130 "chmod +x /tmp/temp-jaw-calibration.sh && /tmp/temp-jaw-calibration.sh"

echo.
echo 🔧 Post-Calibration Commands:
echo View results: ssh remote@192.168.8.130 "cat /home/remote/MonsterBox/jaw_calibration_results.json"
echo Test jaw movement: ssh remote@192.168.8.130 "cd /home/remote/MonsterBox && python3 scripts/chatterpi/minimal_jaw_server.py"

del temp-jaw-calibration.sh 2>nul

echo.
echo Calibration complete! Check the output above for results.
pause
