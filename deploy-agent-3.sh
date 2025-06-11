#!/bin/bash
echo '⚰️ Agent 3: Setting up MonsterBox on Coffin Breaker RPI4b'
cd /home/remote/MonsterBox || exit 1

# Check if branch exists locally, if not create it
if git show-ref --verify --quiet refs/heads/agent-3-main-app-fixes; then
    git checkout agent-3-main-app-fixes
else
    git checkout -b agent-3-main-app-fixes
fi

# Try to pull from origin, but don't fail if it doesn't exist
git pull origin agent-3-main-app-fixes 2>/dev/null || echo "Branch not on remote, continuing..."

npm install

# Set environment variables including a dummy API key for testing
export AGENT_ID=agent-3
export AGENT_FOCUS=main-application
export NODE_ENV=development
export PORT=3000
export REPLICA_API_KEY=dummy_key_for_testing

echo 'Starting MonsterBox application with full hardware integration...'
npm run dev &
APP_PID=$!
sleep 15

echo 'Running comprehensive application tests with real hardware...'
npm test -- tests/agent-3-main-application.test.js

# Kill the app process
kill $APP_PID 2>/dev/null || true
