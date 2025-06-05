# Automated SSH to Orlok with password
param(
    [string]$Command = "cd /home/remote/MonsterBox && npm start"
)

Write-Host "🎃 Executing command on Orlok: $Command" -ForegroundColor Green

# Use plink with password for fully automated SSH
& plink -ssh -l remote -pw klrklr89! -batch 192.168.8.120 $Command
