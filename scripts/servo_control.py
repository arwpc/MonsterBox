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
        prescaleval = 25000000.0  # 25MHz
        prescaleval /= 4096.0     # 12-bit
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

def move_servo_gradually(control_type, pin_or_channel, start_angle, end_angle, duration, servo_type):
    step_time = 0.02  # Step time for smooth movement
    steps = int(duration / step_time)
    step_angle = (end_angle - start_angle) / steps
    gpio_used = False

    try:
        if control_type == 'pca9685':
            pca = PCA9685()
            pca.set_pwm_freq(50)
            for step in range(steps + 1):
                current_angle = start_angle + step_angle * step
                pulse = int(angle_to_duty_cycle(current_angle) / 100 * 4096)
                pca.set_pwm(int(pin_or_channel), 0, pulse)
                time.sleep(step_time)
        else:  # GPIO control
            gpio_used = True
            pwm = setup_gpio(int(pin_or_channel))
            pwm.start(angle_to_duty_cycle(start_angle))
            for step in range(steps + 1):
                current_angle = start_angle + step_angle * step
                pwm.ChangeDutyCycle(angle_to_duty_cycle(current_angle))
                time.sleep(step_time)
            pwm.stop()
    finally:
        if gpio_used:
            GPIO.cleanup(int(pin_or_channel))

def stop_servo(control_type, pin_or_channel):
    gpio_used = False
    try:
        if control_type == 'pca9685':
            pca = PCA9685()
            pca.set_pwm(int(pin_or_channel), 0, 0)
        else:  # GPIO control
            gpio_used = True
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(int(pin_or_channel), GPIO.OUT)
            pwm = GPIO.PWM(int(pin_or_channel), 50)
            pwm.start(0)
            pwm.stop()
    finally:
        if gpio_used:
            GPIO.cleanup(int(pin_or_channel))

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python servo_control.py <command> <control_type> <pin_or_channel> <angle> <duration> [servo_type]")
        sys.exit(1)

    command = sys.argv[1]
    control_type = sys.argv[2]
    pin_or_channel = sys.argv[3]
    gpio_used = False

    try:
        if command == "test":
            if len(sys.argv) != 7:
                print("Usage for test: python servo_control.py test <control_type> <pin_or_channel> <angle> <duration> <servo_type>")
                sys.exit(1)
            angle = float(sys.argv[4])
            duration = float(sys.argv[5])
            servo_type = sys.argv[6]
            move_servo_gradually(control_type, pin_or_channel, 0, angle, duration, servo_type)
            print("Servo test successful")
        elif command == "stop":
            stop_servo(control_type, pin_or_channel)
            print("Servo stopped successfully")
        else:
            print(f"Unknown command: {command}")
            sys.exit(1)
    except Exception as e:
        print(f"Error controlling servo: {str(e)}")
        sys.exit(1)
