import RPi.GPIO as GPIO
import sys
import time
from adafruit_pca9685 import PCA9685
import board
import busio

def setup_pca9685():
    i2c = busio.I2C(board.SCL, board.SDA)
    pca = PCA9685(i2c)
    pca.frequency = 50
    return pca

def angle_to_pulse(angle, min_pulse, max_pulse):
    return min_pulse + (angle / 180) * (max_pulse - min_pulse)

def control_servo(channel, angle, servo_type, min_pulse, max_pulse, duration):
    pca = setup_pca9685()
    try:
        if servo_type == 'FS90R':
            # For continuous rotation servo
            if angle == 90:
                pca.channels[channel].duty_cycle = 0  # Stop
            elif angle < 90:
                # Clockwise rotation
                speed = int((90 - angle) / 90 * 65535)
                pca.channels[channel].duty_cycle = speed
            else:
                # Counter-clockwise rotation
                speed = int((angle - 90) / 90 * 65535)
                pca.channels[channel].duty_cycle = speed
        else:
            # For standard servos
            pulse = angle_to_pulse(angle, min_pulse, max_pulse)
            pca.channels[channel].duty_cycle = int(pulse / 20000 * 65535)
        
        time.sleep(duration / 1000)  # Convert duration to seconds
    finally:
        pca.channels[channel].duty_cycle = 0
        pca.deinit()

def stop_servo(channel):
    pca = setup_pca9685()
    try:
        pca.channels[channel].duty_cycle = 0
    finally:
        pca.deinit()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python servo_control.py <command> <channel> [angle] [servo_type] [min_pulse] [max_pulse] [duration]")
        sys.exit(1)

    command = sys.argv[1]
    channel = int(sys.argv[2])

    try:
        if command == "test":
            if len(sys.argv) != 8:
                print("Usage for test: python servo_control.py test <channel> <angle> <servo_type> <min_pulse> <max_pulse> <duration>")
                sys.exit(1)
            angle = float(sys.argv[3])
            servo_type = sys.argv[4]
            min_pulse = int(sys.argv[5])
            max_pulse = int(sys.argv[6])
            duration = int(sys.argv[7])
            control_servo(channel, angle, servo_type, min_pulse, max_pulse, duration)
            print("Servo test successful")
        elif command == "stop":
            stop_servo(channel)
            print("Servo stopped successfully")
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    except Exception as e:
        print(f"Error controlling servo: {str(e)}")
        sys.exit(1)