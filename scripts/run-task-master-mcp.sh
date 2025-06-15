#!/bin/bash
# MonsterBox Task Master MCP Client Runner
# Properly loads environment and runs task-master-ai through MCP protocol

set -e

# Load environment variables
if [ -f "/home/remote/MonsterBox/.env" ]; then
    export $(grep -v '^#' /home/remote/MonsterBox/.env | xargs)
fi

# Set working directory
cd /home/remote/MonsterBox

# Run task-master-ai with proper MCP client capabilities
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
GOOGLE_API_KEY="$GOOGLE_API_KEY" \
npx task-master-ai "$@"
