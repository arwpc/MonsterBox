#!/usr/bin/env python3
"""Simple BTS7960 motor control with pigpio -> RPi.GPIO fallback.

Usage example:
  python3 bts7960_motor_control.py \
    --leftEnablePin 17 --rightEnablePin 27 --pwmPin 18 \
    --direction forward --speed 60 --durationMs 1500

Requirements:
  pigpio daemon running (sudo pigpiod) for best results OR RPi.GPIO installed.

The script outputs a single JSON object on stdout.
"""
import sys, json, time, argparse, traceback

def parse_args():
    p = argparse.ArgumentParser(description='BTS7960 motor control')
    p.add_argument('--leftEnablePin', type=int, required=True)
    p.add_argument('--rightEnablePin', type=int, required=True)
    p.add_argument('--pwmPin', type=int, help='Shared PWM pin (BCM numbering). If omitted runs full power via enables.')
    p.add_argument('--speed', type=int, default=100, help='Speed 0-100 (duty cycle)')
    p.add_argument('--direction', choices=['forward','reverse'], default='forward')
    p.add_argument('--durationMs', type=int, default=1000)
    p.add_argument('--maxDurationMs', type=int, default=10000)
    return p.parse_args()

def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v

def main():
    args = parse_args()
    args.speed = clamp(args.speed,0,100)
    if args.durationMs > args.maxDurationMs:
        args.durationMs = args.maxDurationMs
    start = time.time()
    result = {
        'success': False,
        'backend': None,
        'direction': args.direction,
        'speed': args.speed,
        'requestedDurationMs': args.durationMs
    }
    pig = None
    GPIO = None
    pwm_instance = None
    try:
        # Try pigpio first
        try:
            import pigpio
            pig = pigpio.pi()
            if not pig.connected:
                pig = None
        except Exception:
            pig = None
        if pig:
            result['backend'] = 'pigpio'
            # pigpio constant for OUTPUT is 1; use literal to avoid analysis issues
            pig.set_mode(args.leftEnablePin, 1)
            pig.set_mode(args.rightEnablePin, 1)
            if args.pwmPin is not None:
                pig.set_mode(args.pwmPin, 1)
            # Set direction
            if args.direction == 'forward':
                pig.write(args.leftEnablePin,1); pig.write(args.rightEnablePin,0)
            else:
                pig.write(args.leftEnablePin,0); pig.write(args.rightEnablePin,1)
            # Speed
            if args.pwmPin is not None:
                duty = int(255 * (args.speed/100.0))
                pig.set_PWM_dutycycle(args.pwmPin, duty)
            time.sleep(args.durationMs/1000.0)
            # Stop
            if args.pwmPin is not None:
                pig.set_PWM_dutycycle(args.pwmPin,0)
            pig.write(args.leftEnablePin,0); pig.write(args.rightEnablePin,0)
        else:
            # Fallback to RPi.GPIO
            try:
                import RPi.GPIO as GPIO
            except Exception:
                raise RuntimeError('Neither pigpio (daemon running?) nor RPi.GPIO available.')
            result['backend'] = 'RPi.GPIO'
            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(args.leftEnablePin, GPIO.OUT)
            GPIO.setup(args.rightEnablePin, GPIO.OUT)
            if args.pwmPin is not None:
                GPIO.setup(args.pwmPin, GPIO.OUT)
            if args.direction == 'forward':
                GPIO.output(args.leftEnablePin, GPIO.HIGH); GPIO.output(args.rightEnablePin, GPIO.LOW)
            else:
                GPIO.output(args.leftEnablePin, GPIO.LOW); GPIO.output(args.rightEnablePin, GPIO.HIGH)
            if args.pwmPin is not None:
                pwm_instance = GPIO.PWM(args.pwmPin, 1000)
                pwm_instance.start(args.speed)
            time.sleep(args.durationMs/1000.0)
            if pwm_instance:
                pwm_instance.stop()
            GPIO.output(args.leftEnablePin, GPIO.LOW); GPIO.output(args.rightEnablePin, GPIO.LOW)
    except Exception as e:
        result['error'] = str(e)
        result['trace'] = traceback.format_exc()
    finally:
        if pig:
            try: pig.stop()
            except Exception: pass
        if 'GPIO' in globals() and GPIO is not None:
            try: GPIO.cleanup()
            except Exception: pass
        result['actualDurationMs'] = int((time.time()-start)*1000)
        result['success'] = 'error' not in result
        print(json.dumps(result))

if __name__ == '__main__':
    main()
