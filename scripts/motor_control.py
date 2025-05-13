#!/usr/bin/env python3

import subprocess
import json
import sys
import os
import tempfile

def log_message(message):
    # Make sure messages are very visible
    print("\n" + "=" * 50)
    print(json.dumps(message), flush=True)
    print("=" * 50 + "\n")
    sys.stdout.flush()

# Create a minimal helper script for GPIO control that will run in a separate process
def create_helper_script():
    script_content = """
#!/usr/bin/env python3
import RPi.GPIO as GPIO
import time
import sys
import os

# Run in a separate process with limited duration
def control_motor_helper(dir_pin, pwm_pin, direction, speed, duration):
    try:
        dir_pin = int(dir_pin)
        pwm_pin = int(pwm_pin)
        speed = int(speed)
        duration = float(duration) / 1000.0  # Convert to seconds
        
        # Make sure we are using non-root access
        os.environ['GPIOZERO_PIN_FACTORY'] = 'rpigpio'
        
        # Set up GPIO - use BCM numbering
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(dir_pin, GPIO.OUT)
        GPIO.setup(pwm_pin, GPIO.OUT)
        
        # Set direction
        GPIO.output(dir_pin, GPIO.HIGH if direction == 'forward' else GPIO.LOW)
        
        # Set up PWM for pin 13 (optimized for hardware PWM pin)
        freq = 100  # 100 Hz is good for DC motors
        if pwm_pin == 13 or pwm_pin == 18 or pwm_pin == 12 or pwm_pin == 19:
            # These are hardware PWM pins, can use higher frequency
            freq = 200  # Higher frequency for hardware PWM pins
            
        pwm = GPIO.PWM(pwm_pin, freq)
        pwm.start(0)
        
        # Ramp up safely to specified speed
        for dc in range(0, speed + 1, 10):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.05)
        
        # Hold at specified speed
        time.sleep(max(0.1, min(duration, 0.5)))
        
        # Ramp down
        for dc in range(speed, -1, -10):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.05)
        
        # Cleanup
        pwm.stop()
        GPIO.cleanup()
        sys.exit(0)
    except Exception as e:
        # Make sure to exit cleanly even on error
        try:
            GPIO.cleanup()
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 6:
        sys.exit(1)
        
    dir_pin = sys.argv[1]
    pwm_pin = sys.argv[2]
    direction = sys.argv[3]
    speed = sys.argv[4]
    duration = sys.argv[5]
    
    # Print directly to stderr for visibility in parent process
    print(f"HELPER STARTING: DIR={dir_pin}, PWM={pwm_pin}, direction={direction}", file=sys.stderr)
    
    # Run the motor control
    control_motor_helper(dir_pin, pwm_pin, direction, speed, duration)
    
    # Confirm completion
    print(f"HELPER COMPLETED", file=sys.stderr)
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
        
        # Use subprocess with a timeout - very verbose output
        log_message({"status": "info", "message": f"ATTEMPTING MOTOR CONTROL NOW: DIR={dir_pin}, PWM={pwm_pin}, speed={speed}%"})
        
        # Note: Our helper script expects pin args first, then direction and other params
        cmd = ["python3", helper_script, str(dir_pin), str(pwm_pin), direction, str(speed), str(duration)]
        
        # Use subprocess.Popen for better output visibility
        log_message({"status": "info", "message": "Running motor control - watch for motor movement..."})
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Wait for completion with timeout
        try:
            stdout, stderr = process.communicate(timeout=5)
            
            # Display any output
            if stdout:
                log_message({"status": "info", "message": f"Helper output: {stdout}"})
            
            if process.returncode == 0:
                log_message({"status": "success", "message": "MOTOR CONTROL SUCCESSFUL! Did the motor move?"})
            else:
                log_message({"status": "error", "message": f"Helper error: {stderr}"})
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
