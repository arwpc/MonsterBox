@echo off
echo 🔧 Fixing SSH Configuration for MonsterBox
echo ==========================================

REM Define SSH directory and config file paths
set SSH_DIR=%USERPROFILE%\.ssh
set CONFIG_FILE=%SSH_DIR%\config

REM Create SSH directory if it doesn't exist
if not exist "%SSH_DIR%" (
    echo 📁 Creating SSH directory: %SSH_DIR%
    mkdir "%SSH_DIR%"
)

REM Remove existing config file if it has issues
if exist "%CONFIG_FILE%" (
    echo 🗑️ Removing existing SSH config file with issues
    del "%CONFIG_FILE%"
)

REM Create new SSH config file without UTF-8 BOM
echo 📝 Creating new SSH config file
(
echo # MonsterBox SSH Configuration
echo # This file configures SSH access to animatronic RPI systems
echo.
echo # Orlok Animatronic ^(Primary Development System^)
echo Host orlok
echo     HostName 192.168.8.120
echo     User remote
echo     Port 22
echo     StrictHostKeyChecking no
echo     UserKnownHostsFile /dev/null
echo     ConnectTimeout 10
echo     ServerAliveInterval 60
echo     ServerAliveCountMax 3
echo     PasswordAuthentication yes
echo     PubkeyAuthentication yes
echo     PreferredAuthentications publickey,password
echo.
echo # Coffin Animatronic ^(Secondary System^)
echo Host coffin
echo     HostName 192.168.8.140
echo     User remote
echo     Port 22
echo     StrictHostKeyChecking no
echo     UserKnownHostsFile /dev/null
echo     ConnectTimeout 10
echo     ServerAliveInterval 60
echo     ServerAliveCountMax 3
echo     PasswordAuthentication yes
echo     PubkeyAuthentication yes
echo     PreferredAuthentications publickey,password
echo.
echo # Pumpkinhead Animatronic ^(Currently Offline^)
echo Host pumpkinhead
echo     HostName 192.168.1.101
echo     User remote
echo     Port 22
echo     StrictHostKeyChecking no
echo     UserKnownHostsFile /dev/null
echo     ConnectTimeout 10
echo     ServerAliveInterval 60
echo     ServerAliveCountMax 3
echo     PasswordAuthentication yes
echo     PubkeyAuthentication yes
echo     PreferredAuthentications publickey,password
echo.
echo # Generic RPI host for development ^(VS Code Remote SSH^)
echo Host 190fb5aa-f1b9-50b1-9bd2-1d3da626e3b6
echo     HostName 192.168.8.120
echo     User remote
echo     Port 22
echo     StrictHostKeyChecking no
echo     UserKnownHostsFile /dev/null
echo     ConnectTimeout 10
echo     ServerAliveInterval 60
echo     ServerAliveCountMax 3
echo     PasswordAuthentication yes
echo     PubkeyAuthentication yes
echo     PreferredAuthentications publickey,password
echo.
echo # Default settings for all hosts
echo Host *
echo     AddKeysToAgent yes
echo     UseKeychain yes
echo     IdentityFile ~/.ssh/id_rsa
) > "%CONFIG_FILE%"

echo ✅ SSH configuration fixed successfully!
echo.
echo Next steps:
echo 1. Try VS Code Remote SSH connection again
echo 2. Test SSH connectivity: npm run test:animatronic-ssh
echo 3. Copy SSH keys to animatronics if needed:
echo    ssh-copy-id remote@192.168.8.120  # Orlok
echo    ssh-copy-id remote@192.168.8.140  # Coffin
echo.
pause
