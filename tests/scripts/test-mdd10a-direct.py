#!/usr/bin/env python3
"""
Direct MDD10A test - manually control pins to verify wiring
"""
import lgpio
import time
import sys

DIR_PIN = 23
PWM_PIN = 12

print("🔧 Direct MDD10A Test")
print(f"DIR Pin: {DIR_PIN}, PWM Pin: {PWM_PIN}")

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
    
    print("🟢 Setting DIR=LOW (forward), PWM=HIGH (running forward)")
    lgpio.gpio_write(h, DIR_PIN, 0)
    time.sleep(0.1)  # Let direction settle
    lgpio.gpio_write(h, PWM_PIN, 1)
    print("   ⏰ Running for 5 seconds...")
    time.sleep(5)
    
    print("🔴 Setting PWM=LOW (stopped)")
    lgpio.gpio_write(h, PWM_PIN, 0)
    time.sleep(2)
    
    print("🟢 Setting DIR=HIGH (reverse), PWM=HIGH (running reverse)")
    lgpio.gpio_write(h, DIR_PIN, 1)
    time.sleep(0.1)  # Let direction settle
    lgpio.gpio_write(h, PWM_PIN, 1)
    print("   ⏰ Running for 5 seconds...")
    time.sleep(5)
    
    print("🔴 Setting PWM=LOW (stopped)")
    lgpio.gpio_write(h, PWM_PIN, 0)
    lgpio.gpio_write(h, DIR_PIN, 0)
    
    print("\n✅ Test complete - check if motor moved!")
    
    # Cleanup
    lgpio.gpiochip_close(h)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
