import RPi.GPIO as GPIO
import sys
import time

def test_led(pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT)

    try:
        for _ in range(3):  # Blink 3 times
            GPIO.output(pin, GPIO.HIGH)
            time.sleep(2)  # On for 2 seconds
            GPIO.output(pin, GPIO.LOW)
            time.sleep(2)  # Off for 2 seconds
        print("LED test completed successfully")
    except Exception as e:
        print(f"Error during LED test: {str(e)}")
    finally:
        GPIO.cleanup()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python test_led.py <gpio_pin>")
        sys.exit(1)
    
    try:
        gpio_pin = int(sys.argv[1])
        test_led(gpio_pin)
    except ValueError:
        print("Invalid GPIO pin number")
        sys.exit(1)
