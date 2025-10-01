#!/usr/bin/env python3
"""Continuous wiper motor cycle using BTS7960.
Forward 20s -> pause 5s -> reverse 20s -> pause 5s ... until SPACE pressed.
Pins (BCM): L_EN=17, R_EN=27, PWM=18.
Uses pigpio first (requires pigpiod running), falls back to RPi.GPIO.
"""
import time, sys, select, termios, tty, traceback

LEFT_ENABLE_PIN = 17
RIGHT_ENABLE_PIN = 27
PWM_PIN = 18           # Set to None for full-power only (no speed modulation)
SPEED = 70             # 0-100 duty
FORWARD_SECONDS = 20
REVERSE_SECONDS = 20
PAUSE_SECONDS = 5
PWM_FREQUENCY = 1000   # Hz for RPi.GPIO fallback
LOOP_SLEEP = 0.05

pig = None
GPIO = None
pwm_instance = None

def setup_pigpio():
    global pig
    try:
        import pigpio
        pig = pigpio.pi()
        if not pig.connected:
            pig = None
    except Exception:
        pig = None

def setup_rpi_gpio():
    global GPIO
    import RPi.GPIO as GPIO
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(LEFT_ENABLE_PIN, GPIO.OUT)
    GPIO.setup(RIGHT_ENABLE_PIN, GPIO.OUT)
    if PWM_PIN is not None:
        GPIO.setup(PWM_PIN, GPIO.OUT)
    return GPIO

def start_pwm(speed):
    global pwm_instance
    if pig:
        if PWM_PIN is not None:
            duty = int(255 * (speed/100.0))
            pig.set_PWM_dutycycle(PWM_PIN, duty)
    else:
        if PWM_PIN is not None:
            if pwm_instance is None:
                pwm_instance = GPIO.PWM(PWM_PIN, PWM_FREQUENCY)
                pwm_instance.start(speed)
            else:
                pwm_instance.ChangeDutyCycle(speed)

def stop_pwm():
    global pwm_instance
    if pig:
        if PWM_PIN is not None:
            pig.set_PWM_dutycycle(PWM_PIN, 0)
    else:
        if pwm_instance:
            pwm_instance.ChangeDutyCycle(0)

def set_direction(direction):
    # direction: 'forward' or 'reverse'
    if pig:
        pig.set_mode(LEFT_ENABLE_PIN, 1)
        pig.set_mode(RIGHT_ENABLE_PIN, 1)
        if PWM_PIN is not None:
            pig.set_mode(PWM_PIN, 1)
        if direction == 'forward':
            pig.write(LEFT_ENABLE_PIN,1); pig.write(RIGHT_ENABLE_PIN,0)
        else:
            pig.write(LEFT_ENABLE_PIN,0); pig.write(RIGHT_ENABLE_PIN,1)
    else:
        if direction == 'forward':
            GPIO.output(LEFT_ENABLE_PIN, True); GPIO.output(RIGHT_ENABLE_PIN, False)
        else:
            GPIO.output(LEFT_ENABLE_PIN, False); GPIO.output(RIGHT_ENABLE_PIN, True)

def motor_off():
    stop_pwm()
    if pig:
        pig.write(LEFT_ENABLE_PIN,0)
        pig.write(RIGHT_ENABLE_PIN,0)
    else:
        GPIO.output(LEFT_ENABLE_PIN, False)
        GPIO.output(RIGHT_ENABLE_PIN, False)

def key_space_pressed():
    dr,_,_ = select.select([sys.stdin],[],[],0)
    if dr:
        ch = sys.stdin.read(1)
        return ch == ' '
    return False

def run_phase(direction, duration):
    set_direction(direction)
    start_pwm(SPEED)
    t0 = time.time()
    while time.time() - t0 < duration:
        if key_space_pressed():
            raise KeyboardInterrupt
        time.sleep(LOOP_SLEEP)
    motor_off()

def pause_phase(duration):
    motor_off()
    t0 = time.time()
    while time.time() - t0 < duration:
        if key_space_pressed():
            raise KeyboardInterrupt
        time.sleep(LOOP_SLEEP)

def main():
    old_attrs = termios.tcgetattr(sys.stdin)
    tty.setcbreak(sys.stdin.fileno())
    print("Starting wiper cycle. Press SPACE to stop.")
    print(f"Forward {FORWARD_SECONDS}s -> pause {PAUSE_SECONDS}s -> reverse {REVERSE_SECONDS}s -> pause {PAUSE_SECONDS}s")
    try:
        setup_pigpio()
        backend = 'pigpio' if pig else 'RPi.GPIO'
        if not pig:
            setup_rpi_gpio()
        print(f"Backend: {backend}")
        if PWM_PIN is None:
            print("PWM_PIN is None: full-power toggling only.")
        while True:
            print("Forward...")
            run_phase('forward', FORWARD_SECONDS)
            print("Pause...")
            pause_phase(PAUSE_SECONDS)
            print("Reverse...")
            run_phase('reverse', REVERSE_SECONDS)
            print("Pause...")
            pause_phase(PAUSE_SECONDS)
    except KeyboardInterrupt:
        print("\nSpace pressed. Stopping...")
    except Exception as e:
        print("Error:", e)
        traceback.print_exc()
    finally:
        try: motor_off()
        except Exception: pass
        if pig:
            try: pig.stop()
            except Exception: pass
        if GPIO:
            try: GPIO.cleanup()
            except Exception: pass
        try: termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_attrs)
        except Exception: pass
        print("Clean exit.")

if __name__ == '__main__':
    main()
