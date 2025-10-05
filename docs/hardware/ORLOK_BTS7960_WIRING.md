# Orlok BTS7960 Motor Driver Wiring Guide

## Overview
This document provides wiring instructions for adding a HiLetgo BTS7960 43A High Power Motor Driver Module to Orlok.

**Product**: [HiLetgo BTS7960 43A Motor Driver (Amazon B00WSN98DC)](https://www.amazon.com/dp/B00WSN98DC)

## BTS7960 vs MDD10A/Cytron Comparison

### BTS7960 (IBT-2) Pinout
The BTS7960 is a dual H-bridge driver with the following control pins:
- **RPWM** (Right PWM) - Forward direction PWM control
- **LPWM** (Left PWM) - Reverse direction PWM control  
- **R_EN** (Right Enable) - Enable right side (set HIGH for forward)
- **L_EN** (Left Enable) - Enable left side (set HIGH for reverse)
- **R_IS** (Right Current Sense) - Current feedback (optional)
- **L_IS** (Left Current Sense) - Current feedback (optional)
- **VCC** - Logic power (5V)
- **GND** - Ground

### MDD10A/Cytron Pinout
- **DIR** - Direction control (HIGH/LOW)
- **PWM** - Speed control (PWM signal)
- **VCC** - Logic power (5V)
- **GND** - Ground

### Control Logic Differences

**MDD10A/Cytron (Simple)**:
- DIR = LOW → Forward
- DIR = HIGH → Reverse
- PWM = Speed (0-100%)

**BTS7960 (Dual PWM)**:
- Forward: R_EN = HIGH, RPWM = Speed, L_EN = LOW, LPWM = 0
- Reverse: L_EN = HIGH, LPWM = Speed, R_EN = LOW, RPWM = 0
- Stop: Both EN = LOW or both PWM = 0

## Orlok Current GPIO Usage

### Currently Assigned Pins
Based on `data/character-3/parts.json`:

| GPIO Pin | Board Pin | Part | Type | Usage |
|----------|-----------|------|------|-------|
| 18 | 12 | Left Arm | Linear Actuator | Direction Pin |
| 13 | 33 | Left Arm | Linear Actuator | PWM Pin |
| 23 | 16 | Right Arm | Linear Actuator | Direction Pin |
| 12 | 32 | Right Arm | Linear Actuator | PWM Pin |
| 26 | 37 | Hand Light | Light | GPIO |
| 16 | 36 | PIR Sensor | Sensor | GPIO |
| 17 | 11 | LED | LED | GPIO |
| 6 | 31 | Servo | Servo | GPIO (deprecated - using PCA9685) |

### PCA9685 I2C Servo Controller
- **SDA** - GPIO 2 (Board Pin 3)
- **SCL** - GPIO 3 (Board Pin 5)
- **Channels**: 0 (Head), 4 (Elbow), 5 (Forearm)

### Available GPIO Pins for BTS7960

**Recommended Pins** (Hardware PWM capable):
- **GPIO 19** (Board Pin 35) - Hardware PWM1
- **GPIO 21** (Board Pin 40) - Hardware PWM (shared with GPIO 13)

**Alternative Pins** (Software PWM):
- **GPIO 5** (Board Pin 29)
- **GPIO 22** (Board Pin 15)
- **GPIO 24** (Board Pin 18)
- **GPIO 25** (Board Pin 22)
- **GPIO 27** (Board Pin 13)

## Recommended Wiring for Orlok BTS7960

### Option 1: Simplified Control (Recommended)
Use BTS7960 like MDD10A with one enable always HIGH:

**Wiring**:
- **R_EN** → 3.3V or 5V (always enabled)
- **L_EN** → 3.3V or 5V (always enabled)
- **RPWM** → GPIO 19 (Board Pin 35) - Forward PWM
- **LPWM** → GPIO 21 (Board Pin 40) - Reverse PWM
- **VCC** → 5V
- **GND** → GND

**Control Logic**:
- Forward: RPWM = Speed%, LPWM = 0%
- Reverse: RPWM = 0%, LPWM = Speed%
- Stop: RPWM = 0%, LPWM = 0%

### Option 2: Full Control (Advanced)
Use all 4 control pins for maximum flexibility:

**Wiring**:
- **R_EN** → GPIO 5 (Board Pin 29)
- **L_EN** → GPIO 22 (Board Pin 15) 
- **RPWM** → GPIO 19 (Board Pin 35)
- **LPWM** → GPIO 21 (Board Pin 40)
- **VCC** → 5V
- **GND** → GND

**Control Logic**:
- Forward: R_EN=HIGH, RPWM=Speed%, L_EN=LOW, LPWM=0%
- Reverse: L_EN=HIGH, LPWM=Speed%, R_EN=LOW, RPWM=0%
- Stop: R_EN=LOW, L_EN=LOW
- Brake: R_EN=HIGH, L_EN=HIGH, RPWM=0%, LPWM=0%

## Motor Wiring
- **M+** → Motor positive terminal
- **M-** → Motor negative terminal
- **B+** → Battery/Power supply positive (6-27V DC)
- **B-** → Battery/Power supply negative (GND)

## Software Configuration

### Part Configuration in MonsterBox
When creating a motor or linear actuator part with BTS7960:

```json
{
  "type": "motor",
  "name": "Orlok New Motor",
  "controlBoard": "BTS7960",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "renPin": 5,
  "lenPin": 22,
  "maxDuration": 10000
}
```

### Simplified Configuration (Option 1)
```json
{
  "type": "motor",
  "name": "Orlok New Motor",
  "controlBoard": "BTS7960_SIMPLE",
  "rpwmPin": 19,
  "lpwmPin": 21,
  "maxDuration": 10000
}
```

## Safety Notes
1. **Current Rating**: BTS7960 can handle up to 43A, but ensure your power supply and wiring can handle the load
2. **Heat Dissipation**: Use heatsinks on the BTS7960 chips for high-current applications
3. **Inductive Kickback**: The BTS7960 has built-in protection, but add flyback diodes if using inductive loads
4. **Power Supply**: Use separate power supplies for logic (5V) and motor power (6-27V)
5. **Common Ground**: Ensure Raspberry Pi GND and motor power GND are connected

## Testing Procedure
1. Wire the BTS7960 according to Option 1 (Simplified)
2. Create a test motor part in MonsterBox with board type "BTS7960"
3. Use the calibration page to test forward/reverse/stop
4. Monitor motor current and temperature during testing
5. Adjust PWM frequency if needed (default 1kHz works for most motors)

## Troubleshooting
- **Motor doesn't move**: Check enable pins are HIGH, verify power supply
- **Motor runs only one direction**: Check RPWM/LPWM wiring, verify GPIO output
- **Motor stutters**: Increase PWM frequency, check power supply capacity
- **Driver overheats**: Add heatsinks, reduce duty cycle, check for motor stall

## References
- [BTS7960 Datasheet](https://www.infineon.com/dgdl/bts7960.pdf)
- [Using BTS7960 with Raspberry Pi](https://38-3d.co.uk/blogs/blog/using-the-bts7960-with-the-raspberry-pi)
- [MonsterBox Hardware Documentation](../README.md)

