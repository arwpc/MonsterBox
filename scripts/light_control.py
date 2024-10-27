import RPi.GPIO as GPIO
import time
import sys

def setup_gpio():
    print("Setting up GPIO...")
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

def control_light(gpio_pin, state, duration=None):
    print(f"Initializing light control on pin {gpio_pin}")
    setup_gpio()
    GPIO.setup(gpio_pin, GPIO.OUT)
    
    # Store initial state for debugging
    initial_state = GPIO.input(gpio_pin)
    print(f"Initial pin state: {initial_state}")

    try:
        if state.lower() == 'on':
            print(f"Setting pin {gpio_pin} to LOW (ON)")
            GPIO.output(gpio_pin, GPIO.LOW)
            # Verify the state was set
            current_state = GPIO.input(gpio_pin)
            print(f"Pin {gpio_pin} state after setting ON: {current_state}")
        elif state.lower() == 'off':
            print(f"Setting pin {gpio_pin} to HIGH (OFF)")
            GPIO.output(gpio_pin, GPIO.HIGH)
            # Verify the state was set
            current_state = GPIO.input(gpio_pin)
            print(f"Pin {gpio_pin} state after setting OFF: {current_state}")
        else:
            print("Invalid state. Use 'on' or 'off'.")
            return

        if duration is not None:
            print(f"Waiting for duration: {duration}ms")
            time.sleep(float(duration) / 1000)
            print(f"Duration completed, setting pin {gpio_pin} to HIGH (OFF)")
            GPIO.output(gpio_pin, GPIO.HIGH)
            # Verify final state
            final_state = GPIO.input(gpio_pin)
            print(f"Pin {gpio_pin} final state: {final_state}")
    except Exception as e:
        print(f"Error during light control: {str(e)}")
        raise
    
    # Don't cleanup GPIO to maintain state
    print("Light control operation completed")

if __name__ == "__main__":
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python light_control.py <gpio_pin> <state> [duration]")
        sys.exit(1)

    try:
        gpio_pin = int(sys.argv[1])
        state = sys.argv[2]
        duration = int(sys.argv[3]) if len(sys.argv) == 4 else None

        print(f"Starting light control with pin: {gpio_pin}, state: {state}, duration: {duration}")
        control_light(gpio_pin, state, duration)
        print("Light control completed successfully")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
