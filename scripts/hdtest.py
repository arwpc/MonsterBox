import time
from adafruit_servokit import ServoKit
import busio
import board

# Initialize the servo
kit = ServoKit(channels=16, i2c=busio.I2C(board.SCL, board.SDA))

# Set up servo on channel 0 (or change as needed)
SERVO_CHANNEL = 0

# Set the pulse width range (adjust if needed)
kit.servo[SERVO_CHANNEL].set_pulse_width_range(1000, 2000)

# Move to center and wait
print("Moving to center (90 degrees)")
kit.servo[SERVO_CHANNEL].angle = 90
time.sleep(2)

# Move slowly through positions
for angle in [80, 100, 90]:  # Small range test
    print(f"Moving to {angle} degrees")
    kit.servo[SERVO_CHANNEL].angle = angle
    time.sleep(2)

print("Test complete - servo should now be at rest")
