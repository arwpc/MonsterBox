#!/usr/bin/env python3

"""
PCA9685 Control Module for MonsterBox

Two ways to reach the chip, in strict order of preference:

  1. The shared servo daemon (python_wrappers/servo_daemon.py). One long-lived
     process owns the I2C bus for the whole box. Every command from every other
     process is forwarded to it over a Unix socket, so the chip is configured
     exactly once and multiple channels can be driven together without any of
     them disturbing the others.

  2. Direct I2C from this process, used only when the daemon is unreachable.

Why the daemon matters (measured on a reference node, v9.2.0):
  pca9685_init has to drive MODE1 to 0x10 (SLEEP) to change the prescaler, and
  SLEEP stops the oscillator, which kills the PWM output on ALL SIXTEEN channels
  for the length of that write. Since every servo command used to be a brand new
  process, and each new process re-initialised the chip, every single servo move
  blanked every other servo. Sampling the head channel while commanding an
  unrelated channel showed 53 no-pulse reads and 11 SLEEP entries in 8 seconds.
  That is the head twitch.

The direct path is fixed too, so the fallback is safe on its own:
  * init is now NON-DESTRUCTIVE. The chip is probed first, and if it is already
    running at the right prescale it is adopted as-is — no reset, no SLEEP, no
    glitch. The full sequence only runs on a genuinely unconfigured chip.
  * channel writes are a single atomic 4-byte block write. Four separate byte
    writes let a concurrent writer interleave and let the chip act on a low byte
    from one command paired with a high byte from another.
"""

import json
import time
import os
import socket
import sys
import atexit

# PCA9685 Constants
PCA9685_DEFAULT_ADDRESS = 0x40
PCA9685_MODE1 = 0x00
PCA9685_PRESCALE = 0xFE
PCA9685_LED0_ON_L = 0x06

MODE1_RESTART = 0x80
MODE1_AI = 0x20
MODE1_SLEEP = 0x10

# 50Hz servo frame: 20ms period across 4096 steps.
PWM_FREQ_HZ = 50
PERIOD_US = 20000.0
PWM_STEPS = 4096.0

# Standard servo pulse window: 0deg = 500us, 180deg = 2400us.
SERVO_MIN_US = 500.0
SERVO_MAX_US = 2400.0

# Unix socket the shared servo daemon listens on.
SERVO_SOCKET_PATH = os.environ.get('MB_SERVO_SOCKET', '/tmp/monsterbox-servo.sock')

# Set by servo_daemon.py in its own process so it never tries to call itself.
_IS_DAEMON = os.environ.get('MB_SERVO_DAEMON') == '1'

# Cached bus instances keyed by I2C address
_bus_cache = {}

# Addresses this process has already confirmed configured.
_configured = set()

# Remembered result of the daemon probe: None = not tried, False = unreachable.
_daemon_available = None


def log_message(msg_dict):
    """Log structured message to stdout"""
    print(json.dumps(msg_dict))


def validate_channel(channel):
    """Validate PCA9685 channel (0-15)"""
    channel = int(channel)
    if not 0 <= channel <= 15:
        raise ValueError(f"Channel must be 0-15, got {channel}")
    return channel


def expected_prescale(freq_hz=PWM_FREQ_HZ):
    """Prescale register value for the given PWM frequency (25MHz internal osc)."""
    val = int(round(25000000.0 / (PWM_STEPS * freq_hz)) - 1)
    return max(3, min(255, val))


def angle_to_off(angle_deg):
    """Standard-servo angle (deg) -> PCA9685 off-count. Always clamped 0-180."""
    angle_deg = max(0.0, min(180.0, float(angle_deg)))
    pulse_us = (angle_deg / 180.0) * (SERVO_MAX_US - SERVO_MIN_US) + SERVO_MIN_US
    return us_to_off(pulse_us)


def us_to_off(pulse_us):
    """Pulse width (us) -> PCA9685 off-count, clamped to the 12-bit range."""
    off_value = int((float(pulse_us) / PERIOD_US) * PWM_STEPS)
    return max(0, min(4095, off_value))


# ---------------------------------------------------------------------------
# Low-level bus primitives — shared with servo_daemon.py so there is exactly one
# implementation of "how MonsterBox talks to a PCA9685".
# ---------------------------------------------------------------------------

def open_bus(bus_num=1):
    """Open the I2C bus, preferring smbus2 and falling back to smbus."""
    try:
        import smbus2
        return smbus2.SMBus(bus_num)
    except ImportError:
        import smbus
        return smbus.SMBus(bus_num)


def chip_is_configured(bus, i2c_address, freq_hz=PWM_FREQ_HZ):
    """True if the chip is already awake at the right prescale.

    Read-only. This is what makes init non-destructive: if the answer is yes
    there is no reason to touch MODE1 or PRESCALE at all, and therefore no
    reason to glitch the fifteen channels we are not addressing.
    """
    try:
        mode1 = bus.read_byte_data(i2c_address, PCA9685_MODE1)
        prescale = bus.read_byte_data(i2c_address, PCA9685_PRESCALE)
    except OSError:
        return False
    if mode1 & MODE1_SLEEP:
        return False
    return prescale == expected_prescale(freq_hz)


def ensure_chip(bus, i2c_address, freq_hz=PWM_FREQ_HZ):
    """Bring the chip to a known-good state with the least possible disturbance.

    Returns 'adopted' if it was already running (nothing disruptive written) or
    'initialized' if the full reset/prescale sequence had to run.
    """
    if chip_is_configured(bus, i2c_address, freq_hz):
        # Only ensure auto-increment; setting AI does not stop the oscillator.
        mode1 = bus.read_byte_data(i2c_address, PCA9685_MODE1)
        if not mode1 & MODE1_AI:
            bus.write_byte_data(i2c_address, PCA9685_MODE1,
                                (mode1 | MODE1_AI) & ~MODE1_RESTART)
        return 'adopted'

    # Genuinely unconfigured (cold boot, or someone reset it). The SLEEP below
    # is unavoidable here — the prescaler is only writable while asleep — but it
    # now happens once per power cycle instead of once per servo command.
    bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
    bus.write_byte_data(i2c_address, PCA9685_MODE1, MODE1_SLEEP)
    bus.write_byte_data(i2c_address, PCA9685_PRESCALE, expected_prescale(freq_hz))
    bus.write_byte_data(i2c_address, PCA9685_MODE1, 0x00)
    time.sleep(0.005)  # oscillator restart
    bus.write_byte_data(i2c_address, PCA9685_MODE1, MODE1_AI)
    return 'initialized'


def write_channel(bus, i2c_address, channel, on, off):
    """Write one channel's four PWM registers in a single atomic transaction.

    Four separate byte writes are not safe: another writer (or the chip acting
    on a partially-updated pair) can see a low byte from this command with a
    high byte from the previous one, which is a pulse width nobody asked for.
    """
    reg = PCA9685_LED0_ON_L + 4 * int(channel)
    payload = [on & 0xFF, (on >> 8) & 0x0F, off & 0xFF, (off >> 8) & 0x0F]
    try:
        bus.write_i2c_block_data(i2c_address, reg, payload)
    except AttributeError:
        # Very old smbus without block write — degrade rather than fail.
        for offset, value in enumerate(payload):
            bus.write_byte_data(i2c_address, reg + offset, value)


def read_channel(bus, i2c_address, channel):
    """Read one channel's four PWM registers. Returns (on, off).

    Read-only on purpose: startup reconciliation needs to see what a channel is
    actually being driven at (ch15 sat at a 1924us pulse for a whole session with
    no part mapped to it) without disturbing any channel to find out.
    """
    reg = PCA9685_LED0_ON_L + 4 * int(channel)
    try:
        data = bus.read_i2c_block_data(i2c_address, reg, 4)
    except AttributeError:
        data = [bus.read_byte_data(i2c_address, reg + offset) for offset in range(4)]
    on = (data[0] | ((data[1] & 0x0F) << 8))
    off = (data[2] | ((data[3] & 0x0F) << 8))
    return on, off


def off_to_us(off_count):
    """PCA9685 off-count -> pulse width in microseconds (inverse of us_to_off)."""
    return (float(off_count) / PWM_STEPS) * PERIOD_US


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

    The chip is probed and only initialized if it is not already running, so
    calling this never disturbs channels this process is not addressing.
    """
    if i2c_address in _bus_cache:
        return _bus_cache[i2c_address]

    try:
        bus = open_bus(1)  # Bus 1 for Raspberry Pi 4B I2C
        state = ensure_chip(bus, i2c_address)
        _bus_cache[i2c_address] = bus
        _configured.add(i2c_address)

        if state == 'initialized':
            # Only worth announcing when the chip was actually reset — an
            # adopted chip is the normal, quiet path.
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
        write_channel(bus, i2c_address, channel, on, off)
    except OSError as e:
        # I2C bus error — invalidate cache and let the caller decide.
        if i2c_address in _bus_cache:
            try:
                _bus_cache[i2c_address].close()
            except Exception:
                pass
            del _bus_cache[i2c_address]
        _configured.discard(i2c_address)
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


# ---------------------------------------------------------------------------
# Shared-daemon client
# ---------------------------------------------------------------------------

def daemon_request(payload, timeout=2.0):
    """Send one JSON command to the shared servo daemon.

    Returns the decoded reply, or None if the daemon is not reachable — the
    caller then falls back to driving the bus directly. Never raises for a
    missing daemon: an absent daemon must degrade, not break a servo.
    """
    global _daemon_available

    if _IS_DAEMON or _daemon_available is False:
        return None

    sock = None
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect(SERVO_SOCKET_PATH)
        sock.sendall((json.dumps(payload) + '\n').encode('utf-8'))

        chunks = []
        while True:
            data = sock.recv(4096)
            if not data:
                break
            chunks.append(data)
            if b'\n' in data:
                break
        raw = b''.join(chunks).split(b'\n')[0].decode('utf-8').strip()
        if not raw:
            _daemon_available = False
            return None
        _daemon_available = True
        return json.loads(raw)
    except (OSError, socket.timeout, ValueError):
        # No socket, stale socket, daemon mid-restart — all mean "go direct".
        _daemon_available = False
        return None
    finally:
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass


def daemon_is_available():
    """Cheap probe used by callers that want to report which path they took."""
    reply = daemon_request({"cmd": "ping"}, timeout=0.5)
    return bool(reply and reply.get('status') == 'pong')


# ---------------------------------------------------------------------------
# Public API — unchanged signatures and unchanged stdout contract.
# ---------------------------------------------------------------------------

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

        reply = daemon_request({
            "cmd": "set_angle",
            "channel": channel,
            "angle": float(angle),
            "address": int(i2c_address),
            "release": servo_type != "standard"
        })
        if reply is not None:
            if reply.get('status') != 'ok':
                raise RuntimeError(reply.get('message', 'servo daemon rejected command'))
            log_message({
                "status": "success",
                "message": f"Set servo on channel {channel} to {angle} degrees"
            })
            return

        bus = pca9685_get_bus(i2c_address)
        pca9685_set_pwm(bus, i2c_address, channel, 0, angle_to_off(angle))

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


def pca9685_set_angles(pairs, i2c_address=PCA9685_DEFAULT_ADDRESS):
    """Drive several channels to their angles as one operation.

    pairs: iterable of (channel, angle_deg).

    Through the daemon this is a single request that writes every channel
    back-to-back while holding the bus lock, which is the closest thing to
    simultaneous the hardware allows (~0.3ms apart). Without the daemon it
    degrades to sequential writes on one already-configured bus, which is still
    far better than one process per channel.

    Returns a list of per-channel result dicts.
    """
    pairs = [(validate_channel(ch), max(0.0, min(180.0, float(a)))) for ch, a in pairs]

    reply = daemon_request({
        "cmd": "set_angles",
        "address": int(i2c_address),
        "moves": [{"channel": ch, "angle": a} for ch, a in pairs]
    })
    if reply is not None:
        if reply.get('status') != 'ok':
            raise RuntimeError(reply.get('message', 'servo daemon rejected batch'))
        return reply.get('results', [])

    results = []
    bus = pca9685_get_bus(i2c_address)
    for ch, angle in pairs:
        try:
            pca9685_set_pwm(bus, i2c_address, ch, 0, angle_to_off(angle))
            results.append({"channel": ch, "angle": angle, "status": "success"})
        except Exception as e:
            results.append({"channel": ch, "angle": angle, "status": "error", "error": str(e)})
    return results


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

        reply = daemon_request({
            "cmd": "set_pulse",
            "channel": channel,
            "pulse_us": float(pulse_us),
            "address": int(i2c_address),
            "release": servo_type not in ("standard", "feedback")
        })
        if reply is not None:
            if reply.get('status') != 'ok':
                raise RuntimeError(reply.get('message', 'servo daemon rejected command'))
            log_message({
                "status": "success",
                "message": f"Set servo on channel {channel} to {pulse_us}us pulse width"
            })
            return

        bus = pca9685_get_bus(i2c_address)
        pca9685_set_pwm(bus, i2c_address, channel, 0, us_to_off(pulse_us))

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

    The duration is honoured by THIS process (it sleeps, then releases the
    channel) whether or not the daemon is in play. The daemon is only asked to
    perform the two register writes, so a long rotation can never block servo
    commands for other channels.
    """
    bus = None
    safe_channel = None
    try:
        if direction not in ['cw', 'ccw', 'stop']:
            raise ValueError(f"Invalid direction: {direction}")

        channel = validate_channel(channel)
        safe_channel = channel
        speed = max(0, min(100, int(speed)))
        duration_s = max(0.0, int(duration_ms) / 1000.0)

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

        off_value = us_to_off(pulse_us)

        def write(off):
            reply = daemon_request({
                "cmd": "set_raw",
                "channel": channel,
                "off": int(off),
                "address": int(i2c_address)
            })
            if reply is not None:
                if reply.get('status') != 'ok':
                    raise RuntimeError(reply.get('message', 'servo daemon rejected command'))
                return
            pca9685_set_pwm(pca9685_get_bus(i2c_address), i2c_address, channel, 0, off)

        write(off_value)

        # For continuous motion, maintain PWM during duration
        if direction != 'stop' and duration_s > 0:
            try:
                time.sleep(duration_s)
            finally:
                # Always stop driving, even if the sleep is interrupted — a
                # continuous servo left energized keeps turning.
                write(0)
        elif direction == 'stop':
            # For explicit stop, turn off PWM completely
            write(0)

        log_message({
            "status": "success",
            "message": f"Continuous servo on channel {channel}: {direction} at {speed}%"
        })

    except Exception as e:
        # Fail safe: never leave a continuous servo energized after an error.
        if safe_channel is not None:
            try:
                reply = daemon_request({"cmd": "set_raw", "channel": safe_channel,
                                        "off": 0, "address": int(i2c_address)}, timeout=1.0)
                if reply is None:
                    if bus is None and i2c_address in _bus_cache:
                        bus = _bus_cache[i2c_address]
                    if bus is not None:
                        write_channel(bus, i2c_address, safe_channel, 0, 0)
            except Exception:
                pass
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise
