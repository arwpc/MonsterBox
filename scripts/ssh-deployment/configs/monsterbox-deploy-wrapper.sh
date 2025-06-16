#!/bin/bash

# MonsterBox Deployment Wrapper Script
# Restricts deployment key to specific commands only

set -euo pipefail

# Allowed commands for deployment key
ALLOWED_COMMANDS=(
    "git pull"
    "git fetch"
    "git status"
    "npm install"
    "npm run build"
    "systemctl restart monsterbox"
    "systemctl status monsterbox"
    "docker-compose up -d"
    "docker-compose down"
    "docker-compose restart"
)

# Log all deployment activities
LOG_FILE="/var/log/monsterbox-deployment.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deployment command: $SSH_ORIGINAL_COMMAND" >> "$LOG_FILE"

# Check if command is allowed
if [[ -z "${SSH_ORIGINAL_COMMAND:-}" ]]; then
    echo "No command specified. Deployment key is restricted to specific commands only."
    exit 1
fi

# Validate command against allowed list
command_allowed=false
for allowed_cmd in "${ALLOWED_COMMANDS[@]}"; do
    if [[ "$SSH_ORIGINAL_COMMAND" == "$allowed_cmd"* ]]; then
        command_allowed=true
        break
    fi
done

if [[ "$command_allowed" == false ]]; then
    echo "Command not allowed: $SSH_ORIGINAL_COMMAND"
    echo "Allowed commands: ${ALLOWED_COMMANDS[*]}"
    exit 1
fi

# Execute the allowed command
cd /home/remote/MonsterBox || exit 1
exec $SSH_ORIGINAL_COMMAND
