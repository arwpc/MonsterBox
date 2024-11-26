from gpiozero import PWMOutputDevice, DigitalOutputDevice
import time
import sys
import json

def log_message(message):
    print(json.dumps(message))
    sys.stdout.flush()

def control_motor(dir_pin, pwm_pin, direction, speed, duration):
    try:
        # Create motor control objects
        dir_control = DigitalOutputDevice(dir_pin)
        pwm_control = PWMOutputDevice(pwm_pin, frequency=100)
        
        # Set direction
        dir_control.value = 1 if direction == 'forward' else 0
        
        # Set speed (0 to 1)
        speed_value = float(speed) / 100.0
        pwm_control.value = speed_value
        
        log_message({
            "status": "success",
            "message": f"Motor started: direction={direction}, speed={speed}%"
        })
        
        # Run for specified duration
        time.sleep(float(duration))
        
        # Stop motor
        pwm_control.value = 0
        
        log_message({
            "status": "success",
            "message": "Motor stopped"
        })
        
    except Exception as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        raise
    finally:
        # gpiozero handles cleanup automatically
        pass

if __name__ == "__main__":
    if len(sys.argv) != 6:
        log_message({
            "status": "error",
            "message": "Usage: python motor_control.py <dir_pin> <pwm_pin> <direction> <speed> <duration>"
        })
        sys.exit(1)

    try:
        dir_pin = int(sys.argv[1])
        pwm_pin = int(sys.argv[2])
        direction = sys.argv[3]
        speed = float(sys.argv[4])
        duration = float(sys.argv[5])

        if direction not in ['forward', 'reverse']:
            raise ValueError("Direction must be 'forward' or 'reverse'")
        if not (0 <= speed <= 100):
            raise ValueError("Speed must be between 0 and 100")
        if duration <= 0:
            raise ValueError("Duration must be positive")

        control_motor(dir_pin, pwm_pin, direction, speed, duration)

    except ValueError as e:
        log_message({
            "status": "error",
            "message": str(e)
        })
        sys.exit(1)
    except Exception as e:
        log_message({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        })
        sys.exit(1)
