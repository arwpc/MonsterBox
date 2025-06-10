#!/bin/bash
echo '🎃 Agent 2: Setting up ChatterPi on Skulltalker RPI4b'
cd /home/remote/MonsterBox || exit 1
git checkout agent-2-chatterpi-fixes
git pull origin agent-2-chatterpi-fixes
npm install
export AGENT_ID=agent-2
export AGENT_FOCUS=chatterpi-chat
export NODE_ENV=development
export PORT=3000
echo 'Starting MonsterBox application with ChatterPi jaw animation...'
npm run dev &
sleep 15
echo 'Running ChatterPi Chat tests with real jaw servo hardware...'
npm test -- tests/agent-2-chatterpi-chat.test.js
