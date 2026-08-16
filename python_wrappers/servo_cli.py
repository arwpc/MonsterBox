#!/usr/bin/env python3

"""
Servo CLI Wrapper for MonsterBox

CLI contract (unchanged — services/hardwareService and the calibration adapters
depend on the argv shape exactly as it is):
  move_to <gpio_pin> <pulse_us> [duration_ms]
  rotate_continuous <gpio_pin> <direction> <speed> <duration_ms>
  move_to_pca <channel> <angle_deg> [i2c_address]
  move_to_pca_multi <channel> <angle_deg> [i2c_address]
  rotate_continuous_pca <channel> <direction> <speed> <duration_ms> [i2c_address]
  batch_pca <ch:angle> [<ch:angle> ...] [i2c_address]
  test <channel>
  release <channel> [i2c_address]           (new) de-energize ONE channel
  reconcile [i2c_address] [--release-unmapped]  (new) audit driven channels

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
        handle = lgpio.gpiochip_open(0)
        try:
            lgpio.gpio_claim_output(handle, pin)
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
        'data': {'pin': pin, 'pulse_us': pulse_us, 'duration_ms': duration_ms},
        'clamps': clamps,
        'message': f'GPIO servo on pin {pin} set to {pulse_us}us',
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
        handle = lgpio.gpiochip_open(0)
        try:
            lgpio.gpio_claim_output(handle, pin)
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
                 'duration_ms': duration_ms, 'pulse_us': pulse_us},
        'clamps': clamps,
        'message': f'GPIO continuous servo on pin {pin} rotated {direction} at {speed}%',
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
  rotate_continuous_pca <channel> <direction> <speed> <duration_ms> [i2c_address]
  batch_pca <ch:angle> [<ch:angle> ...] [i2c_address]
  release <channel> [i2c_address]
  reconcile [i2c_address] [--release-unmapped]
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

        elif command == 'reconcile':
            result = reconcile(_address_arg(args, 0), '--release-unmapped' in flags)

        elif command == 'test':
            if not args:
                raise WrapperError(E_ARGS, 'test requires <channel>')
            result = test_servo(args[0])

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
