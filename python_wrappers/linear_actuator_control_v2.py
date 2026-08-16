#!/usr/bin/env python3
"""
Enhanced Linear Actuator Control Script for MonsterBox
Supports multiple motor driver boards: MDD10A, Cytron, BTS7960

CLI contract (unchanged): a single JSON config object as argv[1].
  {"controlBoard":"BTS7960","rpwmPin":19,"lpwmPin":21,"renPin":5,"lenPin":22,
   "direction":"forward","speed":50,"duration":1000}

Safety is enforced HERE as well as in Node. config/hardware-safety.json used to
be applied only by services/hardwareService, so a direct invocation of this
script walked past every clamp — including the blockAllMotion quarantine on an
actuator whose wiring is ambiguous enough that "extend" may physically retract
a part already sitting at its mechanical minimum. This wrapper re-reads the same
committed config and refuses on its own. It can only narrow, never widen.
"""

import os
import time
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mb_response import (  # noqa: E402
    E_ARGS,
    E_BUS_IO,
    E_CONFIG,
    E_UNSUPPORTED,
    WrapperError,
    classify,
    emit,
    emit_error,
)
import mb_safety  # noqa: E402

try:
    import lgpio
    LGPIO_AVAILABLE = True
except Exception as _lgpio_error:  # pragma: no cover - depends on node deps
    LGPIO_AVAILABLE = False
    _LGPIO_IMPORT_ERROR = _lgpio_error

def log_info(message):
    print(json.dumps({"level": "info", "message": message}), file=sys.stderr, flush=True)

def log_error(message):
    print(json.dumps({"level": "error", "message": message}), file=sys.stderr, flush=True)

def log_debug(message):
    print(json.dumps({"level": "debug", "message": message}), file=sys.stderr, flush=True)

def log_warning(message):
    print(json.dumps({"level": "warning", "message": message}), file=sys.stderr, flush=True)

# Board type constants
BOARD_MDD10A = "MDD10A"
BOARD_CYTRON = "CYTRON"
BOARD_BTS7960 = "BTS7960"

class LinearActuatorController:
    """Controller for linear actuators with multiple board type support."""
    
    def __init__(self, board_type="MDD10A"):
        self.board_type = board_type
        self.h = None
        self.pins = {}
        
    def setup_gpio(self):
        """Initialize GPIO connection."""
        try:
            self.h = lgpio.gpiochip_open(0)
            log_info(f"GPIO initialized successfully for {self.board_type} board")
            return True
        except Exception as e:
            log_error(f"Failed to initialize GPIO: {str(e)}")
            return False
    
    def setup_mdd10a_pins(self, dir_pin, pwm_pin):
        """Setup pins for MDD10A/Cytron board (DIR + PWM)."""
        try:
            lgpio.gpio_claim_output(self.h, dir_pin)
            lgpio.gpio_claim_output(self.h, pwm_pin)
            self.pins = {'dir': dir_pin, 'pwm': pwm_pin}
            log_info(f"MDD10A pins configured - DIR: {dir_pin}, PWM: {pwm_pin}")
            return True
        except Exception as e:
            log_error(f"Failed to setup MDD10A pins: {str(e)}")
            return False
    
    def setup_bts7960_pins(self, rpwm_pin, lpwm_pin, ren_pin=None, len_pin=None):
        """Setup pins for BTS7960 board (RPWM + LPWM + optional enables)."""
        try:
            lgpio.gpio_claim_output(self.h, rpwm_pin)
            lgpio.gpio_claim_output(self.h, lpwm_pin)
            self.pins = {'rpwm': rpwm_pin, 'lpwm': lpwm_pin}
            
            # Setup enable pins if provided
            if ren_pin is not None:
                lgpio.gpio_claim_output(self.h, ren_pin)
                lgpio.gpio_write(self.h, ren_pin, 1)  # Enable right side
                self.pins['ren'] = ren_pin
            
            if len_pin is not None:
                lgpio.gpio_claim_output(self.h, len_pin)
                lgpio.gpio_write(self.h, len_pin, 1)  # Enable left side
                self.pins['len'] = len_pin
            
            log_info(f"BTS7960 pins configured - RPWM: {rpwm_pin}, LPWM: {lpwm_pin}, R_EN: {ren_pin}, L_EN: {len_pin}")
            return True
        except Exception as e:
            log_error(f"Failed to setup BTS7960 pins: {str(e)}")
            return False
    
    def control_mdd10a(self, direction, speed, duration, pwm_hz=100):
        """Control actuator using MDD10A/Cytron board."""
        try:
            dir_pin = self.pins['dir']
            pwm_pin = self.pins['pwm']

            # Stop motor first
            lgpio.gpio_write(self.h, pwm_pin, 0)
            time.sleep(0.05)

            # Normalize direction
            if direction in ('extend', 'forward'):
                dir_norm = 'forward'
            else:
                dir_norm = 'reverse'
            # Set direction (0=forward, 1=backward)
            dir_value = 0 if dir_norm == 'forward' else 1
            lgpio.gpio_write(self.h, dir_pin, dir_value)
            log_info(f"Direction set to {dir_norm} (pin {dir_pin} = {dir_value})")

            # Calculate duty cycle
            duty_cycle = int((speed / 100.0) * 255)
            log_info(f"Speed: {speed}%, Duty cycle: {duty_cycle}/255, PWM: {pwm_hz} Hz")

            # Software PWM
            cycle_time = max(1.0/float(pwm_hz or 100), 0.0002)
            start_time = time.time()
            end_time = start_time + (duration / 1000.0)

            while time.time() < end_time:
                if duty_cycle > 0:
                    on_time = cycle_time * (duty_cycle / 255.0)
                    off_time = cycle_time - on_time
                    lgpio.gpio_write(self.h, pwm_pin, 1)
                    time.sleep(on_time)
                    lgpio.gpio_write(self.h, pwm_pin, 0)
                    time.sleep(off_time)
                else:
                    time.sleep(cycle_time)

            # Stop motor
            lgpio.gpio_write(self.h, pwm_pin, 0)
            log_info("Motor stopped")
            return True

        except Exception as e:
            log_error(f"Error controlling MDD10A: {str(e)}")
            return False
    
    def control_bts7960(self, direction, speed, duration, pwm_hz=2000):
        """Control actuator using BTS7960 board with simple digital control."""
        try:
            rpwm_pin = self.pins['rpwm']
            lpwm_pin = self.pins['lpwm']

            # Ensure enable pins HIGH if present
            try:
                if 'ren' in self.pins:
                    lgpio.gpio_write(self.h, self.pins['ren'], 1)
                if 'len' in self.pins:
                    lgpio.gpio_write(self.h, self.pins['len'], 1)
            except Exception:
                pass

            # Stop motor first
            lgpio.gpio_write(self.h, rpwm_pin, 0)
            lgpio.gpio_write(self.h, lpwm_pin, 0)
            time.sleep(0.05)

            # Normalize direction
            if direction in ('extend', 'forward'):
                dir_norm = 'forward'
            else:
                dir_norm = 'reverse'

            log_info(f"BTS7960 control - Direction: {dir_norm}, Speed: {speed}%, Duration: {duration}ms")

            # Determine which pin to use based on direction
            active_pin = rpwm_pin if dir_norm == 'forward' else lpwm_pin
            inactive_pin = lpwm_pin if dir_norm == 'forward' else rpwm_pin

            # Ensure inactive pin is LOW
            lgpio.gpio_write(self.h, inactive_pin, 0)
            time.sleep(0.02)

            # Enhanced control: Use lgpio tx_pwm for speed control
            if speed > 0:
                try:
                    lgpio.tx_pwm(self.h, active_pin, pwm_hz or 2000, speed)
                    log_info(f"Motor running {dir_norm} (pin {active_pin} at {speed}% duty, {pwm_hz}Hz)")
                except AttributeError:
                     # Fallback
                    lgpio.gpio_write(self.h, active_pin, 1)
                    log_info(f"Motor running {dir_norm} (pin {active_pin} HIGH - Digital Fallback)")

                # Run for specified duration
                time.sleep(duration / 1000.0)

                # Stop motor
                try:
                    lgpio.tx_pwm(self.h, active_pin, pwm_hz or 2000, 0)
                except:
                    pass
                lgpio.gpio_write(self.h, active_pin, 0)
                log_info("Motor stopped")
            else:
                log_info("Speed is 0, motor not started")

            # Ensure both PWM pins are LOW
            lgpio.gpio_write(self.h, rpwm_pin, 0)
            lgpio.gpio_write(self.h, lpwm_pin, 0)

            log_info("BTS7960 motor control complete")
            return True

        except Exception as e:
            log_error(f"Error controlling BTS7960: {str(e)}")
            # Ensure motor is stopped on error
            try:
                lgpio.gpio_write(self.h, self.pins['rpwm'], 0)
                lgpio.gpio_write(self.h, self.pins['lpwm'], 0)
            except:
                pass
            return False
    
    def cleanup(self):
        """Clean up GPIO resources."""
        if self.h is not None:
            try:
                # Set all pins LOW
                for pin in self.pins.values():
                    if pin is not None:
                        lgpio.gpio_write(self.h, pin, 0)
                lgpio.gpiochip_close(self.h)
                log_info("GPIO cleanup completed")
            except Exception as e:
                log_error(f"Error during cleanup: {str(e)}")

def require_pin(config, key, board_type):
    """Read a pin from the config, or say exactly what is missing and where.

    A missing pin used to reach the operator as
    `int() argument must be a string ... not 'NoneType'`, which names neither
    the part nor the file to fix.
    """
    value = config.get(key)
    if value is None or value == '':
        raise WrapperError(
            E_CONFIG,
            f"{board_type} needs '{key}' but it is not set for this part",
            hint=f"Open the part in /parts and set {key}, or pick the control "
                 f"board that matches how it is actually wired.")
    try:
        return int(value)
    except (TypeError, ValueError):
        raise WrapperError(
            E_CONFIG,
            f"'{key}' must be a GPIO number, got {value!r}",
            hint='Fix the pin value on the part in /parts.')


def main():
    """Main entry point with argument parsing."""
    op = 'control_actuator'
    if len(sys.argv) < 2:
        emit(False, op, error=WrapperError(
            E_ARGS, 'Missing configuration',
            hint='Usage: python3 linear_actuator_control_v2.py <config_json>'))
        return

    controller = None
    part_id = None
    clamps = []
    try:
        try:
            config = json.loads(sys.argv[1])
        except ValueError as exc:
            raise WrapperError(E_ARGS, f'configuration is not valid JSON: {exc}')
        if not isinstance(config, dict):
            raise WrapperError(E_ARGS, 'configuration must be a JSON object')

        if not LGPIO_AVAILABLE:
            raise WrapperError(
                E_UNSUPPORTED, f'lgpio is not available on this node ({_LGPIO_IMPORT_ERROR})',
                hint='Install the lgpio python module.')

        board_type = config.get('controlBoard', 'MDD10A')
        direction = config.get('direction', 'forward')
        speed = float(config.get('speed', 50))
        duration = int(config.get('duration', 1000))
        pwm_hz = int(config.get('pwmFrequency', 2000 if board_type == BOARD_BTS7960 else 100))

        # --- Safety backstop -------------------------------------------------
        # A stop (no speed or no duration) is never refused: energizing nothing
        # cannot hurt anything, and a part you cannot stop is worse than one you
        # cannot start.
        character_id = mb_safety.resolve_character_id()
        part = mb_safety.find_part_by_pins(character_id, {
            'rpwmPin': config.get('rpwmPin'),
            'lpwmPin': config.get('lpwmPin'),
            'renPin': config.get('renPin'),
            'lenPin': config.get('lenPin'),
            'directionPin': config.get('directionPin'),
            'pwmPin': config.get('pwmPin'),
        })
        part_id = part.get('id') if part else None
        is_stop = speed <= 0 or duration <= 0
        if is_stop:
            safety = mb_safety.get_part_safety(character_id, part_id) if part else {}
        else:
            values, clamps, safety = mb_safety.guard(
                character_id, part, op,
                speed=speed, duration_ms=duration, direction=direction)
            speed = float(values['speed'])
            duration = int(values['duration_ms'])

        log_info(f"Configuration: board={board_type}, direction={direction}, "
                 f"speed={speed}, duration={duration}, pwm={pwm_hz}Hz, part={part_id}")

        controller = LinearActuatorController(board_type)

        # Parts on a shared fuse are never energized together, in this process
        # or any other — Node's in-process mutex cannot see a second process.
        with mb_safety.power_group(character_id, safety):
            if not controller.setup_gpio():
                raise WrapperError(
                    E_BUS_IO, 'GPIO initialization failed',
                    hint='Check that /dev/gpiochip0 exists and this user is in '
                         'the gpio group.')

            # Everything after setup_gpio() runs under try/finally so the motor
            # pins are always driven LOW and the gpiochip handle released — a bad
            # pin config used to sys.exit() with enable pins already HIGH.
            try:
                if board_type in [BOARD_MDD10A, BOARD_CYTRON]:
                    dir_pin = require_pin(config, 'directionPin', board_type)
                    pwm_pin = require_pin(config, 'pwmPin', board_type)
                    if not controller.setup_mdd10a_pins(dir_pin, pwm_pin):
                        raise WrapperError(E_BUS_IO, 'Pin setup failed',
                                           hint=f'Could not claim GPIO {dir_pin}/{pwm_pin} '
                                                f'— another process may hold them.')
                    success = controller.control_mdd10a(direction, speed, duration, pwm_hz)

                elif board_type == BOARD_BTS7960:
                    rpwm_pin = require_pin(config, 'rpwmPin', board_type)
                    lpwm_pin = require_pin(config, 'lpwmPin', board_type)
                    ren_pin = config.get('renPin')
                    len_pin = config.get('lenPin')
                    if ren_pin: ren_pin = int(ren_pin)
                    if len_pin: len_pin = int(len_pin)

                    if not controller.setup_bts7960_pins(rpwm_pin, lpwm_pin, ren_pin, len_pin):
                        raise WrapperError(E_BUS_IO, 'Pin setup failed',
                                           hint=f'Could not claim GPIO {rpwm_pin}/{lpwm_pin} '
                                                f'— another process may hold them.')
                    success = controller.control_bts7960(direction, speed, duration, pwm_hz)
                else:
                    raise WrapperError(
                        E_UNSUPPORTED, f'Unsupported board type: {board_type}',
                        hint='Supported boards: MDD10A, CYTRON, BTS7960.')
            finally:
                controller.cleanup()
                controller = None

        if not success:
            raise WrapperError(E_BUS_IO, 'Control operation failed',
                               hint='The driver reported an error; see the log '
                                    'lines above on stderr.')

        emit(True, op, part=part_id, clamps=clamps, data={
            'controlBoard': board_type,
            'direction': direction,
            'speed': speed,
            'duration': duration,
            'pwmFrequency': pwm_hz,
        }, message=f'{board_type} {direction} at {speed}% for {duration}ms')

    except WrapperError as exc:
        log_error(f"{exc.code}: {exc.message}")
        emit_error(op, exc, part=part_id)
    except Exception as exc:  # noqa: BLE001 - classified, never swallowed
        log_error(f"Fatal error: {exc}")
        emit_error(op, classify(exc), part=part_id)
    finally:
        # Belt and braces: if an exception escaped before the inner finally ran,
        # the pins must still come down.
        if controller is not None:
            try:
                controller.cleanup()
            except Exception:
                pass


if __name__ == "__main__":
    main()

