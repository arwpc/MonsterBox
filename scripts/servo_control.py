import RPi.GPIO as GPIO
import smbus
import sys
import time
import json

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
    def __init__(self, address=0x40, bus_number=1, frequency=50):
        self.bus = smbus.SMBus(bus_number)
        # Convert hex string to int if needed
        self.address = int(address, 16) if isinstance(address, str) else address
        self.set_all_pwm(0, 0)
        self.bus.write_byte_data(self.address, PCA9685_MODE1, 0x00)
        self.set_pwm_freq(frequency)
        self.current_angle = 90  # Initialize at center position

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

def get_part_config(part_id):
    try:
        with open('data/parts.json', 'r') as f:
            parts = json.load(f)
            for part in parts:
                if str(part['id']) == str(part_id):
                    return part
    except Exception as e:
        print(f"Error reading parts configuration: {str(e)}")
        return None

def angle_to_duty_cycle(angle):
    return 2.5 + (angle / 18.0)  # Maps 0-180 degrees to 2.5-12.5% duty cycle

# Dictionary to store current angles for each pin/channel
current_angles = {}

def move_servo_gradually(control_type, pin_or_channel, target_angle, duration, servo_type, part_id=None):
    global current_angles
    pin_key = f"{control_type}_{pin_or_channel}"
    
    # Get current angle, default to center position if not set
    start_angle = current_angles.get(pin_key, 90)
    
    step_time = 0.02  # Step time for smooth movement
    steps = int(duration / step_time)
    step_angle = (target_angle - start_angle) / steps
    gpio_used = False

    try:
        print("Initializing servo movement...")
        
        if control_type == 'pca9685':
            # Get PCA9685 settings from part configuration
            part_config = get_part_config(part_id) if part_id else None
            pca9685_settings = part_config.get('pca9685Settings', {}) if part_config else {}
            
            # Use settings from config or defaults
            frequency = pca9685_settings.get('frequency', 50)
            address = pca9685_settings.get('address', '0x40')
            
            pca = PCA9685(address=address, frequency=frequency)
            print("Movement started")  # Signal that movement has begun
            
            for step in range(steps + 1):
                current_angle = start_angle + step_angle * step
                pulse = int(angle_to_duty_cycle(current_angle) / 100 * 4096)
                pca.set_pwm(int(pin_or_channel), 0, pulse)
                time.sleep(step_time)
                
        else:  # GPIO control
            gpio_used = True
            pwm = setup_gpio(int(pin_or_channel))
            pwm.start(angle_to_duty_cycle(start_angle))
            print("Movement started")  # Signal that movement has begun
            
            for step in range(steps + 1):
                current_angle = start_angle + step_angle * step
                pwm.ChangeDutyCycle(angle_to_duty_cycle(current_angle))
                time.sleep(step_time)
            pwm.stop()
            # Only cleanup the specific pin that was used
            GPIO.cleanup(int(pin_or_channel))
        
        # Update the current angle after successful movement
        current_angles[pin_key] = target_angle
        print("Movement completed")
        
    except Exception as e:
        if gpio_used:
            # Only cleanup the specific pin if it was used and an error occurred
            GPIO.cleanup(int(pin_or_channel))
        print(f"Error during servo movement: {str(e)}")
        raise e

def stop_servo(control_type, pin_or_channel, part_id=None):
    global current_angles
    pin_key = f"{control_type}_{pin_or_channel}"
    
    gpio_used = False
    try:
        print("Initializing servo stop...")
        
        if control_type == 'pca9685':
            # Get PCA9685 settings from part configuration
            part_config = get_part_config(part_id) if part_id else None
            pca9685_settings = part_config.get('pca9685Settings', {}) if part_config else {}
            
            # Use settings from config or defaults
            frequency = pca9685_settings.get('frequency', 50)
            address = pca9685_settings.get('address', '0x40')
            
            pca = PCA9685(address=address, frequency=frequency)
            print("Movement started")  # Signal that movement has begun
            # Move to center position (90 degrees)
            pulse = int(angle_to_duty_cycle(90) / 100 * 4096)
            pca.set_pwm(int(pin_or_channel), 0, pulse)
            print("Movement completed")
            
        else:  # GPIO control
            gpio_used = True
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(int(pin_or_channel), GPIO.OUT)
            pwm = GPIO.PWM(int(pin_or_channel), 50)
            print("Movement started")  # Signal that movement has begun
            pwm.start(angle_to_duty_cycle(90))  # Move to center position
            time.sleep(0.5)  # Give time to reach position
            pwm.stop()
            # Only cleanup the specific pin that was used
            GPIO.cleanup(int(pin_or_channel))
            print("Movement completed")
        
        # Update current angle to center position
        current_angles[pin_key] = 90
        
    except Exception as e:
        if gpio_used:
            # Only cleanup the specific pin if it was used and an error occurred
            GPIO.cleanup(int(pin_or_channel))
        print(f"Error during servo stop: {str(e)}")
        raise e

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python servo_control.py <command> <control_type> <pin_or_channel> <angle> <duration> [servo_type] [part_id]")
        sys.exit(1)

    command = sys.argv[1]
    control_type = sys.argv[2]
    pin_or_channel = sys.argv[3]

    try:
        if command == "test":
            if len(sys.argv) < 7:
                print("Usage for test: python servo_control.py test <control_type> <pin_or_channel> <angle> <duration> <servo_type> [part_id]")
                sys.exit(1)
            angle = float(sys.argv[4])
            duration = float(sys.argv[5])
            servo_type = sys.argv[6]
            part_id = sys.argv[7] if len(sys.argv) > 7 else None
            
            print(json.dumps({
                "status": "initializing",
                "message": "Starting servo movement"
            }))
            sys.stdout.flush()
            
            move_servo_gradually(control_type, pin_or_channel, angle, duration, servo_type, part_id)
            
            print(json.dumps({
                "status": "success",
                "message": "Servo movement completed successfully"
            }))
            
        elif command == "stop":
            part_id = sys.argv[7] if len(sys.argv) > 7 else None
            stop_servo(control_type, pin_or_channel, part_id)
            print(json.dumps({
                "status": "success",
                "message": "Servo stopped successfully"
            }))
        else:
            print(json.dumps({
                "status": "error",
                "message": f"Unknown command: {command}"
            }))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"Error controlling servo: {str(e)}"
        }))
        sys.exit(1)
