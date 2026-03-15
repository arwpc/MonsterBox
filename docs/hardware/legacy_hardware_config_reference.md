# Historical Hardware Configuration Reference (2025)

This file contains historical hardware configuration settings that were previously working. It is preserved for troubleshooting and reference when restoring or debugging hardware connections.

> **Note:** The main `parts.json` and `README.md` are the authoritative sources for current configuration. This file is a reference fallback.

## ElevenLabs Key (Legacy)
`sk_62b4f83d6f5818eadf74078c60e9cd9e928cf687ab933cdf`

## Hardware Parts (Historical Snapshot)

### Character 1: ? (Likely Orlok/PumpkinHead prototype)
- **ID 1: Right Arm of Satan** (Linear Actuator)
  - Direction Pin: 23
  - PWM Pin: 12
  - Max Extension: 15000
  - Max Retraction: 15000
- **ID 2: Left Arm of Manipulation** (Linear Actuator)
  - Direction Pin: 18
  - PWM Pin: 13
  - Max Extension: 15000
  - Max Retraction: 15000
- **ID 3: Hand of Azura** (Light)
  - GPIO Pin: 26
- **ID 4: Eye of Orlok** (Sensor - Motion)
  - GPIO Pin: 16
  - Active: false
- **ID 5: Elbow** (Servo)
  - Pin: 18 (Likely Error/Conflict w/ Linear Actuator above if on same board, or separate controller)
  - Channel: 1 (if PCA9685?)
  - Type: Hooyij 40kg DS3240MG
  - PCA9685 Address: 0x40
- **ID 6: Forearm** (Servo)
  - Channel: 2
  - Type: Hooyij 40kg DS3240MG
- **ID 11: Head on a Swivel** (Servo)
  - Type: GoBilda Stingray 2
  - Mode: Feedback, Continuous
- **ID 16: Test Webcam**
  - Path: /dev/video0
- **ID 22: Orlok Head Tracking System**
  - Servo ID: 11
  - Webcam: /dev/video0

### Character 2: Mina
- **ID 8: Coffin Sensor** (Motion)
  - GPIO Pin: 16 (Note: Conflict with ID 4/10/13 if on same Pi)
- **ID 12: Coffin door** (Linear Actuator)
  - Direction Pin: 5
  - PWM Pin: 13 (Conflict w/ ID 2 if same Pi)
- **ID 13: Burning Rose** (Light)
  - GPIO Pin: 16 (Conflict w/ Sensors)
- **ID 17: Test Webcam**
  - Path: /dev/video0

### Character 3: Orlok / Punkin
- **ID 10: Punkin Motion Detector**
  - GPIO Pin: 16
- **ID 14: Head Light** (LED)
  - GPIO Pin: 17
- **ID 15: Body Move** (Motor)
  - Direction Pin: 6
  - PWM Pin: 13

### Character 4: Sir Dragomir
- **ID 18: Motion Skulltalker**
  - GPIO Pin: 17
- **ID 19: Jaw Servo**
  - Type: Miuzei MG90S
  - Min/Max Pulse: 500-2400
- **ID 20: SkulltalkerCam**
  - Path: /dev/video0
  - Res: 1280x720 @ 15fps
- **ID 21: ChatterPi AI System**
  - Jaw Sync Enabled: True
- **ID 23: SkullMicrophone**
  - Device ID: 2

## Wiring Conflicts Note
Many entries in this historical list share GPIO pins (e.g., Pin 16 used for multiple sensors and lights, Pin 13 used for multiple PWMs). On the distributed system, these distinct characters would live on separate Raspberry Pis. On a single-node setup (MonsterBox 5.5), these pin conflicts must be resolved.
