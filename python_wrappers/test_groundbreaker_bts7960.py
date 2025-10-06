#!/usr/bin/env python3
"""
Test script for Groundbreaker BTS7960 wiper motor
Wiring: EN=GPIO17, RPWM=GPIO27, LPWM=GPIO22
"""

import time
import sys

try:
    import pigpio
    HAVE_PIGPIO = True
except ImportError:
    HAVE_PIGPIO = False

try:
    import lgpio
    HAVE_LGPIO = True
except ImportError:
    HAVE_LGPIO = False

# Groundbreaker BTS7960 wiring
EN_PIN = 17      # Brown wire - Enable (can be R_EN or L_EN or both)
RPWM_PIN = 27    # Red wire - Right PWM (forward)
LPWM_PIN = 22    # Orange wire - Left PWM (reverse)

def test_with_pigpio():
    """Test using pigpio library"""
    print("Testing with pigpio...")
    pi = pigpio.pi()
    if not pi.connected:
        print("ERROR: pigpiod not running. Start with: sudo pigpiod")
        return False

    try:
        # Setup pins
        pi.set_mode(EN_PIN, pigpio.OUTPUT)
        pi.set_mode(RPWM_PIN, pigpio.OUTPUT)
        pi.set_mode(LPWM_PIN, pigpio.OUTPUT)

        # Set PWM frequency to 20kHz (BTS7960 recommended)
        pi.set_PWM_frequency(RPWM_PIN, 20000)
        pi.set_PWM_frequency(LPWM_PIN, 20000)

        # Enable the driver (HIGH = enabled for BTS7960)
        pi.write(EN_PIN, 1)
        print(f"[OK] Enabled driver (GPIO {EN_PIN} = HIGH)")

        # Stop first - set both PWM to 0
        pi.set_PWM_dutycycle(RPWM_PIN, 0)
        pi.set_PWM_dutycycle(LPWM_PIN, 0)
        time.sleep(0.5)

        # Test 1: Forward - RPWM active, LPWM off
        print("\n" + "="*50)
        print("TEST 1: Forward for 3 seconds (RPWM=255, LPWM=0)")
        print("="*50)
        pi.set_PWM_dutycycle(LPWM_PIN, 0)
        pi.set_PWM_dutycycle(RPWM_PIN, 255)  # Full speed
        time.sleep(3)
        pi.set_PWM_dutycycle(RPWM_PIN, 0)
        print("[OK] Forward complete")
        time.sleep(1)

        # Test 2: Reverse - LPWM active, RPWM off
        print("\n" + "="*50)
        print("TEST 2: Reverse for 3 seconds (RPWM=0, LPWM=255)")
        print("="*50)
        pi.set_PWM_dutycycle(RPWM_PIN, 0)
        pi.set_PWM_dutycycle(LPWM_PIN, 255)  # Full speed
        time.sleep(3)
        pi.set_PWM_dutycycle(LPWM_PIN, 0)
        print("[OK] Reverse complete")

        # Disable
        pi.write(EN_PIN, 0)
        print("\n[OK] Driver disabled")

        pi.stop()
        return True
        
    except Exception as e:
        print(f"ERROR: {e}")
        pi.stop()
        return False

def test_with_lgpio():
    """Test using lgpio library"""
    print("Testing with lgpio...")
    try:
        h = lgpio.gpiochip_open(0)
    except Exception as e:
        print(f"ERROR: Cannot open GPIO chip: {e}")
        return False

    try:
        # Setup pins
        lgpio.gpio_claim_output(h, EN_PIN)
        lgpio.gpio_claim_output(h, RPWM_PIN)
        lgpio.gpio_claim_output(h, LPWM_PIN)

        # Enable the driver
        lgpio.gpio_write(h, EN_PIN, 1)
        print(f"[OK] Enabled driver (GPIO {EN_PIN} = HIGH)")

        # Stop first
        lgpio.gpio_write(h, RPWM_PIN, 0)
        lgpio.gpio_write(h, LPWM_PIN, 0)
        time.sleep(0.5)

        # Test 1: Forward - RPWM HIGH, LPWM LOW
        print("\n" + "="*50)
        print("TEST 1: Forward for 3 seconds (RPWM=HIGH, LPWM=LOW)")
        print("="*50)
        lgpio.gpio_write(h, LPWM_PIN, 0)
        lgpio.gpio_write(h, RPWM_PIN, 1)
        time.sleep(3)
        lgpio.gpio_write(h, RPWM_PIN, 0)
        print("[OK] Forward complete")
        time.sleep(1)

        # Test 2: Reverse - LPWM HIGH, RPWM LOW
        print("\n" + "="*50)
        print("TEST 2: Reverse for 3 seconds (RPWM=LOW, LPWM=HIGH)")
        print("="*50)
        lgpio.gpio_write(h, RPWM_PIN, 0)
        lgpio.gpio_write(h, LPWM_PIN, 1)
        time.sleep(3)
        lgpio.gpio_write(h, LPWM_PIN, 0)
        print("[OK] Reverse complete")

        # Disable
        lgpio.gpio_write(h, EN_PIN, 0)
        print("\n[OK] Driver disabled")

        lgpio.gpiochip_close(h)
        return True
        
    except Exception as e:
        print(f"ERROR: {e}")
        try:
            lgpio.gpiochip_close(h)
        except:
            pass
        return False

if __name__ == "__main__":
    print("Groundbreaker BTS7960 Wiper Motor Test")
    print("=" * 50)
    print(f"EN Pin:   GPIO {EN_PIN} (Pin 11, Brown)")
    print(f"RPWM Pin: GPIO {RPWM_PIN} (Pin 13, Red)")
    print(f"LPWM Pin: GPIO {LPWM_PIN} (Pin 15, Orange)")
    print("=" * 50)
    print()
    
    success = False
    
    if HAVE_PIGPIO:
        success = test_with_pigpio()
    elif HAVE_LGPIO:
        success = test_with_lgpio()
    else:
        print("ERROR: No GPIO library available (need pigpio or lgpio)")
        sys.exit(1)
    
    if success:
        print("\n" + "="*50)
        print("[SUCCESS] ALL TESTS PASSED!")
        print("="*50)
        sys.exit(0)
    else:
        print("\n" + "="*50)
        print("[FAILED] TESTS FAILED")
        print("="*50)
        sys.exit(1)

