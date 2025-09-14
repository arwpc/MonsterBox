#!/bin/bash

# MonsterBox Hardware WebSocket Services Startup Script
# Ensures all critical hardware WebSocket services are running

echo "🚀 Starting MonsterBox Hardware WebSocket Services..."

# Function to check if a port is in use
check_port() {
    local port=$1
    if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to start a service if not already running
start_service() {
    local name=$1
    local script=$2
    local port=$3
    local args=$4
    
    if check_port $port; then
        echo "✅ $name already running on port $port"
    else
        echo "🚀 Starting $name on port $port..."
        python3 $script --host 0.0.0.0 --port $port $args &
        sleep 2
        
        if check_port $port; then
            echo "✅ $name started successfully on port $port"
        else
            echo "❌ Failed to start $name on port $port"
        fi
    fi
}

# Start all hardware services based on existing parts
echo "🔍 Analyzing existing parts to determine required services..."

# Check what part types exist in the system
PART_TYPES=$(python3 -c "
import json
try:
    with open('data/parts.json', 'r') as f:
        parts = json.load(f)
    part_types = set(part['type'] for part in parts)
    print(' '.join(part_types))
except:
    print('servo microphone webcam')  # Default services
")

echo "📋 Found part types: $PART_TYPES"

# Start services based on part types found
for part_type in $PART_TYPES; do
    case $part_type in
        "servo")
            start_service "Servo WebSocket Service" "scripts/hardware/servo_websocket_service.py" "8404" "--debug"
            ;;
        "microphone")
            start_service "Microphone WebSocket Service" "scripts/hardware/microphone_websocket_service.py" "8776" ""
            ;;
        "webcam")
            start_service "Webcam WebSocket Service" "scripts/hardware/webcam_websocket_service.py" "8410" ""
            ;;
        "motor")
            start_service "Motor WebSocket Service" "scripts/hardware/motor_websocket_service.py" "8405" ""
            ;;
        "light"|"led")
            start_service "Light WebSocket Service" "scripts/hardware/light_websocket_service.py" "8406" ""
            ;;
        "sensor")
            start_service "Sensor WebSocket Service" "scripts/hardware/sensor_websocket_service.py" "8407" ""
            ;;
        "linear-actuator")
            start_service "Actuator WebSocket Service" "scripts/hardware/actuator_websocket_service.py" "8408" ""
            ;;
    esac
done

# Always start core services even if no parts exist yet
start_service "Servo WebSocket Service" "scripts/hardware/servo_websocket_service.py" "8404" "--debug"
start_service "Microphone WebSocket Service" "scripts/hardware/microphone_websocket_service.py" "8776" ""
start_service "Webcam WebSocket Service" "scripts/hardware/webcam_websocket_service.py" "8410" ""

echo ""
echo "📊 Service Status Summary:"
echo "=========================="

# Check final status - dynamically build list of expected services
services=()

# Add services based on running ports
for port in 8404 8405 8406 8407 8408 8776 8410; do
    if check_port $port; then
        case $port in
            8404) services+=("8404:Servo WebSocket Service") ;;
            8405) services+=("8405:Motor WebSocket Service") ;;
            8406) services+=("8406:Light WebSocket Service") ;;
            8407) services+=("8407:Sensor WebSocket Service") ;;
            8408) services+=("8408:Actuator WebSocket Service") ;;
            8776) services+=("8776:Microphone WebSocket Service") ;;
            8410) services+=("8410:Webcam WebSocket Service") ;;
        esac
    fi
done

for service in "${services[@]}"; do
    port="${service%%:*}"
    name="${service##*:}"
    
    if check_port $port; then
        echo "✅ $name - Port $port - RUNNING"
    else
        echo "❌ $name - Port $port - NOT RUNNING"
    fi
done

echo ""
echo "🎯 ALL ANIMATRONIC CHARACTERS can now connect to:"
echo "   - Servo control: ws://127.0.0.1:8404"
echo "   - Microphone: ws://127.0.0.1:8776"
echo "   - Webcam: ws://127.0.0.1:8410"
echo ""
echo "🎭 Supported Characters:"
echo "   • Orlok (Character 1)"
echo "   • Coffin Breaker (Character 2)"
echo "   • PumpkinHead (Character 3)"
echo "   • Skulltalker (Character 4)"
echo "   • Any other animatronic characters"
echo ""
echo "✅ Hardware WebSocket services startup complete!"
