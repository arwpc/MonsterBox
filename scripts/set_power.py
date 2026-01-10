#!/usr/bin/env python3
import sys
import json
import os
import lgpio
import time

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'power_config.json')

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                return json.load(f)
        except:
            pass
    return {"relayPin": 17, "activeLow": False}

def set_power(state):
    cfg = load_config()
    pin = int(cfg.get('relayPin', 17))
    active_low = cfg.get('activeLow', False)
    
    # Determine level
    # If activeLow: ON=0, OFF=1
    # If activeHigh: ON=1, OFF=0
    if active_low:
        level = 0 if state else 1
    else:
        level = 1 if state else 0
        
    print(f"Setting Power Relay on Pin {pin} to {'ON' if state else 'OFF'} (Level {level})")
    
    try:
        h = lgpio.gpiochip_open(0)
        lgpio.gpio_claim_output(h, pin)
        lgpio.gpio_write(h, pin, level)
        lgpio.gpiochip_close(h)
        print("Success")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: ./set_power.py [on|off]")
        sys.exit(1)
        
    cmd = sys.argv[1].lower()
    if cmd in ['on', '1', 'true']:
        set_power(True)
    elif cmd in ['off', '0', 'false']:
        set_power(False)
    else:
        print("Invalid argument")
        sys.exit(1)
