#!/usr/bin/env python3

"""
Servo CLI Wrapper for MonsterBox

CLI contract (unchanged — services/hardwareService and the calibration adapters
depend on the argv shape exactly as it is):
  move_to <gpio_pin> <pulse_us> [duration_ms]
  rotate_continuous <gpio_pin> <direction> <speed> <duration_ms>
  move_to_pca <channel> <angle_deg> [i2c_address]
  move_to_pca_multi <channel> <angle_deg> [i2c_address]
  set_duty_pca <channel> <duty_pct> [i2c_address]
  get_duty_pca <channel> [i2c_address]
  rotate_continuous_pca <channel> <direction> <speed> <duration_ms> [i2c_address]
  batch_pca <ch:angle> [<ch:angle> ...] [i2c_address]
  test <channel>
  set_duty_pca <channel> <duty_pct> [i2c_address]   lights/relays: steady level
  get_duty_pca <channel> [i2c_address]              read a channel's duty back
  release <channel> [i2c_address]           (new) de-energize ONE channel
  reconcile [i2c_address] [--release-unmapped]  (new) audit driven channels
  probe <gpio_pin>                          is a GPIO servo signal line electrically healthy?

Two things changed underneath, and both are deliberate:

1. SAFETY IS ENFORCED HERE TOO. config/hardware-safety.json used to be applied
   only by Node, so a direct `servo_cli.py move_to_pca 4 170` walked straight
   past a blockAllMotion quarantine. This wrapper now re-reads the same
   committed config and refuses / clamps on its own. It can only narrow what
   Node already decided.

2. STDOUT IS THE RESULT CHANNEL — exactly one JSON envelope, printed once.
   pca9685_control's log_message() is rebound to stderr for this process only,
   so its progress logs no longer share stdout with the result.

Note on release: shutdown deliberately leaves servos holding their position,
because releasing everything drops the head under gravity. `release` is
therefore explicit and per-channel, and `reconcile` reports by default and only
releases channels with NO part mapped to them, and only when asked.
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mb_response import (  # noqa: E402
    E_ARGS,
    E_BUS_IO,
    E_UNSUPPORTED,
    WrapperError,
    clamp_record,
    classify,
    emit,
    emit_error,
    log,
    warn,
)
import mb_safety  # noqa: E402

# Import PCA9685 control module from main codebase
try:
    import pca9685_control
    from pca9685_control import (
        pca9685_set_angle,
        pca9685_set_pulse_width,
        pca9685_continuous_rotation,
        PCA9685_DEFAULT_ADDRESS,
    )
    PCA9685_AVAILABLE = True

    # stdout belongs to the single result envelope. pca9685_control logs its
    # progress with log_message(), which prints to stdout; rebinding it here
    # keeps those lines (still useful) on stderr without changing that module
    # for the daemon or the sampler, which have their own stdout contracts.
    pca9685_control.log_message = lambda payload: log(
        payload.get('message', payload), payload.get('status', 'info'))
except Exception as _import_error:  # pragma: no cover - depends on node deps
    PCA9685_AVAILABLE = False
    PCA9685_DEFAULT_ADDRESS = 0x40
    warn(f'pca9685_control unavailable: {_import_error}')

# GPIO control availability (for direct GPIO servos)
try:
    import lgpio
    GPIO_AVAILABLE = True
except Exception as _lgpio_error:  # pragma: no cover - depends on node deps
    GPIO_AVAILABLE = False
    warn(f'lgpio unavailable: {_lgpio_error}')

SERVO_CONTROL_AVAILABLE = GPIO_AVAILABLE
SERVO_SERVICE_AVAILABLE = GPIO_AVAILABLE

# Resolved once per process; every command needs it to find its part.
CHARACTER_ID = None


def _character():
    global CHARACTER_ID
    if CHARACTER_ID is None:
        CHARACTER_ID = mb_safety.resolve_character_id()
    return CHARACTER_ID


def _require_pca():
    if not PCA9685_AVAILABLE:
        raise WrapperError(
            E_UNSUPPORTED,
            'PCA9685 control is not available on this node',
            hint='Install python3-smbus / smbus2 and confirm I2C is enabled '
                 '(`sudo raspi-config`, then `i2cdetect -y 1`).')


def _require_gpio():
    if not GPIO_AVAILABLE:
        raise WrapperError(
            E_UNSUPPORTED,
            'lgpio is not available on this node',
            hint='Install the lgpio python module to drive GPIO servos.')


def _int_arg(value, name):
    try:
        return int(value)
    except (TypeError, ValueError):
        raise WrapperError(E_ARGS, f'{name} must be an integer, got {value!r}')


def _float_arg(value, name):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise WrapperError(E_ARGS, f'{name} must be a number, got {value!r}')


# ---------------------------------------------------------------------------
# GPIO line helpers
# ---------------------------------------------------------------------------

CLAIM_RETRY_S = 1.5          # the default hold; longer holds (a long scene step) still
                             # fail E_BUSY after this — a 1.5 s stall is the most a
                             # calibration slider or pose should ever queue behind
CLAIM_RETRY_STEP_S = 0.025
SIGNAL_RISE_LIMIT_US = 200   # a free pad reads back high in ~10-25 us (measured, Pi 5)
SIGNAL_PROBE_MAX_US = 400    # shorter than any servo's minimum pulse, so the probe can
                             # never be decoded as a command, loaded line or not


def _claim_output(handle, pin, timeout_s=CLAIM_RETRY_S):
    """Claim `pin` as an output, waiting out a sibling that still holds it.

    move_to holds its pin for the whole hold time, so two calls a few hundred
    ms apart (a calibration slider, a scene's scribble beat) collided with
    lgpio's 'GPIO busy' and the second move was reported as a failure
    (Renfield's Writing Pen, 2026-09-26). Waiting the length of one hold turns
    the collision into a short queue; a pin that stays busy longer than that
    is genuinely owned by something else and still fails, as E_BUSY.
    """
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            lgpio.gpio_claim_output(handle, pin)
            return
        except Exception as exc:  # lgpio.error carries text, not a code
            if 'busy' not in str(exc).lower() or time.monotonic() >= deadline:
                raise
            time.sleep(CLAIM_RETRY_STEP_S)


def _signal_line_check(handle, pin, announce=True):
    """Drive the claimed pin high and time how long the pad takes to READ high.

    A servo signal input is high impedance, so a healthy line reads back high
    within ~25 us. Renfield's Writing Pen (2026-09-26): lgpio, the kernel
    pwm-gpio driver and a busy-wait bit-bang all measured ~700 us SHORT on
    GPIO 20 while reporting success, because the wire was loading the pad —
    1040 us to read high (and ~975 us to read low again) against 15 us on a
    free pin: a capacitor-class load, the signature of the pin sitting on a
    servo's supply lead rather than its signal input. Pulses under ~1.1 ms
    never reached a valid level at all, so the servo sat at one end whatever
    angle was asked.

    The verdict rests on the last read that came back LOW, never on the clock:
    a preempted process that reads high on its first look has no evidence of a
    slow pad and is called healthy. The probe pulse ends the moment the pad
    reads high (a few us on a good line) and is capped at SIGNAL_PROBE_MAX_US,
    under any servo's minimum pulse, so it can never be decoded as a command.

    Returns (rise_us or None, warning or None). Advisory: the move still runs,
    because the operator needs the pulses on the pin while they fix the wire.
    """
    rise_us = None
    last_low_us = None
    start = time.perf_counter()
    try:
        lgpio.gpio_write(handle, pin, 1)
        while (time.perf_counter() - start) * 1e6 < SIGNAL_PROBE_MAX_US:
            now_us = (time.perf_counter() - start) * 1e6
            if lgpio.gpio_read(handle, pin) == 1:
                rise_us = int(now_us)
                break
            last_low_us = now_us
    finally:
        lgpio.gpio_write(handle, pin, 0)
    # Healthy unless the pad was actually SEEN low past the limit.
    if last_low_us is None or last_low_us <= SIGNAL_RISE_LIMIT_US:
        return (rise_us if rise_us is not None else 0), None
    seen = f'{rise_us} us' if rise_us is not None else f'over {SIGNAL_PROBE_MAX_US} us'
    warning = (f'GPIO {pin} signal line is loaded: the pad was still low {int(last_low_us)} us '
               f'after being driven high and took {seen} to read high (a free pin takes '
               f'~15 us). Short pulses (under ~1 ms, the bottom of the travel) are '
               f'shortened or lost; longer ones arrive nearly full width at the 12 mA '
               f'drive this wrapper sets on a Pi 5. If the servo still does not move, '
               f'its input needs a 5 V push-pull buffer, or use a lighter servo.')
    if announce:
        warn(warning)
    return rise_us, warning


def _with_line_warning(message, warning):
    return f'{message} — WARNING: {warning}' if warning else message


# Raspberry Pi 5 (RP1) pad drive strength. RP1 pads default to 4 mA, and a servo
# whose signal input is heavier than a bare CMOS pin (Renfield's MG90S, 2026-09-27)
# turned that into a ~1 ms edge: 1450 us commanded arrived as ~770 us and the pen
# never moved, while a 5 V bench tester with a strong push-pull output drove it
# fine. At 12 mA the same pin delivers 1450 -> ~1360 us and 2400 -> ~2380 us.
# There is no reason for a servo signal line to sit at 4 mA, so every GPIO servo
# command on an RP1 board raises its pin to the maximum before driving. The pad
# register survives lgpio's line claim (measured) and is only ever written when
# /dev/gpiomem0 exists, i.e. on a Pi 5; other boards are untouched.
RP1_GPIOMEM = '/dev/gpiomem0'
RP1_PADS_BANK0 = 0x20000          # inside the /dev/gpiomem0 window (IO_BANK0 at 0)
RP1_GPIOMEM_LEN = 0x30000         # the device refuses shorter mappings (EINVAL)
RP1_DRIVE_CODES = {2: 0, 4: 1, 8: 2, 12: 3}


def _rp1_set_drive(pin, milliamps=12):
    """Set an RP1 GPIO pad's drive strength; returns the mA now set, or None."""
    if not os.path.exists(RP1_GPIOMEM):
        return None
    import mmap
    import struct
    code = RP1_DRIVE_CODES[milliamps]
    fd = None
    mem = None
    try:
        fd = os.open(RP1_GPIOMEM, os.O_RDWR | os.O_SYNC)
        mem = mmap.mmap(fd, RP1_GPIOMEM_LEN, mmap.MAP_SHARED,
                        mmap.PROT_READ | mmap.PROT_WRITE)
        offset = RP1_PADS_BANK0 + 4 + 4 * pin   # +0 is VOLTAGE_SELECT
        mem.seek(offset)
        value = struct.unpack('<I', mem.read(4))[0]
        wanted = (value & ~0x30) | (code << 4)
        if wanted != value:
            mem.seek(offset)
            mem.write(struct.pack('<I', wanted))
        return milliamps
    except Exception as exc:  # noqa: BLE001 - advisory: the move still runs
        warn(f'could not set RP1 drive strength on GPIO {pin}: {exc}')
        return None
    finally:
        if mem is not None:
            mem.close()
        if fd is not None:
            os.close(fd)


# ---------------------------------------------------------------------------
# GPIO servos
# ---------------------------------------------------------------------------

def move_to(pin, pulse_us, duration_ms=1000):
    """Hold a GPIO servo at a pulse width for a duration, then stop driving it."""
    _require_gpio()
    pin = _int_arg(pin, 'gpio_pin')
    pulse_us = _int_arg(pulse_us, 'pulse_us')
    duration_ms = _int_arg(duration_ms, 'duration_ms')

    part = mb_safety.find_part_by_pins(_character(), {'pin': pin, 'gpioPin': pin})
    values, clamps, safety = mb_safety.guard(
        _character(), part, 'move_to', duration_ms=duration_ms)
    duration_ms = int(values['duration_ms'] if values['duration_ms'] is not None else 0)

    with mb_safety.power_group(_character(), safety):
        drive_ma = _rp1_set_drive(pin)
        handle = lgpio.gpiochip_open(0)
        try:
            _claim_output(handle, pin)
            rise_us, line_warning = _signal_line_check(handle, pin)
            lgpio.tx_servo(handle, pin, pulse_us, 50, 0, 0)
            time.sleep(duration_ms / 1000.0)
            lgpio.tx_servo(handle, pin, 0)
        finally:
            # Closed in finally so a mid-move error cannot leak the handle —
            # test() calls this four times in one process.
            try:
                lgpio.gpiochip_close(handle)
            except Exception:
                pass

    return {
        'part': part.get('id') if part else None,
        'data': {'pin': pin, 'pulse_us': pulse_us, 'duration_ms': duration_ms,
                 'signalLine': {'riseUs': rise_us, 'loaded': line_warning is not None,
                                'driveMa': drive_ma},
                 'warning': line_warning},
        'clamps': clamps,
        'message': _with_line_warning(
            f'GPIO servo on pin {pin} set to {pulse_us}us', line_warning),
    }


def rotate_continuous(pin, direction, speed, duration_ms):
    """Rotate a GPIO continuous servo, honouring the requested duration."""
    _require_gpio()
    pin = _int_arg(pin, 'gpio_pin')
    speed = _int_arg(speed, 'speed')
    duration_ms = _int_arg(duration_ms, 'duration_ms')
    if direction not in ('cw', 'ccw', 'stop'):
        raise WrapperError(E_ARGS, f'Invalid direction: {direction}',
                           hint="Use 'cw', 'ccw' or 'stop'.")

    part = mb_safety.find_part_by_pins(_character(), {'pin': pin, 'gpioPin': pin})
    values, clamps, safety = mb_safety.guard(
        _character(), part, 'rotate_continuous',
        speed=speed, duration_ms=duration_ms, direction=direction)
    speed = int(values['speed'])
    duration_ms = int(values['duration_ms'])

    if direction == 'stop':
        pulse_us = 1500
    elif direction == 'cw':
        pulse_us = 1500 - (speed * 3)
    else:
        pulse_us = 1500 + (speed * 3)
    pulse_us = max(500, min(2400, pulse_us))

    # The old code silently truncated the hold to 5s (`min(duration/1000, 5.0)`)
    # and reported success for the full request. Report the clamp instead of
    # inventing one: honour what the safety layer allowed.
    hold_s = max(0.0, duration_ms / 1000.0)

    with mb_safety.power_group(_character(), safety):
        drive_ma = _rp1_set_drive(pin)
        handle = lgpio.gpiochip_open(0)
        try:
            _claim_output(handle, pin)
            rise_us, line_warning = _signal_line_check(handle, pin)
            lgpio.tx_servo(handle, pin, pulse_us, 50, 0, 0)
            time.sleep(hold_s)
        finally:
            # A continuous servo left energized keeps turning — stop first,
            # then release the chip handle, both unconditionally.
            try:
                lgpio.tx_servo(handle, pin, 0)
            except Exception:
                pass
            try:
                lgpio.gpiochip_close(handle)
            except Exception:
                pass

    return {
        'part': part.get('id') if part else None,
        'data': {'pin': pin, 'direction': direction, 'speed': speed,
                 'duration_ms': duration_ms, 'pulse_us': pulse_us,
                 'signalLine': {'riseUs': rise_us, 'loaded': line_warning is not None,
                                'driveMa': drive_ma},
                 'warning': line_warning},
        'clamps': clamps,
        'message': _with_line_warning(
            f'GPIO continuous servo on pin {pin} rotated {direction} at {speed}%',
            line_warning),
    }


# ---------------------------------------------------------------------------
# PCA9685 servos
# ---------------------------------------------------------------------------

def move_to_pca(channel, angle_deg, address=None):
    _require_pca()
    channel = _int_arg(channel, 'channel')
    angle_deg = _float_arg(angle_deg, 'angle_deg')
    address = PCA9685_DEFAULT_ADDRESS if address is None else address

    part = mb_safety.find_part_by_channel(_character(), channel, address)
    values, clamps, safety = mb_safety.guard(
        _character(), part, 'move_to_pca', angle=angle_deg)
    angle_deg = float(values['angle'])

    with mb_safety.power_group(_character(), safety):
        pca9685_set_angle(channel, angle_deg, address, 'standard')

    return {
        'part': part.get('id') if part else None,
        'data': {'channel': channel, 'angle_deg': angle_deg, 'address': int(address)},
        'clamps': clamps,
        'message': f'PCA9685 ch{channel} set to {angle_deg} degrees',
    }


def move_to_pca_multi(channel, angle_deg, address=None):
    """Multi-turn positional servo (GoBilda 2000-series): 500-2500us over 0-1800."""
    _require_pca()
    channel = _int_arg(channel, 'channel')
    angle_deg = _float_arg(angle_deg, 'angle_deg')
    address = PCA9685_DEFAULT_ADDRESS if address is None else address

    part = mb_safety.find_part_by_channel(_character(), channel, address)
    # Multi-turn angles are 0-1800, not a servo travel window, so the configured
    # angle window is not applied here — but a quarantine still refuses.
    _values, clamps, safety = mb_safety.guard(_character(), part, 'move_to_pca_multi')

    clamped = max(0.0, min(1800.0, angle_deg))
    if clamped != angle_deg:
        clamps.append(clamp_record('angleDeg', angle_deg, clamped,
                                   'multi-turn range is 0-1800 degrees'))
    pulse_us = int(round(500 + (clamped / 1800.0) * (2500 - 500)))

    with mb_safety.power_group(_character(), safety):
        pca9685_set_pulse_width(channel, pulse_us, address, 'feedback')

    return {
        'part': part.get('id') if part else None,
        'data': {'channel': channel, 'angle_deg': clamped, 'pulse_us': pulse_us,
                 'address': int(address)},
        'clamps': clamps,
        'message': f'PCA9685 ch{channel} multi-turn to {clamped} degrees',
    }


def rotate_continuous_pca(channel, direction, speed, duration_ms, address=None):
    _require_pca()
    channel = _int_arg(channel, 'channel')
    speed = _int_arg(speed, 'speed')
    duration_ms = _int_arg(duration_ms, 'duration_ms')
    address = PCA9685_DEFAULT_ADDRESS if address is None else address
    if direction not in ('cw', 'ccw', 'stop'):
        raise WrapperError(E_ARGS, f'Invalid direction: {direction}',
                           hint="Use 'cw', 'ccw' or 'stop'.")

    part = mb_safety.find_part_by_channel(_character(), channel, address)
    # A stop is a de-energize, never a hazard — it must not be refused by a
    # quarantine or a no-retract rule, or a runaway part could not be stopped.
    if direction == 'stop':
        clamps = []
        safety = mb_safety.get_part_safety(_character(), part.get('id')) if part else {}
        speed, duration_ms = 0, 0
    else:
        values, clamps, safety = mb_safety.guard(
            _character(), part, 'rotate_continuous_pca',
            speed=speed, duration_ms=duration_ms, direction=direction)
        speed = int(values['speed'])
        duration_ms = int(values['duration_ms'])

    with mb_safety.power_group(_character(), safety):
        if direction == 'stop' and safety.get('blockAllMotion'):
            # Stopping a quarantined part must not first command it. The normal
            # stop writes a 1500us neutral pulse before zeroing, which is still
            # a pulse to (here) a dead servo on a rail whose fuse has blown.
            # Go straight to no-pulse: strictly less energy, equally stopped.
            _release_channel(channel, int(address))
        else:
            pca9685_continuous_rotation(channel, direction, max(0, min(100, speed)),
                                        duration_ms, address)

    return {
        'part': part.get('id') if part else None,
        'data': {'channel': channel, 'direction': direction, 'speed': speed,
                 'duration_ms': duration_ms, 'address': int(address)},
        'clamps': clamps,
        'message': f'PCA9685 ch{channel} continuous {direction} at {speed}%',
    }


def batch_pca(pairs, address=None):
    """Drive several channels in one process (avoids per-move interpreter start).

    Every channel is guarded individually: one blocked part refuses only its own
    channel, the rest of the pose still moves.
    """
    _require_pca()
    address = PCA9685_DEFAULT_ADDRESS if address is None else address

    results = []
    clamps = []
    ok_any = False
    for channel, angle in pairs:
        part = mb_safety.find_part_by_channel(_character(), channel, address)
        try:
            values, ch_clamps, safety = mb_safety.guard(
                _character(), part, 'batch_pca', angle=angle)
        except WrapperError as exc:
            results.append({'channel': channel, 'angle': angle, 'status': 'error',
                            'code': exc.code, 'error': exc.message})
            continue
        clamps.extend(ch_clamps)
        applied = float(values['angle'])
        try:
            with mb_safety.power_group(_character(), safety):
                pca9685_set_angle(channel, applied, address, 'standard')
            results.append({'channel': channel, 'angle': applied, 'status': 'success'})
            ok_any = True
        except Exception as exc:
            classified = classify(exc)
            results.append({'channel': channel, 'angle': applied, 'status': 'error',
                            'code': classified.code, 'error': classified.message})

    if not results:
        raise WrapperError(E_ARGS, 'batch_pca requires at least one channel:angle pair')
    if not ok_any:
        raise WrapperError(
            E_BUS_IO if PCA9685_AVAILABLE else E_UNSUPPORTED,
            'every channel in the batch failed',
            hint='; '.join(r.get('error', '') for r in results if r.get('error')),
            data={'results': results})

    return {
        'part': None,
        'data': {'results': results, 'address': int(address)},
        'clamps': clamps,
        'message': f'{sum(1 for r in results if r["status"] == "success")}/'
                   f'{len(results)} channels moved',
    }


def release_pca(channel, address=None):
    """De-energize ONE PCA9685 channel (off-count 0 = no pulse at all).

    Explicit and per-channel on purpose. Nothing in MonsterBox releases a
    channel implicitly, and nothing should: dropping every channel on shutdown
    would let the head fall under gravity.
    """
    _require_pca()
    channel = _int_arg(channel, 'channel')
    if not 0 <= channel <= 15:
        raise WrapperError(E_ARGS, f'Channel must be 0-15, got {channel}')
    address = PCA9685_DEFAULT_ADDRESS if address is None else address

    part = mb_safety.find_part_by_channel(_character(), channel, address)
    _released_via = _release_channel(channel, int(address))

    return {
        'part': part.get('id') if part else None,
        'data': {'channel': channel, 'address': int(address), 'released': True,
                 'via': _released_via},
        'clamps': [],
        'message': f'PCA9685 ch{channel} released (no pulse)',
    }


def set_duty_pca(channel, duty_pct, address=None):
    """Drive a PCA9685 channel as an on/off (or dimmed) SWITCH, not as a servo.

    Lights, relays and LEDs wired to the PWM chip need a steady level. Routing
    them through move_to_pca meant "on" was a 2400us servo pulse (12% duty) and
    "off" a 500us one (2.5%) — Mina's eye-laser relay latched at neither.
    """
    _require_pca()
    channel = _int_arg(channel, 'channel')
    duty = _float_arg(duty_pct, 'duty_pct')
    if not 0.0 <= duty <= 100.0:
        raise WrapperError(E_ARGS, f'duty_pct must be 0-100, got {duty}')
    address = PCA9685_DEFAULT_ADDRESS if address is None else address

    part = mb_safety.find_part_by_channel(_character(), channel, address)
    pca9685_control.pca9685_set_duty(channel, duty, int(address))

    return {
        'part': part.get('id') if part else None,
        'data': {'channel': channel, 'duty_pct': duty, 'address': int(address),
                 'on': duty > 0},
        'clamps': [],
        'message': f'PCA9685 ch{channel} set to {duty}% duty',
    }


def get_duty_pca(channel, address=None):
    """Read one channel's duty back from the chip — the only honest light state."""
    _require_pca()
    channel = _int_arg(channel, 'channel')
    address = PCA9685_DEFAULT_ADDRESS if address is None else address
    duty = pca9685_control.pca9685_get_duty(channel, int(address))
    part = mb_safety.find_part_by_channel(_character(), channel, address)
    return {
        'part': part.get('id') if part else None,
        'data': {'channel': channel, 'duty_pct': duty, 'address': int(address),
                 'on': duty > 0},
        'clamps': [],
        'message': f'PCA9685 ch{channel} is at {duty}% duty',
    }


def _release_channel(channel, address):
    """Zero one channel, preferring the daemon so the bus keeps one owner."""
    reply = pca9685_control.daemon_request(
        {'cmd': 'release', 'channel': int(channel), 'address': int(address)})
    if reply is not None and reply.get('status') == 'ok':
        return 'daemon'
    bus = pca9685_control.pca9685_get_bus(address)
    pca9685_control.write_channel(bus, address, int(channel), 0, 0)
    return 'direct'


def reconcile(address=None, release_unmapped=False):
    """Audit every PCA9685 channel against parts.json.

    ch15 held a 1924us pulse for an entire session with no part mapped to it and
    nothing ever noticed. This reports what each channel is being driven at and
    which of those channels no part claims. It only releases those unmapped
    channels, and only when explicitly asked — a mapped channel is left holding,
    because that is what keeps the head up.
    """
    _require_pca()
    address = PCA9685_DEFAULT_ADDRESS if address is None else address
    address = int(address)
    character_id = _character()

    mapped = {}
    for part in mb_safety.load_parts(character_id):
        if not isinstance(part, dict):
            continue
        cfg = part.get('config') or {}
        if str(cfg.get('controllerType') or '').lower() != 'pca9685':
            continue
        channel = cfg.get('channel')
        if channel is None:
            continue
        try:
            mapped[int(channel)] = {'partId': part.get('id'), 'name': part.get('name')}
        except (TypeError, ValueError):
            continue

    # Read-only: never disturb a channel just to find out what it is doing.
    try:
        bus = pca9685_control.open_bus(1)
    except Exception as exc:
        raise classify(exc)

    channels = []
    try:
        for channel in range(16):
            try:
                _on, off = pca9685_control.read_channel(bus, address, channel)
            except OSError as exc:
                raise WrapperError(
                    E_BUS_IO, f'cannot read PCA9685 0x{address:02x} ch{channel}: {exc}',
                    hint='Check the I2C address and that the chip is powered '
                         '(`i2cdetect -y 1`).')
            entry = {
                'channel': channel,
                'off': off,
                'pulse_us': round(pca9685_control.off_to_us(off), 1),
                'driven': off > 0,
                'partId': mapped.get(channel, {}).get('partId'),
                'partName': mapped.get(channel, {}).get('name'),
            }
            channels.append(entry)
    finally:
        try:
            bus.close()
        except Exception:
            pass

    unmapped_driven = [c for c in channels if c['driven'] and c['partId'] is None]
    released = []
    if release_unmapped:
        for entry in unmapped_driven:
            try:
                _release_channel(entry['channel'], address)
                released.append(entry['channel'])
                entry['released'] = True
            except Exception as exc:
                entry['released'] = False
                entry['error'] = str(exc)

    warnings = list(mb_safety.validate_power_groups(character_id))
    for entry in unmapped_driven:
        warnings.append(
            f"ch{entry['channel']} is driven at {entry['pulse_us']}us but no part "
            f"of character {character_id} is mapped to it")
    for message in warnings:
        warn(message)

    return {
        'part': None,
        'data': {
            'characterId': character_id,
            'address': address,
            'channels': channels,
            'mappedChannels': sorted(mapped.keys()),
            'unmappedDriven': [c['channel'] for c in unmapped_driven],
            'released': released,
            'warnings': warnings,
        },
        'clamps': [],
        'message': f'{len(channels)} channels audited, '
                   f'{len(unmapped_driven)} driven with no part mapped',
    }


def probe(pin):
    """Report whether a GPIO servo signal line is electrically healthy.

    Two reads, neither of which moves the servo:
      * rise time — driven high, a free pad reads back high in ~15 us; a loaded
        one takes hundreds of us or never (see _signal_line_check). This alone
        decides `loaded`.
      * pull-up read — as an input with the internal (~50 kohm) pull-up for
        20 ms, a free line reads HIGH. Reported as corroboration only: a signal
        input with its own pull-down reads LOW here while being perfectly
        driveable, and a large capacitor reads LOW simply because it has not
        charged yet.
    This is the check that separates "the software sent the pulse" from "the
    servo could have seen it" — the gap every success field hid on 2026-09-26.
    """
    _require_gpio()
    pin = _int_arg(pin, 'gpio_pin')
    part = mb_safety.find_part_by_pins(_character(), {'pin': pin, 'gpioPin': pin})

    drive_ma = _rp1_set_drive(pin)
    handle = lgpio.gpiochip_open(0)
    try:
        lgpio.gpio_claim_input(handle, pin, lgpio.SET_PULL_UP)
        time.sleep(0.02)
        pull_up_high = lgpio.gpio_read(handle, pin) == 1
        lgpio.gpio_free(handle, pin)

        _claim_output(handle, pin)
        rises = []
        warnings = []
        for _ in range(3):
            rise_us, line_warning = _signal_line_check(handle, pin, announce=False)
            rises.append(rise_us)
            warnings.append(line_warning)
            time.sleep(0.05)  # not a servo frame interval
        # Majority of three, so one preempted sample cannot flip the verdict.
        flagged = [w for w in warnings if w]
        warning = flagged[0] if len(flagged) >= 2 else None
    finally:
        try:
            lgpio.gpiochip_close(handle)
        except Exception:
            pass

    loaded = warning is not None
    if warning:
        warn(warning)
    verdict = 'LOADED — fix the wiring before trusting any servo command on this pin' \
        if loaded else 'healthy — the pad rises normally'
    if not loaded and not pull_up_high:
        verdict += ' (reads LOW under the internal pull-up: the attached input has its own pull-down, or is still charging)'
    return {
        'part': part.get('id') if part else None,
        'data': {'pin': pin, 'riseUs': rises, 'pullUpReadsHigh': pull_up_high,
                 'loaded': loaded, 'driveMa': drive_ma, 'warning': warning},
        'clamps': [],
        'message': f'GPIO {pin} signal line: {verdict}',
    }


def test_servo(pin):
    """Sweep a GPIO servo through a short, bounded connectivity check."""
    _require_gpio()
    pin = _int_arg(pin, 'channel')
    log(f'Testing GPIO servo on pin {pin}')
    for pulse in (1500, 1200, 1800, 1500):
        move_to(pin, pulse, 500)
        time.sleep(0.5)
    return {
        'part': None,
        'data': {'pin': pin},
        'clamps': [],
        'message': f'GPIO servo on pin {pin} completed its test sweep',
    }


USAGE = """Usage: servo_cli.py <command> [args...]
Commands:
  move_to <gpio_pin> <pulse_us> [duration_ms]
  rotate_continuous <gpio_pin> <direction> <speed> <duration_ms>
  move_to_pca <channel> <angle_deg> [i2c_address]
  move_to_pca_multi <channel> <angle_deg> [i2c_address]
  set_duty_pca <channel> <duty_pct> [i2c_address]
  get_duty_pca <channel> [i2c_address]
  rotate_continuous_pca <channel> <direction> <speed> <duration_ms> [i2c_address]
  batch_pca <ch:angle> [<ch:angle> ...] [i2c_address]
  release <channel> [i2c_address]
  reconcile [i2c_address] [--release-unmapped]
  probe <gpio_pin>
  test <channel>"""


def _address_arg(args, index):
    if len(args) > index:
        try:
            return int(args[index], 0)
        except (TypeError, ValueError):
            raise WrapperError(E_ARGS, f'invalid i2c address: {args[index]!r}')
    return PCA9685_DEFAULT_ADDRESS


def main():
    if len(sys.argv) < 2:
        sys.stderr.write(USAGE + '\n')
        emit(False, 'usage', error=WrapperError(E_ARGS, 'no command given',
                                                hint=USAGE))
        return

    command = sys.argv[1]
    args = [a for a in sys.argv[2:] if not a.startswith('--')]
    flags = {a for a in sys.argv[2:] if a.startswith('--')}

    try:
        if command == 'move_to':
            if len(args) < 2:
                raise WrapperError(E_ARGS, 'move_to requires <gpio_pin> <pulse_us>')
            result = move_to(args[0], args[1], args[2] if len(args) > 2 else 1000)

        elif command == 'rotate_continuous':
            if len(args) < 4:
                raise WrapperError(
                    E_ARGS,
                    'rotate_continuous requires <gpio_pin> <direction> <speed> <duration_ms>')
            result = rotate_continuous(args[0], args[1], args[2], args[3])

        elif command == 'move_to_pca':
            if len(args) < 2:
                raise WrapperError(E_ARGS, 'move_to_pca requires <channel> <angle_deg>')
            result = move_to_pca(args[0], args[1], _address_arg(args, 2))

        elif command == 'move_to_pca_multi':
            if len(args) < 2:
                raise WrapperError(E_ARGS, 'move_to_pca_multi requires <channel> <angle_deg>')
            result = move_to_pca_multi(args[0], args[1], _address_arg(args, 2))

        elif command == 'rotate_continuous_pca':
            if len(args) < 4:
                raise WrapperError(
                    E_ARGS,
                    'rotate_continuous_pca requires <channel> <direction> <speed> <duration_ms>')
            result = rotate_continuous_pca(args[0], args[1], args[2], args[3],
                                           _address_arg(args, 4))

        elif command == 'batch_pca':
            if not args:
                raise WrapperError(E_ARGS, 'batch_pca requires at least one channel:angle pair')
            pairs = []
            address = PCA9685_DEFAULT_ADDRESS
            for token in args:
                if ':' in token:
                    channel, angle = token.split(':', 1)
                    pairs.append((_int_arg(channel, 'channel'),
                                  _float_arg(angle, 'angle_deg')))
                else:
                    address = int(token, 0)
            result = batch_pca(pairs, address)

        elif command == 'release':
            if not args:
                raise WrapperError(E_ARGS, 'release requires <channel>')
            result = release_pca(args[0], _address_arg(args, 1))

        elif command == 'set_duty_pca':
            if len(args) < 2:
                raise WrapperError(E_ARGS, 'set_duty_pca requires <channel> <duty_pct>')
            result = set_duty_pca(args[0], args[1], _address_arg(args, 2))

        elif command == 'get_duty_pca':
            if not args:
                raise WrapperError(E_ARGS, 'get_duty_pca requires <channel>')
            result = get_duty_pca(args[0], _address_arg(args, 1))

        elif command == 'reconcile':
            result = reconcile(_address_arg(args, 0), '--release-unmapped' in flags)

        elif command == 'test':
            if not args:
                raise WrapperError(E_ARGS, 'test requires <channel>')
            result = test_servo(args[0])

        elif command == 'probe':
            if not args:
                raise WrapperError(E_ARGS, 'probe requires <gpio_pin>')
            result = probe(args[0])

        else:
            raise WrapperError(E_UNSUPPORTED, f'Unknown command: {command}', hint=USAGE)

    except WrapperError as exc:
        emit_error(command, exc)
        return
    except Exception as exc:  # noqa: BLE001 - classified, never swallowed
        emit_error(command, classify(exc))
        return

    emit(True, command, part=result.get('part'), data=result.get('data'),
         clamps=result.get('clamps'), message=result.get('message'))


if __name__ == '__main__':
    main()
