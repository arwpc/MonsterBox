#!/usr/bin/env python3
import sys
from gpiozero import Device
from gpiozero.pins.mock import MockFactory

def check_pin_available(pin):
    try:
        Device.pin_factory = MockFactory() if Device.pin_factory is None else Device.pin_factory
        Device.pin_factory.reserve_pin(int(pin))
        Device.pin_factory.release_pin(int(pin))
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
