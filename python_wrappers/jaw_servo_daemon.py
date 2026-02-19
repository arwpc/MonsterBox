#!/usr/bin/env python3

"""
Jaw Servo Daemon for MonsterBox
Persistent PCA9685 process that reads JSON commands from stdin.
Eliminates per-frame Python spawn (~580ms -> <1ms per command).

Protocol (JSON lines on stdin/stdout):
  -> {"cmd":"set_angle","channel":10,"angle":85}
  -> {"cmd":"set_angle","channel":10,"angle":85,"address":64}
  -> {"cmd":"shutdown"}
  <- {"status":"ready"}
  <- {"status":"ok"}
  <- {"status":"error","message":"..."}
"""

import sys
import json
import signal

# PCA9685 Constants (same as pca9685_control.py)
PCA9685_DEFAULT_ADDRESS = 0x40
PCA9685_MODE1 = 0x00
PCA9685_PRESCALE = 0xFE
PCA9685_LED0_ON_L = 0x06

bus = None
initialized_addresses = set()


def send(obj):
    """Write a JSON line to stdout and flush immediately."""
    sys.stdout.write(json.dumps(obj) + '\n')
    sys.stdout.flush()


def init_pca9685(i2c_address):
    """Initialize PCA9685 at the given address (idempotent per address)."""
    global bus
    if i2c_address in initialized_addresses:
        return

    if bus is None:
        import smbus
        bus = smbus.SMBus(1)

    # Reset
    bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
    # Sleep mode for prescale change
    bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x10)
    # 50Hz PWM: prescale = round(25MHz / (4096 * 50)) - 1 = 121
    prescale_val = int(round(25000000.0 / (4096.0 * 50)) - 1)
    prescale_val = max(3, min(255, prescale_val))
    bus.write_byte_data(i2c_address, PCA9685_PRESCALE, prescale_val)
    # Wake up
    bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
    import time
    time.sleep(0.005)
    # Enable auto-increment
    bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x20)

    initialized_addresses.add(i2c_address)


def set_angle(channel, angle_deg, i2c_address=PCA9685_DEFAULT_ADDRESS):
    """Set servo angle via PCA9685 — single I2C write, no sleep."""
    init_pca9685(i2c_address)

    # Clamp angle
    angle_deg = max(0.0, min(180.0, float(angle_deg)))
    channel = int(channel)
    if not 0 <= channel <= 15:
        raise ValueError(f"Channel must be 0-15, got {channel}")

    # Convert angle to pulse width (standard servo: 0°=500µs, 180°=2400µs)
    pulse_us = (angle_deg / 180.0) * (2400 - 500) + 500
    # Convert to PCA9685 off-count (50Hz = 20ms period, 4096 steps)
    off_value = int((pulse_us / 20000.0) * 4096)
    off_value = max(0, min(4095, off_value))

    # Write all 4 registers in one I2C transaction (block write)
    reg = PCA9685_LED0_ON_L + 4 * channel
    bus.write_i2c_block_data(i2c_address, reg, [
        0, 0,                          # ON_L, ON_H (start at 0)
        off_value & 0xFF, off_value >> 8  # OFF_L, OFF_H
    ])


def handle_shutdown(*_args):
    """Clean shutdown."""
    send({"status": "shutdown"})
    sys.exit(0)


def main():
    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    send({"status": "ready"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            send({"status": "error", "message": f"Invalid JSON: {e}"})
            continue

        try:
            action = cmd.get("cmd", "")

            if action == "set_angle":
                channel = cmd["channel"]
                angle = cmd["angle"]
                address = cmd.get("address", PCA9685_DEFAULT_ADDRESS)
                if isinstance(address, str) and address.startswith("0x"):
                    address = int(address, 16)
                else:
                    address = int(address)
                set_angle(channel, angle, address)
                send({"status": "ok"})

            elif action == "shutdown":
                handle_shutdown()

            elif action == "ping":
                send({"status": "pong"})

            else:
                send({"status": "error", "message": f"Unknown command: {action}"})

        except Exception as e:
            send({"status": "error", "message": str(e)})


if __name__ == "__main__":
    main()
