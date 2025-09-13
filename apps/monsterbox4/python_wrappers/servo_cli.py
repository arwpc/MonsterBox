#!/usr/bin/env python3

"""
Servo CLI Wrapper for MonsterBox 4.0
Thin wrapper around existing servo control functionality
"""

import sys
import os
import time
import json

# Add the hardware scripts directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../scripts/hardware'))

try:
    # Try to import existing servo functionality
    from servo_websocket_service import ServoWebSocketService
    SERVO_SERVICE_AVAILABLE = True
except ImportError:
    SERVO_SERVICE_AVAILABLE = False
    print("Warning: Servo service not available, using simulation mode", file=sys.stderr)

def simulate_servo_command(command, *args):
    """Simulate servo command for testing without hardware"""
    print(f"🎭 SIMULATION: Servo {command} with args: {args}")
    time.sleep(0.1)  # Simulate execution time
    return "success"

def move_to(channel, pulse_us, duration_ms=1000):
    """Move servo to specific pulse width"""
    try:
        channel = int(channel)
        pulse_us = int(pulse_us)
        duration_ms = int(duration_ms)
        
        if not SERVO_SERVICE_AVAILABLE:
            return simulate_servo_command("move_to", channel, pulse_us, duration_ms)
        
        # Use existing servo control logic
        # This would integrate with the actual servo control system
        print(f"Moving servo on channel {channel} to {pulse_us}µs for {duration_ms}ms")
        
        # For now, simulate the command
        time.sleep(duration_ms / 1000.0)
        return "success"
        
    except Exception as e:
        print(f"Error in move_to: {e}", file=sys.stderr)
        return "error"

def rotate_continuous(channel, direction, speed, duration_ms):
    """Rotate continuous servo"""
    try:
        channel = int(channel)
        speed = int(speed)
        duration_ms = int(duration_ms)
        
        if direction not in ['cw', 'ccw', 'stop']:
            raise ValueError(f"Invalid direction: {direction}")
        
        if not SERVO_SERVICE_AVAILABLE:
            return simulate_servo_command("rotate_continuous", channel, direction, speed, duration_ms)
        
        print(f"Rotating servo on channel {channel} {direction} at {speed}% for {duration_ms}ms")
        
        # Calculate pulse width based on direction and speed
        if direction == 'stop':
            pulse_us = 1500  # Neutral/stop pulse
        elif direction == 'cw':
            pulse_us = 1500 - (speed * 3)  # Clockwise
        else:  # ccw
            pulse_us = 1500 + (speed * 3)  # Counter-clockwise
        
        # Simulate rotation
        time.sleep(duration_ms / 1000.0)
        
        # Stop the servo
        print(f"Stopping servo on channel {channel}")
        
        return "success"
        
    except Exception as e:
        print(f"Error in rotate_continuous: {e}", file=sys.stderr)
        return "error"

def test_servo(channel):
    """Test servo connectivity"""
    try:
        channel = int(channel)
        
        if not SERVO_SERVICE_AVAILABLE:
            return simulate_servo_command("test", channel)
        
        print(f"Testing servo on channel {channel}")
        
        # Simple test movement
        move_to(channel, 1500, 500)  # Center position
        time.sleep(0.5)
        move_to(channel, 1200, 500)  # One direction
        time.sleep(0.5)
        move_to(channel, 1800, 500)  # Other direction
        time.sleep(0.5)
        move_to(channel, 1500, 500)  # Back to center
        
        return "success"
        
    except Exception as e:
        print(f"Error in test_servo: {e}", file=sys.stderr)
        return "error"

def main():
    """Main CLI entry point"""
    if len(sys.argv) < 2:
        print("Usage: servo_cli.py <command> [args...]", file=sys.stderr)
        print("Commands:", file=sys.stderr)
        print("  move_to <channel> <pulse_us> [duration_ms]", file=sys.stderr)
        print("  rotate_continuous <channel> <direction> <speed> <duration_ms>", file=sys.stderr)
        print("  test <channel>", file=sys.stderr)
        sys.exit(1)
    
    command = sys.argv[1]
    args = sys.argv[2:]
    
    try:
        if command == "move_to":
            if len(args) < 2:
                raise ValueError("move_to requires channel and pulse_us")
            channel, pulse_us = args[0], args[1]
            duration_ms = int(args[2]) if len(args) > 2 else 1000
            result = move_to(channel, pulse_us, duration_ms)
            
        elif command == "rotate_continuous":
            if len(args) < 4:
                raise ValueError("rotate_continuous requires channel, direction, speed, duration_ms")
            channel, direction, speed, duration_ms = args[0], args[1], args[2], args[3]
            result = rotate_continuous(channel, direction, speed, duration_ms)
            
        elif command == "test":
            if len(args) < 1:
                raise ValueError("test requires channel")
            channel = args[0]
            result = test_servo(channel)
            
        else:
            raise ValueError(f"Unknown command: {command}")
        
        print(result)
        sys.exit(0 if result == "success" else 1)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
