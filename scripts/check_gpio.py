#!/usr/bin/env python3
import sys
import json
from gpiozero import Device
from gpiozero.pins.mock import MockFactory

def get_used_pins():
    try:
        with open('config/parts.json', 'r') as f:
            parts = json.load(f)
            used_pins = set()
            for part in parts:
                if 'gpioPin' in part:
                    used_pins.add(int(part['gpioPin']))
                if 'directionPin' in part:
                    used_pins.add(int(part['directionPin']))
                if 'pwmPin' in part:
                    used_pins.add(int(part['pwmPin']))
            return used_pins
    except:
        return set()  # Return empty set if file doesn't exist or other error

def check_pin_available(pin):
    try:
        pin = int(pin)
        used_pins = get_used_pins()
        
        if pin in used_pins:
            print('unavailable')
            return False
            
        Device.pin_factory = MockFactory() if Device.pin_factory is None else Device.pin_factory
        Device.pin_factory.reserve_pin(pin)
        Device.pin_factory.release_pin(pin)
        print('available')
        return True
    except:
        print('unavailable')
        return False

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('unavailable')
        sys.exit(1)
    try:
        pin = int(sys.argv[1])
        check_pin_available(pin)
    except ValueError:
        print('unavailable')
        sys.exit(1)
