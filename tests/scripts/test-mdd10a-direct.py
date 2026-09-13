#!/usr/bin/env python3
"""
Direct MDD10A test - manually control pins to verify wiring
"""
import lgpio
import time
import sys

# Pins/duty/duration are arguments so this can be run against any node without
# editing a tracked file at the bench. Defaults are Orlok's Left Arm at full
# power, which is what this script did before it took arguments.
#   ./test-mdd10a-direct.py [dir_pin] [pwm_pin] [duty_pct] [seconds]
#   Renfield's shake motor, gentle first pass:  ./test-mdd10a-direct.py 26 13 30 1
DIR_PIN = int(sys.argv[1]) if len(sys.argv) > 1 else 23
PWM_PIN = int(sys.argv[2]) if len(sys.argv) > 2 else 12
DUTY_PCT = float(sys.argv[3]) if len(sys.argv) > 3 else 100.0
RUN_SECS = float(sys.argv[4]) if len(sys.argv) > 4 else 5.0

print("🔧 Direct MDD10A Test")
print(f"DIR Pin: {DIR_PIN}, PWM Pin: {PWM_PIN}, Duty: {DUTY_PCT}%, Run: {RUN_SECS}s")
print("   DIR and PWM are NOT interchangeable — swapping them asserts a permanent")
print("   enable and chatters direction at 2 kHz. Confirm against the node's row in")
print("   docs/hardware/gpio_assignments.md before running.")


def drive(h, on):
    """Energize at DUTY_PCT (real PWM below 100%, matching scripts/motor_control.py), or stop."""
    if not on or DUTY_PCT <= 0:
        try:
            lgpio.tx_pwm(h, PWM_PIN, 2000, 0)
        except Exception:
            pass
        lgpio.gpio_write(h, PWM_PIN, 0)
        return
    if DUTY_PCT < 100 and hasattr(lgpio, 'tx_pwm'):
        try:
            lgpio.tx_pwm(h, PWM_PIN, 2000, DUTY_PCT)
            return
        except Exception:
            pass
    lgpio.gpio_write(h, PWM_PIN, 1)

try:
    # Open GPIO
    h = lgpio.gpiochip_open(0)
    print("✅ GPIO opened")
    
    # Claim pins as output
    lgpio.gpio_claim_output(h, DIR_PIN)
    lgpio.gpio_claim_output(h, PWM_PIN)
    print("✅ Pins claimed as outputs")
    
    # Initialize to LOW
    lgpio.gpio_write(h, DIR_PIN, 0)
    lgpio.gpio_write(h, PWM_PIN, 0)
    time.sleep(0.5)
    print("✅ Pins initialized to LOW")
    
    # Test sequence
    print("\n🔴 Setting DIR=LOW (forward), PWM=LOW (stopped)")
    lgpio.gpio_write(h, DIR_PIN, 0)
    lgpio.gpio_write(h, PWM_PIN, 0)
    time.sleep(2)
    
    print(f"🟢 Setting DIR=LOW (forward), PWM={DUTY_PCT}% (running forward)")
    lgpio.gpio_write(h, DIR_PIN, 0)
    time.sleep(0.1)  # Let direction settle
    drive(h, True)
    print(f"   ⏰ Running for {RUN_SECS} seconds...")
    time.sleep(RUN_SECS)
    
    print("🔴 Setting PWM=LOW (stopped)")
    drive(h, False)
    time.sleep(2)
    
    print(f"🟢 Setting DIR=HIGH (reverse), PWM={DUTY_PCT}% (running reverse)")
    lgpio.gpio_write(h, DIR_PIN, 1)
    time.sleep(0.1)  # Let direction settle
    drive(h, True)
    print(f"   ⏰ Running for {RUN_SECS} seconds...")
    time.sleep(RUN_SECS)
    
    print("🔴 Setting PWM=LOW (stopped)")
    drive(h, False)
    lgpio.gpio_write(h, DIR_PIN, 0)
    
    print("\n✅ Test complete - check if motor moved!")
    
    # Cleanup
    lgpio.gpiochip_close(h)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
