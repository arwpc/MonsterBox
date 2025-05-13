#!/usr/bin/env python3

import subprocess
import json
import sys
import os
import tempfile

def log_message(message):
    # Only output clean JSON - the web interface expects this format
    print(json.dumps(message), flush=True)
    sys.stdout.flush()

# Create a minimal helper script for GPIO control that will run in a separate process
def create_helper_script():
    script_content = """
#!/usr/bin/env python3
import lgpio
import time
import sys
import os
import json

# For consistent output format with other scripts
def log_message(message):
    print(json.dumps(message), flush=True)

# Run in a separate process with limited duration
def control_motor_helper(dir_pin, pwm_pin, direction, speed, duration):
    # Initialize handle
    h = None
    
    try:
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        speed = int(speed)
        duration = float(duration) / 1000.0  # Convert to seconds
        
        # Initialize GPIO
        h = lgpio.gpiochip_open(0)
        
        # Setup pins
        lgpio.gpio_claim_output(h, dir_pin)
        lgpio.gpio_claim_output(h, pwm_pin)
        
        # Set direction
        lgpio.gpio_write(h, dir_pin, 1 if direction == 'forward' else 0)
        
        # Set PWM frequency based on pin (hardware PWM pins can use higher freq)
        freq = 100  # Default for DC motors
        if pwm_pin in [12, 13, 18, 19]:  # Hardware PWM pins
            freq = 200
        
        # Setup for PWM control
        # Convert 0-100 speed to 0-255 duty cycle for consistency with other scripts
        max_duty = 255
        
        # Ramp up safely to prevent current spikes
        for step in range(0, 11):
            duty = int((speed * max_duty / 100.0) * (step / 10.0))
            lgpio.tx_pwm(h, pwm_pin, freq, duty)
            time.sleep(0.05)
            
        # Hold at specified speed
        time.sleep(max(0.1, min(duration, 0.5)))
        
        # Ramp down safely
        for step in range(10, -1, -1):
            duty = int((speed * max_duty / 100.0) * (step / 10.0))
            lgpio.tx_pwm(h, pwm_pin, freq, duty)
            time.sleep(0.05)
        
        # Stop motor completely
        lgpio.tx_pwm(h, pwm_pin, freq, 0)
        sys.exit(0)
    except Exception as e:
        log_message({"status": "error", "message": str(e)})
        sys.exit(1)
    finally:
        # Always clean up GPIO resources
        if h is not None:
            try:
                lgpio.gpio_free(h, dir_pin)
                lgpio.gpio_free(h, pwm_pin)
                lgpio.gpiochip_close(h)
            except:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 6:
        sys.exit(1)
        
    dir_pin = sys.argv[1]
    pwm_pin = sys.argv[2]
    direction = sys.argv[3]
    speed = sys.argv[4]
    duration = sys.argv[5]
    
    # Helper process should not output anything except through controlled channels
    control_motor_helper(dir_pin, pwm_pin, direction, speed, duration)
"""
    
    # Create a temporary file
    fd, script_path = tempfile.mkstemp(suffix='.py')
    with os.fdopen(fd, 'w') as f:
        f.write(script_content)
    
    # Make the script executable
    os.chmod(script_path, 0o755)
    
    return script_path

def control_motor(direction, speed, duration, dir_pin, pwm_pin):
    log_message({"status": "info", "message": f"Setting up motor control for DIR={dir_pin}, PWM={pwm_pin}"})
    
    # Create the helper script
    helper_script = create_helper_script()
    log_message({"status": "info", "message": f"Created helper script at {helper_script}"})
    
    try:
        # Run the helper script as a separate process with a timeout
        # This isolates the GPIO operations from the SSH session
        log_message({"status": "info", "message": "Starting motor control in isolated process"})
        
        # Use subprocess with minimal output for web compatibility
        log_message({"status": "info", "message": f"Controlling motor: DIR={dir_pin}, PWM={pwm_pin}, speed={speed}%"})
        
        # Note: Our helper script expects pin args first, then direction and other params
        cmd = ["python3", helper_script, str(dir_pin), str(pwm_pin), direction, str(speed), str(duration)]
        
        # Run the subprocess with all output suppressed
        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Wait with timeout
        try:
            process.wait(timeout=5)
            
            if process.returncode == 0:
                log_message({"status": "success", "message": "Motor control completed successfully"})
            else:
                log_message({"status": "error", "message": "Motor control failed"})
        except subprocess.TimeoutExpired:
            process.kill()
            log_message({"status": "warning", "message": "Process timeout - killed subprocess"})
            
    except subprocess.TimeoutExpired:
        log_message({"status": "warning", "message": "Motor control timeout - script may still be running"})
    except Exception as e:
        log_message({"status": "error", "message": f"Control error: {str(e)}"})
    finally:
        # Make sure to clean up the temporary file
        try:
            os.unlink(helper_script)
            log_message({"status": "info", "message": "Cleaned up helper script"})
        except:
            pass

if __name__ == "__main__":
    # Handle parameters
    if len(sys.argv) < 6:
        log_message({"status": "error", "message": "Usage: python motor_control.py <direction> <speed> <duration> <dir_pin> <pwm_pin>"})
        sys.exit(1)
    
    try:
        direction = sys.argv[1].strip().lower()
        speed = int(sys.argv[2])
        duration = float(sys.argv[3])
        dir_pin = int(sys.argv[4])
        pwm_pin = int(sys.argv[5])
        
        # Basic validation
        if direction not in ['forward', 'reverse']:
            log_message({"status": "error", "message": "Direction must be 'forward' or 'reverse'"})
            sys.exit(1)
        if not 0 <= speed <= 100:
            log_message({"status": "error", "message": "Speed must be between 0 and 100"})
            sys.exit(1)
        if duration <= 0:
            log_message({"status": "error", "message": "Duration must be positive"})
            sys.exit(1)
            
        # Cap duration at 2 seconds for safety
        duration = min(duration, 2000)
        
        # Run the motor control in a way that won't crash the SSH session
        control_motor(direction, speed, duration, dir_pin, pwm_pin)
        
    except Exception as e:
        log_message({"status": "error", "message": f"Error: {str(e)}"})
        sys.exit(1)
