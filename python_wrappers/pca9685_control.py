#!/usr/bin/env python3

"""
PCA9685 Control Module for MonsterBox
Direct hardware control with cached I2C bus to prevent re-initialization storms.

The bus is lazily initialized once per address and reused across calls.
This prevents the PCA9685 from being reset on every servo command, which
was causing servo glitches, I2C bus exhaustion, and eventual crashes after
5-10 minutes of continuous use.
"""

import json
import time
import sys
import atexit

# PCA9685 Constants
PCA9685_DEFAULT_ADDRESS = 0x40
PCA9685_MODE1 = 0x00
PCA9685_PRESCALE = 0xFE
PCA9685_LED0_ON_L = 0x06

# Cached bus instances keyed by I2C address
_bus_cache = {}

def log_message(msg_dict):
    """Log structured message to stdout"""
    print(json.dumps(msg_dict))

def validate_channel(channel):
    """Validate PCA9685 channel (0-15)"""
    channel = int(channel)
    if not 0 <= channel <= 15:
        raise ValueError(f"Channel must be 0-15, got {channel}")
    return channel

def _cleanup_buses():
    """Close all cached I2C bus handles on process exit"""
    for addr, bus in _bus_cache.items():
        try:
            bus.close()
        except Exception:
            pass
    _bus_cache.clear()

atexit.register(_cleanup_buses)

def pca9685_get_bus(i2c_address=PCA9685_DEFAULT_ADDRESS):
    """Get or create a cached I2C bus for the given PCA9685 address.

    Only initializes (resets + sets prescale) on the first call per address.
    Subsequent calls return the same bus handle, avoiding chip resets that
    glitch all 16 channels.
    """
    if i2c_address in _bus_cache:
        return _bus_cache[i2c_address]

    try:
        import smbus
        bus = smbus.SMBus(1)  # Bus 1 for Raspberry Pi 4B I2C

        # Reset
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)

        # Set sleep mode to allow prescale change
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x10)

        # Set prescale for 50Hz PWM frequency
        # prescale = round(osc_clock / (4096 * freq)) - 1  with osc_clock=25MHz
        desired_freq_hz = 50
        prescale_val = int(round(25000000.0 / (4096.0 * desired_freq_hz)) - 1)
        prescale_val = max(3, min(255, prescale_val))
        bus.write_byte_data(i2c_address, PCA9685_PRESCALE, prescale_val)

        # Wake up (turn off sleep mode)
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
        time.sleep(0.005)  # Wait for oscillator

        # Enable auto increment
        bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x20)

        _bus_cache[i2c_address] = bus

        log_message({
            "status": "success",
            "message": f"PCA9685 initialized at address 0x{i2c_address:02x}"
        })

        return bus

    except ImportError:
        log_message({
            "status": "error",
            "message": "smbus library not available. Install with: sudo apt install python3-smbus"
        })
        raise
    except Exception as e:
        log_message({
            "status": "error",
            "message": f"Failed to initialize PCA9685: {str(e)}"
        })
        raise

# Keep backward-compatible alias
def pca9685_init(i2c_address=PCA9685_DEFAULT_ADDRESS):
    """Initialize PCA9685 device (uses cached bus)"""
    return pca9685_get_bus(i2c_address)

def pca9685_set_pwm(bus, i2c_address, channel, on, off):
    """Set PWM for a specific channel on PCA9685"""
    try:
        reg = PCA9685_LED0_ON_L + 4 * channel
        bus.write_byte_data(i2c_address, reg, on & 0xFF)
        bus.write_byte_data(i2c_address, reg+1, on >> 8)
        bus.write_byte_data(i2c_address, reg+2, off & 0xFF)
        bus.write_byte_data(i2c_address, reg+3, off >> 8)
    except OSError as e:
        # I2C bus error — invalidate cache and retry once
        if i2c_address in _bus_cache:
            try:
                _bus_cache[i2c_address].close()
            except Exception:
                pass
            del _bus_cache[i2c_address]
        log_message({
            "status": "error",
            "message": f"I2C error on set_pwm (ch{channel}), bus cache cleared: {str(e)}"
        })
        raise
    except Exception as e:
        log_message({
            "status": "error",
            "message": f"Failed to set PWM: {str(e)}"
        })
        raise

def pca9685_set_angle(channel, angle, i2c_address=PCA9685_DEFAULT_ADDRESS, servo_type="standard"):
    """
    Set servo angle using PCA9685

    Args:
        channel: PCA9685 channel (0-15)
        angle: Angle in degrees (0-180)
        i2c_address: PCA9685 I2C address
        servo_type: Type of servo ("standard", "continuous")
    """
    try:
        if not 0 <= angle <= 180:
            raise ValueError("Angle must be between 0 and 180 degrees")

        channel = validate_channel(channel)
        bus = pca9685_get_bus(i2c_address)

        # Standard servo: 0deg = 500us, 180deg = 2400us
        # 4096 steps per 20ms period
        pulse_width = int((angle / 180.0) * (2400 - 500) + 500)
        off_value = int((pulse_width / 20000.0) * 4096)

        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)

        # Brief settle time (reduced from 500ms — the old value caused sluggish response)
        time.sleep(0.05)

        if servo_type != "standard":
            # For continuous servos, turn off PWM after movement
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)

        log_message({
            "status": "success",
            "message": f"Set servo on channel {channel} to {angle} degrees"
        })

    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

def pca9685_set_pulse_width(channel, pulse_us, i2c_address=PCA9685_DEFAULT_ADDRESS, servo_type="standard"):
    """
    Set servo pulse width directly using PCA9685

    Args:
        channel: PCA9685 channel (0-15)
        pulse_us: Pulse width in microseconds
        i2c_address: PCA9685 I2C address
        servo_type: Type of servo ("standard", "continuous", "feedback")
    """
    try:
        channel = validate_channel(channel)
        bus = pca9685_get_bus(i2c_address)

        off_value = int((pulse_us / 20000.0) * 4096)
        off_value = max(0, min(4095, off_value))

        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)

        # Brief settle time
        time.sleep(0.05)

        if servo_type not in ("standard", "feedback"):
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)

        log_message({
            "status": "success",
            "message": f"Set servo on channel {channel} to {pulse_us}us pulse width"
        })

    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise

def pca9685_continuous_rotation(channel, direction, speed, duration_ms, i2c_address=PCA9685_DEFAULT_ADDRESS):
    """
    Control continuous rotation servo via PCA9685

    Args:
        channel: PCA9685 channel (0-15)
        direction: 'cw', 'ccw', or 'stop'
        speed: Speed percentage (0-100)
        duration_ms: Duration in milliseconds
        i2c_address: PCA9685 I2C address
    """
    try:
        if direction not in ['cw', 'ccw', 'stop']:
            raise ValueError(f"Invalid direction: {direction}")

        channel = validate_channel(channel)
        speed = max(0, min(100, int(speed)))
        duration_s = max(0.0, int(duration_ms) / 1000.0)

        bus = pca9685_get_bus(i2c_address)

        # Standard continuous servo range: 1000-2000us, 1500us neutral
        neutral = 1500
        min_pulse = 1000
        max_pulse = 2000

        if direction == 'stop':
            pulse_us = neutral
        elif direction == 'cw':
            pulse_us = int(round(neutral + (max_pulse - neutral) * (speed / 100.0)))
        else:  # ccw
            pulse_us = int(round(neutral - (neutral - min_pulse) * (speed / 100.0)))

        off_value = int((pulse_us / 20000.0) * 4096)
        off_value = max(0, min(4095, off_value))

        pca9685_set_pwm(bus, i2c_address, channel, 0, off_value)

        # For continuous motion, maintain PWM during duration
        if direction != 'stop' and duration_s > 0:
            time.sleep(duration_s)
            # After duration, turn off PWM (don't send neutral to avoid recentring)
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)
        elif direction == 'stop':
            # For explicit stop, turn off PWM completely
            pca9685_set_pwm(bus, i2c_address, channel, 0, 0)

        log_message({
            "status": "success",
            "message": f"Continuous servo on channel {channel}: {direction} at {speed}%"
        })

    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise
