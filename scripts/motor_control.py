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
    if direction.lower() not in ['forward', 'backward', 'reverse']:
        raise ValueError(f"Direction must be 'forward', 'backward', or 'reverse'. Got '{direction}'")
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
        lgpio.gpio_claim_output(h, pwm_pin)
        
        log_info(f"Pins configured - dir_pin: {dir_pin}, pwm_pin: {pwm_pin}")
        return True
    except Exception as e:
        log_error(f"Failed to set up pins: {str(e)}")
        raise

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    """Control a Jeep Wagoneer wiper motor via MDD10A motor controller.
    
    Args:
        direction: 'forward', 'backward', or 'reverse'
        speed: Speed as percentage 0-100
        duration: Duration in milliseconds
        dir_pin: GPIO pin for direction control
        pwm_pin: GPIO pin for PWM control
        
    Returns:
        True if successful, False otherwise
    """
    h = None
    try:
        # Direct type conversion rather than validation functions
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        
        # Validate direction - either forward or backward/reverse
        if direction.lower() not in ['forward', 'backward', 'reverse']:
            raise ValueError(f"Direction must be 'forward', 'backward', or 'reverse'. Got '{direction}'")
        
        # Validate and convert speed to 0-100 range
        try:
            speed_value = float(speed)
            if not (0 <= speed_value <= 100):
                raise ValueError(f"Speed must be 0-100. Got {speed_value}")
        except ValueError:
            raise ValueError(f"Invalid speed: {speed}")
            
        # Validate duration
        try:
            duration_ms = int(duration)
            if duration_ms <= 0:
                raise ValueError(f"Duration must be positive. Got {duration_ms}")
        except ValueError:
            raise ValueError(f"Invalid duration: {duration}")
            
        # Cap duration at 5 seconds for safety
        duration_sec = min(duration_ms / 1000.0, 5.0)
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        log_info("GPIO initialized successfully")
        
        # Configure pins for output
        lgpio.gpio_claim_output(h, dir_pin)
        lgpio.gpio_claim_output(h, pwm_pin)
        log_info(f"Pins configured - dir_pin: {dir_pin}, pwm_pin: {pwm_pin}")
        
        # Ensure PWM pin is LOW before changing direction
        lgpio.gpio_write(h, pwm_pin, 0)
        
        # Set direction: MDD10A typically uses LOW for forward, HIGH for reverse
        # This may need adjustment depending on how your motor is wired
        dir_value = 0 if direction.lower() == 'forward' else 1
        lgpio.gpio_write(h, dir_pin, dir_value)
        log_info(f"Set direction pin ({dir_pin}) to {'LOW' if dir_value == 0 else 'HIGH'} ({direction})")
        
        # Short delay after setting direction
        time.sleep(0.05)
        
        # Motor speed control
        log_info(f"Setting motor speed to {speed_value}%")
        
        # Scale speed to appropriate duty cycle
        # MDD10A expects PWM at one of these frequencies: 1KHz, 2KHz, 5KHz or 10KHz
        # Important: For a vehicle wiper motor, simple on/off might work in most cases, but
        # we'll implement proper PWM for speed control
        
        if speed_value > 0:
            # If using a hardware PWM pin (12, 13, 18, 19), use hardware PWM
            if pwm_pin in [12, 13, 18, 19]:
                # For vehicle wiper motors, a lower frequency like 50Hz often works well
                pwm_freq = 50  # Hz
                
                # PWM duty cycle for lgpio.tx_pwm is 0-255
                pwm_duty = int((speed_value / 100.0) * 50.0)
                
                # For MDD10A, even a low duty cycle can start the motor due to inertia
                # Ensure at least 20 (out of 255) for reliable starting
                pwm_duty = max(20, pwm_duty)  
                
                log_info(f"Starting hardware PWM with freq={pwm_freq}Hz, duty={pwm_duty}")
                lgpio.tx_pwm(h, pwm_pin, pwm_freq, pwm_duty)
            else:
                # For non-PWM pins, use direct GPIO control
                log_info("Using direct GPIO control for non-PWM pin")
                lgpio.gpio_write(h, pwm_pin, 1)  # Turn on motor at full speed
                
            # Run for specified duration
            time.sleep(duration_sec)
                
            # Stop motor
            if pwm_pin in [12, 13, 18, 19]:
                lgpio.tx_pwm(h, pwm_pin, 0, 0)  # Stop PWM
            lgpio.gpio_write(h, pwm_pin, 0)     # Ensure pin is LOW
                
        log_info(f"Motor ran for {duration_ms} ms")
        return True
    except Exception as e:
        log_error(f"Error during motor control: {str(e)}")
        return False
    finally:
        # Always ensure motor is stopped and resources are cleaned up
        if h is not None:
            try:
                # First, ensure motor is stopped by setting PWM pin to LOW
                lgpio.gpio_write(h, pwm_pin, 0)
                
                # If we were using hardware PWM, make sure it's properly disabled
                if pwm_pin in [12, 13, 18, 19]:
                    try:
                        lgpio.tx_pwm(h, pwm_pin, 0, 0)  # Stop PWM output
                    except:
                        pass  # Ignore errors here
                
                # Free the GPIO resources
                try:
                    lgpio.gpio_free(h, dir_pin)
                    lgpio.gpio_free(h, pwm_pin)
                except:
                    pass  # Continue cleanup even if this fails
                    
                # Close the GPIO chip
                lgpio.gpiochip_close(h)
                log_info("GPIO resources cleaned up")
            except Exception as e:
                log_error(f"Error during GPIO cleanup: {str(e)}")
                
            # Emergency fallback - try one more approach to ensure motor stops
            try:
                emergency_h = lgpio.gpiochip_open(0)
                lgpio.gpio_claim_output(emergency_h, pwm_pin)
                lgpio.gpio_write(emergency_h, pwm_pin, 0)  # Force LOW
                lgpio.gpio_free(emergency_h, pwm_pin)
                lgpio.gpiochip_close(emergency_h)
                log_info("Emergency motor stop completed")
            except:
                pass  # Nothing more we can do

if __name__ == "__main__":
    if len(sys.argv) < 6:
        log_error("Usage: python3 motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>")
        print(json.dumps({"status": "error", "message": "Invalid number of arguments"}))
        sys.exit(1)

    try:
        direction = sys.argv[1]
        speed = sys.argv[2]
        duration = sys.argv[3]
        dir_pin = sys.argv[4]
        pwm_pin = sys.argv[5]

        log_info(f"Starting motor control with parameters: direction={direction}, speed={speed}, duration={duration}, dir_pin={dir_pin}, pwm_pin={pwm_pin}")
        
        success = control_motor(direction, speed, duration, dir_pin, pwm_pin)
        if success:
            log_info("Motor control completed successfully")
            # UI expects a very specific format - must include status field but no "level" field
            print(json.dumps({"status": "success", "message": "Motor control completed successfully"}), flush=True)
            sys.exit(0)
        else:
            log_error("Motor control failed")
            print(json.dumps({"status": "error", "message": "Motor control failed"}), flush=True)
            sys.exit(1)
    except Exception as e:
        error_msg = f"Error controlling motor: {str(e)}"
        log_error(error_msg)
        print(json.dumps({"status": "error", "message": error_msg}))
        sys.exit(1)
