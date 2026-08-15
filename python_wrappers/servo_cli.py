#!/usr/bin/env python3

"""
Servo CLI Wrapper for MonsterBox 5.5
Thin wrapper around existing servo control functionality
"""

import sys
import os
import time
import json

# Import PCA9685 control module from main codebase
try:
    from pca9685_control import (
        pca9685_set_angle,
        pca9685_set_pulse_width,
        pca9685_continuous_rotation,
        PCA9685_DEFAULT_ADDRESS
    )
    PCA9685_AVAILABLE = True
except Exception as e:
    PCA9685_AVAILABLE = False
    print(f"Error importing pca9685_control: {e}", file=sys.stderr)

# GPIO control availability (for direct GPIO servos)
try:
    import lgpio
    GPIO_AVAILABLE = True
except Exception as e:
    GPIO_AVAILABLE = False
    print(f"Error importing lgpio: {e}", file=sys.stderr)

# Servo control availability flags (depend on lgpio for GPIO-based servo control)
SERVO_CONTROL_AVAILABLE = GPIO_AVAILABLE
SERVO_SERVICE_AVAILABLE = GPIO_AVAILABLE

def simulate_servo_command(command, *args):
    """Simulate servo command for testing without hardware"""
    print(f"🎭 SIMULATION: Servo {command} with args: {args}")
    time.sleep(0.1)  # Simulate execution time
    return "success"

def move_to(channel, pulse_us, duration_ms=1000):
    """Move servo to specific pulse width (real hardware via lgpio)"""
    try:
        channel = int(channel)
        pulse_us = int(pulse_us)
        duration_ms = int(duration_ms)

        if not GPIO_AVAILABLE:
            print(json.dumps({"status": "error", "message": "lgpio not available for GPIO servo control"}))
            return "error"

        # Use lgpio for direct GPIO servo control.
        # The handle is closed in finally so an mid-move error can't leak it —
        # test_servo() calls move_to() four times in one process.
        h = lgpio.gpiochip_open(0)
        try:
            lgpio.gpio_claim_output(h, channel)

            # Use lgpio's servo function
            lgpio.tx_servo(h, channel, pulse_us, 50, 0, 0)

            # Allow time for servo to move
            time.sleep(duration_ms / 1000.0)

            # Stop servo
            lgpio.tx_servo(h, channel, 0)
        finally:
            try:
                lgpio.gpiochip_close(h)
            except Exception:
                pass

        print(json.dumps({"status": "success", "message": f"GPIO servo on pin {channel} set to {pulse_us}µs"}))
        return "success"

    except Exception as e:
        print(f"Error in move_to: {e}", file=sys.stderr)
        return "error"

def rotate_continuous(channel, direction, speed, duration_ms):
    """Rotate continuous servo (best-effort using lgpio pulses)."""
    try:
        channel = int(channel)
        speed = int(speed)
        duration_ms = int(duration_ms)

        if direction not in ['cw', 'ccw', 'stop']:
            raise ValueError(f"Invalid direction: {direction}")

        if not SERVO_CONTROL_AVAILABLE:
            print(json.dumps({"status": "error", "message": "servo_control not available (lgpio or deps missing)"}))
            return "error"

        # Convert direction/speed to pulse width around neutral (1500us)
        if direction == 'stop':
            pulse_us = 1500
        elif direction == 'cw':
            pulse_us = 1500 - (speed * 3)  # Clockwise
        else:  # ccw
            pulse_us = 1500 + (speed * 3)  # Counter-clockwise

        # Map direction/speed to pulse width and use lgpio servo control
        pulse_clamped = max(500, min(2400, pulse_us))

        h = lgpio.gpiochip_open(0)
        try:
            lgpio.gpio_claim_output(h, channel)
            lgpio.tx_servo(h, channel, pulse_clamped, 50, 0, 0)

            # Hold for requested duration
            time.sleep(min(duration_ms / 1000.0, 5.0))

            # Stop servo — always attempted, even if the hold above raised
            lgpio.tx_servo(h, channel, 0)
        finally:
            try:
                lgpio.gpiochip_close(h)
            except Exception:
                pass

        print(json.dumps({"status": "success", "message": f"GPIO continuous servo on pin {channel} rotated {direction} at speed {speed}"}))
        return "success"

    except Exception as e:
        print(f"Error in rotate_continuous: {e}", file=sys.stderr)
        return "error"


# ------- PCA9685 wrappers -------

def move_to_pca(channel, angle_deg, address=None):
    """Move PCA9685 servo channel to angle (deg)."""
    try:
        if not PCA9685_AVAILABLE:
            print(json.dumps({"status": "error", "message": "PCA9685 control not available (smbus or deps missing)"}))
            return "error"
        if address is None:
            address = PCA9685_DEFAULT_ADDRESS
        pca9685_set_angle(int(channel), float(angle_deg), address, "standard")
        return "success"
    except Exception as e:
        print(f"Error in move_to_pca: {e}", file=sys.stderr)
        return "error"


def batch_pca(pairs, address=None):
    """Move multiple PCA9685 servo channels to angles in a single call.

    pairs: list of (channel, angle_deg) tuples
    This avoids repeated Python startup overhead for multi-servo poses.
    """
    try:
        if not PCA9685_AVAILABLE:
            print(json.dumps({"status": "error", "message": "PCA9685 control not available"}))
            return "error"
        if address is None:
            address = PCA9685_DEFAULT_ADDRESS
        results = []
        for ch, angle in pairs:
            try:
                pca9685_set_angle(int(ch), float(angle), address, "standard")
                results.append({"channel": int(ch), "angle": float(angle), "status": "success"})
            except Exception as e:
                results.append({"channel": int(ch), "angle": float(angle), "status": "error", "error": str(e)})
        print(json.dumps({"status": "success", "results": results}))
        return "success"
    except Exception as e:
        print(f"Error in batch_pca: {e}", file=sys.stderr)
        return "error"


def rotate_continuous_pca(channel, direction, speed, duration_ms, address=None):
    """Rotate continuous servo via PCA9685 using direct PWM control.

    For continuous rotation, maintains PWM during the specified duration.
    For 'stop' command, sets neutral pulse and optionally turns off PWM.
    """
    try:
        if not PCA9685_AVAILABLE:
            print(json.dumps({"status": "error", "message": "PCA9685 control not available (smbus or deps missing)"}))
            return "error"
        if direction not in ['cw', 'ccw', 'stop']:
            raise ValueError(f"Invalid direction: {direction}")
        if address is None:
            address = PCA9685_DEFAULT_ADDRESS

        ch = int(channel)
        spd = max(0, min(100, int(speed)))
        dur_s = max(0.0, int(duration_ms) / 1000.0)

        # GoBilda 2000-series spec (Continuous): 900–2100µs active range, 1500µs neutral
        # Direction: Clockwise with increasing PWM signal
        neutral = 1500
        min_active = 900   # CCW at full speed
        max_active = 2100  # CW at full speed

        if direction == 'stop':
            pulse_us = neutral
        elif direction == 'cw':
            # CW: 1500µs (stop) to 2100µs (full speed CW)
            pulse_us = int(round(neutral + (max_active - neutral) * (spd / 100.0)))
        else:  # ccw
            # CCW: 1500µs (stop) to 900µs (full speed CCW)
            pulse_us = int(round(neutral - (neutral - min_active) * (spd / 100.0)))

        # Clamp to GoBilda active range for continuous mode
        pulse_us = max(min_active, min(max_active, pulse_us))

        # Convert microseconds to 0..4095 off-count for 50Hz (20ms period)
        def us_to_off(p):
            return int(max(0, min(4095, (p / 20000.0) * 4096)))

        # Use the new PCA9685 continuous rotation function
        pca9685_continuous_rotation(ch, direction, spd, duration_ms, address)

        return "success"
    except Exception as e:
        print(f"Error in rotate_continuous_pca: {e}", file=sys.stderr)
        return "error"


def move_to_pca_multi(channel, angle_deg, address=None):
    """Move PCA9685 servo to multi-turn angle (0-1800°) for GoBilda 2000-series positional mode.

    Uses 500-2500µs pulse range for up to 5 turns (1800°) of rotation.
    Maintains PWM briefly to allow movement, then optionally turns off.
    """
    try:
        if not PCA9685_AVAILABLE:
            print(json.dumps({"status": "error", "message": "PCA9685 control not available (smbus or deps missing)"}))
            return "error"
        if address is None:
            address = PCA9685_DEFAULT_ADDRESS

        # Convert multi-turn angle to pulse width and use the new control module
        # GoBilda 2000-series spec (Positional): 500-2500µs for 0-1800° (5 turns)
        angle = max(0.0, min(1800.0, float(angle_deg)))  # Clamp to 0-1800° range
        min_pulse = 500
        max_pulse = 2500
        angle_range = 1800.0
        pulse_us = int(round(min_pulse + (angle / angle_range) * (max_pulse - min_pulse)))

        # Use the new PCA9685 pulse width function for multi-turn servos
        pca9685_set_pulse_width(int(channel), pulse_us, address, "feedback")

        return "success"
    except Exception as e:
        print(f"Error in move_to_pca_multi: {e}", file=sys.stderr)
        return "error"


def test_servo(channel):
    """Test servo connectivity"""
    try:
        channel = int(channel)

        if not SERVO_SERVICE_AVAILABLE:
            print(json.dumps({"status":"error","message":"Servo service unavailable"}))
            return "error"

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
        print("  move_to <gpio_pin> <pulse_us> [duration_ms]", file=sys.stderr)
        print("  rotate_continuous <gpio_pin> <direction> <speed> <duration_ms>", file=sys.stderr)
        print("  move_to_pca <channel> <angle_deg> [i2c_address]", file=sys.stderr)
        print("  move_to_pca_multi <channel> <angle_deg> [i2c_address]", file=sys.stderr)
        print("  rotate_continuous_pca <channel> <direction> <speed> <duration_ms> [i2c_address]", file=sys.stderr)
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

        elif command == "move_to_pca":
            if len(args) < 2:
                raise ValueError("move_to_pca requires channel and angle_deg")
            channel, angle_deg = int(args[0]), float(args[1])
            address = int(args[2], 0) if len(args) > 2 else PCA9685_DEFAULT_ADDRESS
            result = move_to_pca(channel, angle_deg, address)

        elif command == "move_to_pca_multi":
            if len(args) < 2:
                raise ValueError("move_to_pca_multi requires channel and angle_deg")
            channel, angle_deg = int(args[0]), float(args[1])
            address = int(args[2], 0) if len(args) > 2 else PCA9685_DEFAULT_ADDRESS
            result = move_to_pca_multi(channel, angle_deg, address)

        elif command == "rotate_continuous_pca":
            if len(args) < 4:
                raise ValueError("rotate_continuous_pca requires channel, direction, speed, duration_ms")
            channel, direction, speed, duration_ms = int(args[0]), args[1], int(args[2]), int(args[3])
            address = int(args[4], 0) if len(args) > 4 else PCA9685_DEFAULT_ADDRESS
            result = rotate_continuous_pca(channel, direction, speed, duration_ms, address)

        elif command == "batch_pca":
            # Args: ch1:angle1 ch2:angle2 ... [address]
            if len(args) < 1:
                raise ValueError("batch_pca requires at least one channel:angle pair")
            pairs = []
            address = PCA9685_DEFAULT_ADDRESS
            for a in args:
                if ':' in a:
                    ch, ang = a.split(':', 1)
                    pairs.append((int(ch), float(ang)))
                else:
                    # Last non-pair arg is address
                    address = int(a, 0)
            result = batch_pca(pairs, address)

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
