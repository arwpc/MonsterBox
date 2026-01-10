import lgpio
import time
import sys

# Pins for Bow At The Waist (Part 3)
RPWM = 19
LPWM = 21
REN = 5
LEN = 22

def test_motor():
    print(f"Testing BTS7960 on Pins: RPWM={RPWM}, LPWM={LPWM}, REN={REN}, LEN={LEN}")
    
    h = lgpio.gpiochip_open(0)
    
    try:
        # Setup Pins
        lgpio.gpio_claim_output(h, RPWM)
        lgpio.gpio_claim_output(h, LPWM)
        lgpio.gpio_claim_output(h, REN)
        lgpio.gpio_claim_output(h, LEN)
        
        # Ensure STOP
        lgpio.gpio_write(h, RPWM, 0)
        lgpio.gpio_write(h, LPWM, 0)
        lgpio.gpio_write(h, REN, 0)
        lgpio.gpio_write(h, LEN, 0)
        time.sleep(0.5)
        
        # Enable Driver
        print("Enabling Driver (REN/LEN HIGH)...")
        lgpio.gpio_write(h, REN, 1)
        lgpio.gpio_write(h, LEN, 1)
        time.sleep(0.5)
        
        # Test Direction 1 (Forward/Extend)
        print("Testing Direction 1 (RPWM HIGH)... 2 seconds")
        lgpio.gpio_write(h, RPWM, 1)
        lgpio.gpio_write(h, LPWM, 0)
        time.sleep(2)
        
        # Stop
        print("Stopping...")
        lgpio.gpio_write(h, RPWM, 0)
        time.sleep(1)
        
        # Test Direction 2 (Reverse/Retract)
        print("Testing Direction 2 (LPWM HIGH)... 2 seconds")
        lgpio.gpio_write(h, LPWM, 1)
        lgpio.gpio_write(h, RPWM, 0)
        time.sleep(2)
        
        # Stop
        print("Stopping...")
        lgpio.gpio_write(h, LPWM, 0)
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Cleanup
        lgpio.gpio_write(h, RPWM, 0)
        lgpio.gpio_write(h, LPWM, 0)
        lgpio.gpio_write(h, REN, 0)
        lgpio.gpio_write(h, LEN, 0)
        lgpio.gpiochip_close(h)
        print("Cleanup Complete")

if __name__ == "__main__":
    test_motor()
