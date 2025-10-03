#!/usr/bin/env bash
set -euo pipefail
# Wrapper to orchestrate a room of animatronics in conversation mode
# Example:
#   HOSTS="coffin,orlok,skulltalker,pumpkinhead" bash scripts/start-conversation-all.sh
#   AGENT_ID="xxxxxxxx" bash scripts/start-conversation-all.sh

HOSTS="${HOSTS:-coffin,orlok,skulltalker,pumpkinhead}"
LANGUAGE="${LANGUAGE:-en}"
GAIN="${GAIN:-140}"

exec node scripts/orchestrate-conversation.js

