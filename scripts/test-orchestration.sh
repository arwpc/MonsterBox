#!/bin/bash
# Test orchestration system

set -e

HOST=${1:-"localhost"}
PORT=${2:-"3000"}

echo "🎭 Testing Orchestration System 🎭"
echo "==================================="
echo "Host: $HOST:$PORT"
echo ""

# Get status of all animatronics
echo "1. Getting status of all animatronics..."
curl -sS http://$HOST:$PORT/api/orchestration/status | jq '.'
echo ""

# Health check broadcast
echo "2. Broadcasting health check to all animatronics..."
curl -sS -X POST http://$HOST:$PORT/api/orchestration/broadcast/animatronics \
  -H "Content-Type: application/json" \
  -d '{"command":"health-check"}' | jq '.'
echo ""

# Make all animatronics say something (with delay to avoid rate limiting)
echo "3. Making all animatronics speak (with delays)..."
echo "   Note: This may take a while due to rate limiting..."
curl -sS -X POST http://$HOST:$PORT/api/orchestration/say-all \
  -H "Content-Type: application/json" \
  -d '{"text":"Halloween greetings from the MonsterBox orchestration system"}' | jq '.'
echo ""

# Enable random poses on all animatronics
echo "4. Enabling random poses on all animatronics..."
curl -sS -X POST http://$HOST:$PORT/api/orchestration/enable-random-poses \
  -H "Content-Type: application/json" \
  -d '{"cooldownMs":3000,"minAmplitude":0.2,"maxAmplitude":0.5}' | jq '.'
echo ""

sleep 2

# Disable random poses on all animatronics
echo "5. Disabling random poses on all animatronics..."
curl -sS -X POST http://$HOST:$PORT/api/orchestration/disable-random-poses | jq '.'
echo ""

echo "✅ Orchestration testing complete!"
echo ""
echo "Available orchestration commands:"
echo "  - GET  /api/orchestration/status"
echo "  - POST /api/orchestration/broadcast/animatronics"
echo "  - POST /api/orchestration/broadcast/goblins"
echo "  - POST /api/orchestration/broadcast/all"
echo "  - POST /api/orchestration/reboot/animatronics"
echo "  - POST /api/orchestration/restart-services"
echo "  - POST /api/orchestration/say-all"
echo "  - POST /api/orchestration/enable-random-poses"
echo "  - POST /api/orchestration/disable-random-poses"
echo "  - POST /api/orchestration/update-config"
echo "  - POST /api/orchestration/deploy-code"
echo ""
echo "Example: Restart all services"
echo "  curl -X POST http://$HOST:$PORT/api/orchestration/restart-services"

