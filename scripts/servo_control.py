import RPi.GPIO as GPIO
import smbus
import sys
import time

# PCA9685 registers
PCA9685_MODE1 = 0x00
PCA9685_PRESCALE = 0xFE
LED0_ON_L = 0x06
LED0_ON_H = 0x07
LED0_OFF_L = 0x08
LED0_OFF_H = 0x09

def setup_gpio(pin):
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(pin, GPIO.OUT)
    return GPIO.PWM(pin, 50)  # 50 Hz PWM frequency

class PCA9685:
    def __init__(self, address=0x40, bus_number=1):
        self.bus = smbus.SMBus(bus_number)
        self.address = address
        self.set_all_pwm(0, 0)
        self.bus.write_byte_data(self.address, PCA9685_MODE1, 0x00)

    def set_pwm_freq(self, freq_hz):
        prescaleval = 25000000.0    # 25MHz
        prescaleval /= 4096.0       # 12-bit
        prescaleval /= float(freq_hz)
        prescaleval -= 1.0
        prescale = int(prescaleval + 0.5)
        oldmode = self.bus.read_byte_data(self.address, PCA9685_MODE1)
        newmode = (oldmode & 0x7F) | 0x10
        self.bus.write_byte_data(self.address, PCA9685_MODE1, newmode)
        self.bus.write_byte_data(self.address, PCA9685_PRESCALE, prescale)
        self.bus.write_byte_data(self.address, PCA9685_MODE1, oldmode)
        time.sleep(0.005)
        self.bus.write_byte_data(self.address, PCA9685_MODE1, oldmode | 0xa1)

    def set_pwm(self, channel, on, off):
        self.bus.write_byte_data(self.address, LED0_ON_L + 4 * channel, on & 0xFF)
        self.bus.write_byte_data(self.address, LED0_ON_H + 4 * channel, on >> 8)
        self.bus.write_byte_data(self.address, LED0_OFF_L + 4 * channel, off & 0xFF)
        self.bus.write_byte_data(self.address, LED0_OFF_H + 4 * channel, off >> 8)

    def set_all_pwm(self, on, off):
        self.bus.write_byte_data(self.address, LED0_ON_L, on & 0xFF)
        self.bus.write_byte_data(self.address, LED0_ON_H, on >> 8)
        self.bus.write_byte_data(self.address, LED0_OFF_L, off & 0xFF)
        self.bus.write_byte_data(self.address, LED0_OFF_H, off >> 8)

def angle_to_duty_cycle(angle):
    return 2.5 + (angle / 18.0)  # Maps 0-180 degrees to 2.5-12.5% duty cycle

def control_servo(pin, angle, use_pca9685, channel=None, pca9685=None):
    if use_pca9685 and pca9685:
        pulse = int(angle_to_duty_cycle(angle) / 100 * 4096)
        pca9685.set_pwm(channel, 0, pulse)
    else:
        pwm = setup_gpio(pin)
        try:
            pwm.start(angle_to_duty_cycle(angle))
            time.sleep(0.5)  # Allow time for the servo to move
        finally:
            pwm.stop()
            GPIO.cleanup(pin)

def stop_servo(pin, use_pca9685, channel=None, pca9685=None):
    if use_pca9685 and pca9685:
        pca9685.set_pwm(channel, 0, 0)
    else:
        GPIO.cleanup(pin)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python servo_control.py <command> <pin> <use_pca9685> [angle] [channel]")
        sys.exit(1)

    command = sys.argv[1]
    pin = int(sys.argv[2])
    use_pca9685 = sys.argv[3].lower() == 'true'

    pca9685 = None
    if use_pca9685:
        pca9685 = PCA9685()
        pca9685.set_pwm_freq(50)  # 50 Hz frequency for servos

    try:
        if command == "test":
            if len(sys.argv) != 6:
                print("Usage for test: python servo_control.py test <pin> <use_pca9685> <angle> <channel>")
                sys.exit(1)
            angle = float(sys.argv[4])
            channel = int(sys.argv[5]) if use_pca9685 else None
            control_servo(pin, angle, use_pca9685, channel, pca9685)
            print("Servo test successful")
        elif command == "stop":
            channel = int(sys.argv[4]) if use_pca9685 else None
            stop_servo(pin, use_pca9685, channel, pca9685)
            print("Servo stopped successfully")
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    except Exception as e:
        print(f"Error controlling servo: {str(e)}")
        sys.exit(1)
    finally:
        if not use_pca9685:
            GPIO.cleanup()