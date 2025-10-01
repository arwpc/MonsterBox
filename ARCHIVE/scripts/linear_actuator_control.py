#!/usr/bin/env python3

import lgpio
import time
import sys
import json

def log_info(message):
    print(json.dumps({"level": "info", "message": message}), file=sys.stderr, flush=True)

def log_error(message):
    print(json.dumps({"level": "error", "message": message}), file=sys.stderr, flush=True)

def log_debug(message):
    print(json.dumps({"level": "debug", "message": message}), file=sys.stderr, flush=True)

def log_warning(message):
    print(json.dumps({"level": "warning", "message": message}), file=sys.stderr, flush=True)

def validate_gpio_pins(dir_pin, pwm_pin):
    """Validate GPIO pin numbers are within valid range and check for hardware PWM pins.
    
    RPi4 Hardware PWM pins:
    - PWM0 Channel: GPIO 12 and GPIO 18
    - PWM1 Channel: GPIO 13 and GPIO 19
    """
    try:
        dir_pin_int = int(dir_pin)
        pwm_pin_int = int(pwm_pin)
        
        # Basic range check
        if not (0 <= dir_pin_int <= 27 and 0 <= pwm_pin_int <= 27):
            raise ValueError(f"GPIO pins must be between 0 and 27. Got dir_pin={dir_pin_int}, pwm_pin={pwm_pin_int}")
        
        # Check if PWM pin is a hardware PWM pin
        hw_pwm_pins = [12, 13, 18, 19]
        if pwm_pin_int not in hw_pwm_pins:
            log_warning(f"GPIO {pwm_pin_int} is not a hardware PWM pin. Hardware PWM pins are GPIO 12, 13, 18, and 19.")
        
        return dir_pin_int, pwm_pin_int
    except ValueError as e:
        raise ValueError(f"Invalid GPIO pin numbers: {str(e)}")

def validate_direction(direction):
    """Validate direction input."""
    if direction.lower() not in ['forward', 'backward']:
        raise ValueError(f"Direction must be 'forward' or 'backward'. Got '{direction}'")
    return direction.lower()

def validate_speed(speed):
    try:
        speed_float = float(speed)
        if 0 <= speed_float <= 100:
            return speed_float
        else:
            raise ValueError("Speed must be between 0 and 100")
    except ValueError:
        raise ValueError("Invalid speed value")

def setup_gpio():
    """Initialize GPIO connection."""
    try:
        # Open GPIO chip 0
        h = lgpio.gpiochip_open(0)
        log_info("GPIO initialized successfully")
        return h
    except Exception as e:
        log_error(f"Failed to initialize GPIO: {str(e)}")
        raise

def setup_pins(h, dir_pin, pwm_pin):
    """Set up GPIO pins for direction and PWM control."""
    try:
        # Set up direction pin as output
        lgpio.gpio_claim_output(h, dir_pin)
        
        # Set up pwm_pin as regular output first
        # We'll handle PWM differently based on whether hardware or software PWM is used
        lgpio.gpio_claim_output(h, pwm_pin)
        
        log_info(f"Pins configured - dir_pin: {dir_pin}, pwm_pin: {pwm_pin}")
        return True
    except Exception as e:
        log_error(f"Failed to set up pins: {str(e)}")
        raise

def control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction):
    h = None
    try:
        # Validate inputs
        direction = validate_direction(direction)
        speed_float = validate_speed(speed)
        duration_int = int(duration)
        dir_pin, pwm_pin = validate_gpio_pins(dir_pin, pwm_pin)
        max_extension_int = int(max_extension)
        max_retraction_int = int(max_retraction)
        
        if duration_int <= 0:
            raise ValueError(f"Duration must be positive. Got {duration_int}")
        if max_extension_int <= 0 or max_retraction_int <= 0:
            raise ValueError(f"Max extension/retraction must be positive. Got extension={max_extension_int}, retraction={max_retraction_int}")
        
        # Initialize GPIO
        h = setup_gpio()
        
        # Set up pins
        setup_pins(h, dir_pin, pwm_pin)
        
        # Calculate actual duration
        actual_duration = min(duration_int, max_extension_int if direction == 'forward' else max_retraction_int)
        if actual_duration != duration_int:
            log_info(f"Duration limited from {duration_int}ms to {actual_duration}ms due to {direction} limit")
        
        # Set direction
        dir_value = 0 if direction == 'forward' else 1
        lgpio.gpio_write(h, dir_pin, dir_value)
        log_info(f"Set direction pin ({dir_pin}) to {'LOW' if dir_value == 0 else 'HIGH'} ({direction})")
        
        # Convert speed from percentage (0-100) to a duty cycle value (0-255)
        duty_cycle = int((speed_float / 100.0) * 255)
        log_info(f"Set duty cycle to {duty_cycle}/255 ({speed_float}%)")
        
        # Simple software PWM implementation that works on all pins
        # Implement PWM manually with cycle timing
        cycle_time = 0.01  # 10ms cycle time (100Hz)
        start_time = time.time()
        end_time = start_time + (actual_duration / 1000.0)
        
        while time.time() < end_time:
            if duty_cycle > 0:
                # Calculate on and off times
                on_time = cycle_time * (duty_cycle / 255.0)
                off_time = cycle_time - on_time
                
                # PWM cycle
                lgpio.gpio_write(h, pwm_pin, 1)  # HIGH
                time.sleep(on_time)
                lgpio.gpio_write(h, pwm_pin, 0)  # LOW
                time.sleep(off_time)
            else:
                # 0% duty cycle means just stay off
                time.sleep(cycle_time)
        
        # Stop motor - set PWM pin to LOW
        lgpio.gpio_write(h, pwm_pin, 0)  # Digital LOW
        log_info("Motor stopped")
        
        return True
    except Exception as e:
        log_error(f"Error during actuator control: {str(e)}")
        return False
    finally:
        if h is not None:
            try:
                # Clean up GPIO - set both pins LOW
                lgpio.gpio_write(h, dir_pin, 0)
                lgpio.gpio_write(h, pwm_pin, 0)
                
                # Close the GPIO chip
                lgpio.gpiochip_close(h)
                log_info("GPIO cleanup completed")
            except Exception as e:
                log_error(f"Error during GPIO cleanup: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) < 8:
        log_error("Usage: python3 linear_actuator_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin> <max_extension> <max_retraction>")
        print(json.dumps({"success": False, "error": "Invalid number of arguments"}))
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = sys.argv[2]
        duration = sys.argv[3]
        dir_pin = sys.argv[4]
        pwm_pin = sys.argv[5]
        max_extension = sys.argv[6]
        max_retraction = sys.argv[7]

        log_info(f"Starting linear actuator control with parameters: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}, max_extension={max_extension}, max_retraction={max_retraction}")
        
        success = control_actuator(direction, speed, duration, dir_pin, pwm_pin, max_extension, max_retraction)
        if success:
            log_info("Linear actuator control completed successfully")
            print(json.dumps({"success": True}))
            sys.exit(0)
        else:
            log_error("Linear actuator control failed")
            print(json.dumps({"success": False, "error": "Linear actuator control failed"}))
            sys.exit(1)
    except Exception as e:
        error_msg = f"Error controlling linear actuator: {str(e)}"
        log_error(error_msg)
        print(json.dumps({"success": False, "error": error_msg}))
        sys.exit(1)
