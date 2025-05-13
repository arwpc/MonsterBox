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
    """Control the DC motor using lgpio.
    
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
        # Validate inputs
        direction = validate_direction(direction)
        speed_float = validate_speed(speed)
        duration_int = int(duration)
        dir_pin_int, pwm_pin_int = validate_gpio_pins(dir_pin, pwm_pin)
        
        if duration_int <= 0:
            raise ValueError(f"Duration must be positive. Got {duration_int}")
        
        # Initialize GPIO
        h = setup_gpio()
        
        # Set up pins
        setup_pins(h, dir_pin_int, pwm_pin_int)
        
        # Set direction - Note: MDD10A uses LOW for forward, HIGH for reverse (opposite of some drivers)
        # Adjust this based on how your motor controller is wired
        dir_value = 0 if direction == 'forward' else 1
        lgpio.gpio_write(h, dir_pin_int, dir_value)
        log_info(f"Set direction pin ({dir_pin_int}) to {'LOW' if dir_value == 0 else 'HIGH'} ({direction})")
        
        # Convert speed from percentage (0-100) to a duty cycle value
        # For MDD10A with software PWM, we'll use 0-100 duty cycle range
        duty_cycle = int(speed_float)
        log_info(f"Set duty cycle to {duty_cycle}% ({speed_float}%)")
        
        # Implement a safer ramping start to avoid current spikes
        # Start at 0% and ramp up to target speed
        for step in range(0, 11):  # 0 to 10 in 10 steps (0% to 100%)
            current_duty = int((duty_cycle / 10.0) * step)
            # For hardware PWM pins, use hardware PWM
            if pwm_pin_int in [12, 13, 18, 19]:
                # Hardware PWM in lgpio uses 0-1000000 range (microseconds)
                # Current duty is 0-100, convert to 0-1000000
                hw_duty = int((current_duty / 100.0) * 1000000)
                lgpio.tx_pwm(h, pwm_pin_int, 100, hw_duty)  # 100Hz frequency
            else:
                # For other pins, we'll use software PWM implementation
                on_time = 0.01 * (current_duty / 100.0)  # 10ms cycle time (100Hz)
                off_time = 0.01 - on_time
                lgpio.gpio_write(h, pwm_pin_int, 1)  # HIGH
                time.sleep(on_time)
                lgpio.gpio_write(h, pwm_pin_int, 0)  # LOW
                time.sleep(off_time)
            
            # Short delay between steps for smooth ramping
            time.sleep(0.02)
        
        # Run at desired speed for specified duration
        # Cap duration at 5 seconds for safety
        max_runtime = min(duration_int / 1000.0, 5.0)
        start_time = time.time()
        end_time = start_time + max_runtime
        
        if pwm_pin_int in [12, 13, 18, 19]:
            # For hardware PWM pins, set the duty cycle once and wait
            # lgpio tx_pwm uses 0-1000000 duty cycle range (microseconds)
            hw_duty = int((duty_cycle / 100.0) * 1000000)
            lgpio.tx_pwm(h, pwm_pin_int, 100, hw_duty)  # 100Hz frequency
            time.sleep(max_runtime)
        else:
            # For software PWM, implement a cycle loop
            while time.time() < end_time:
                on_time = 0.01 * (duty_cycle / 100.0)  # 10ms cycle time (100Hz)
                off_time = 0.01 - on_time
                
                if duty_cycle > 0:
                    lgpio.gpio_write(h, pwm_pin_int, 1)  # HIGH
                    time.sleep(on_time)
                    lgpio.gpio_write(h, pwm_pin_int, 0)  # LOW
                    time.sleep(off_time)
                else:
                    # 0% duty cycle means just stay off
                    time.sleep(0.01)
        
        log_info(f"Motor ran for {int((time.time() - start_time) * 1000)}ms")
        
        # Ramp down safely to prevent current spikes on stop
        for step in range(10, -1, -1):  # 10 down to 0 in 10 steps (100% to 0%)
            current_duty = int((duty_cycle / 10.0) * step)
            
            # For hardware PWM pins, use hardware PWM
            if pwm_pin_int in [12, 13, 18, 19]:
                # lgpio tx_pwm uses 0-1000000 duty cycle range (microseconds)
                hw_duty = int((current_duty / 100.0) * 1000000)
                lgpio.tx_pwm(h, pwm_pin_int, 100, hw_duty)  # 100Hz frequency
            else:
                # For other pins, implement a PWM cycle
                on_time = 0.01 * (current_duty / 100.0)  # 10ms cycle time (100Hz)
                off_time = 0.01 - on_time
                lgpio.gpio_write(h, pwm_pin_int, 1)  # HIGH
                time.sleep(on_time)
                lgpio.gpio_write(h, pwm_pin_int, 0)  # LOW
                time.sleep(off_time)
            
            # Short delay between steps for smooth ramping
            time.sleep(0.02)
        
        # Stop motor - set PWM pin to LOW
        if pwm_pin_int in [12, 13, 18, 19]:
            lgpio.tx_pwm(h, pwm_pin_int, 0, 0)  # Stop PWM
        lgpio.gpio_write(h, pwm_pin_int, 0)  # Digital LOW to ensure it's off
        log_info("Motor stopped")
        
        return True
    except Exception as e:
        log_error(f"Error during motor control: {str(e)}")
        return False
    finally:
        if h is not None:
            try:
                # Clean up GPIO - set both pins LOW first to ensure motor stops
                if 'pwm_pin_int' in locals():
                    # Stop PWM immediately
                    if pwm_pin_int in [12, 13, 18, 19]:
                        lgpio.tx_pwm(h, pwm_pin_int, 0, 0)
                    lgpio.gpio_write(h, pwm_pin_int, 0)
                    
                if 'dir_pin_int' in locals():    
                    lgpio.gpio_write(h, dir_pin_int, 0)
                
                # Then free resources properly
                try:
                    if 'dir_pin_int' in locals():
                        lgpio.gpio_free(h, dir_pin_int)
                except Exception as e:
                    log_error(f"Error freeing direction pin: {str(e)}")
                    
                try:
                    if 'pwm_pin_int' in locals():
                        lgpio.gpio_free(h, pwm_pin_int)
                except Exception as e:
                    log_error(f"Error freeing PWM pin: {str(e)}")
                
                # Close the GPIO chip
                lgpio.gpiochip_close(h)
                log_info("GPIO cleanup completed")
            except Exception as e:
                log_error(f"Error during GPIO cleanup: {str(e)}")
                
            # Emergency fallback - try to create a new handle if needed
            try:
                # Only do this if the main cleanup failed
                emergency_h = lgpio.gpiochip_open(0)
                lgpio.gpio_claim_output(emergency_h, int(pwm_pin))
                lgpio.gpio_write(emergency_h, int(pwm_pin), 0) # Ensure motor stops
                lgpio.gpio_free(emergency_h, int(pwm_pin))
                lgpio.gpiochip_close(emergency_h)
                log_info("Emergency motor stop performed")
            except:
                # Just continue if this fails
                pass

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
            print(json.dumps({"status": "success", "message": "Motor control completed"}))
            sys.exit(0)
        else:
            log_error("Motor control failed")
            print(json.dumps({"status": "error", "message": "Motor control failed"}))
            sys.exit(1)
    except Exception as e:
        error_msg = f"Error controlling motor: {str(e)}"
        log_error(error_msg)
        print(json.dumps({"status": "error", "message": error_msg}))
        sys.exit(1)
