@echo off
echo Connecting to Skulltalker and updating jaw animation system...

REM Pull latest changes
echo Pulling latest changes from Skulltalker branch...
ssh remote@192.168.8.130 "cd MonsterBox && git pull origin Skulltalker"

REM Check if there are any syntax errors
echo Testing jaw animation imports...
ssh remote@192.168.8.130 "cd MonsterBox && node -e \"require('./scripts/jaw-animation/jawAnimationSystem'); console.log('Jaw animation imports OK');\""

REM Stop existing processes
echo Stopping existing MonsterBox processes...
ssh remote@192.168.8.130 "pkill -f 'node.*app.js' || true"

REM Wait a moment
timeout /t 3 /nobreak > nul

REM Start MonsterBox
echo Starting MonsterBox server...
ssh remote@192.168.8.130 "cd MonsterBox && nohup npm start > /dev/null 2>&1 &"

REM Wait for startup
timeout /t 5 /nobreak > nul

REM Check if server is running
echo Checking if server is running...
ssh remote@192.168.8.130 "ps aux | grep 'node.*app.js' | grep -v grep || echo 'No process found'"

echo.
echo Deployment complete! 
echo Access jaw animation test at: http://192.168.8.130:3000/jaw-animation/test
echo.
pause
