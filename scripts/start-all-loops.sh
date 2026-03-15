#!/bin/bash
# Start all animatronic loop scenes

PASSWORD='klrklr89!'

echo "Starting all animatronic loops..."

# Sir Dragomir - Story Loop (Scene 9)
echo "=== Sir Dragomir ==="
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no remote@sirdragomir 'curl -s -X POST http://localhost:3000/scenes/api/queue/clear && curl -s -X POST http://localhost:3000/scenes/api/queue/enqueue -H "Content-Type: application/json" -d "{\"sceneId\":9}" && curl -s -X POST http://localhost:3000/scenes/api/queue/start' | jq '.success'

# Groundbreaker - Insults Loop (Scene 9007)
echo "=== Groundbreaker ==="
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no remote@groundbreaker 'curl -s -X POST http://localhost:3000/scenes/api/queue/clear && curl -s -X POST http://localhost:3000/scenes/api/queue/enqueue -H "Content-Type: application/json" -d "{\"sceneId\":9007}" && curl -s -X POST http://localhost:3000/scenes/api/queue/start' | jq '.success'

# PumpkinHead - Roar Loop (Scene 2)
echo "=== PumpkinHead ==="
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no remote@pumpkinhead 'curl -s -X POST http://localhost:3000/scenes/api/queue/clear && curl -s -X POST http://localhost:3000/scenes/api/queue/enqueue -H "Content-Type: application/json" -d "{\"sceneId\":2}" && curl -s -X POST http://localhost:3000/scenes/api/queue/start' | jq '.success'

# Orlok - Mina Story Loop (Scene 29)
echo "=== Orlok ==="
curl -s -X POST http://localhost:3000/scenes/api/queue/clear
curl -s -X POST http://localhost:3000/scenes/api/queue/enqueue -H "Content-Type: application/json" -d '{"sceneId":29}'
curl -s -X POST http://localhost:3000/scenes/api/queue/start | jq '.success'

echo ""
echo "All loops started! Verifying..."
sleep 3

# Verify status
echo ""
echo "=== Status Check ==="
echo "Sir Dragomir:"
sshpass -p "$PASSWORD" ssh remote@sirdragomir 'curl -s http://localhost:3000/scenes/api/queue' | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo "Groundbreaker:"
sshpass -p "$PASSWORD" ssh remote@groundbreaker 'curl -s http://localhost:3000/scenes/api/queue' | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo "PumpkinHead:"
sshpass -p "$PASSWORD" ssh remote@pumpkinhead 'curl -s http://localhost:3000/scenes/api/queue' | jq '{running: .status.running, scene: .status.nowPlaying.name}'

echo "Orlok:"
curl -s http://localhost:3000/scenes/api/queue | jq '{running: .status.running, scene: .status.nowPlaying.name}'
