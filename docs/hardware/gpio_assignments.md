## GPIO Assignments

### Orlok (Character 3, 192.168.8.120)

**PCA9685 I2C (0x40, 50Hz):**
| Channel | Part |
|---------|------|
| 0 | Jaw servo |
| 1 | Elbow servo |
| 8 | Forearm servo |
| 15 | Head servo |

**GPIO:**
| Pin | Part | Direction |
|-----|------|-----------|
| 16 | Light relay | Output |
| 17 | PIR Motion Sensor | Input |
| 5 | Right Arm actuator DIR | Output (MDD10A) |
| 13 | Right Arm actuator PWM | Output (MDD10A) |
| 23 | Left Arm actuator DIR | Output (MDD10A) |
| 12 | Left Arm actuator PWM | Output (MDD10A) |
| 18 | Bow actuator DIR | Output (BTS7960) |
| 6 | Bow actuator PWM | Output (BTS7960) |

### Mina (Character 2, 192.168.8.140)

**PCA9685 I2C (0x40, 50Hz):**
| Channel | Part |
|---------|------|
| 0 | Eye laser (light toggle) |
| 4 | Jaw servo |
| 8 | Neck servo |
| 12 | Eye servo |

**GPIO:**
| Pin | Part | Direction |
|-----|------|-----------|
| 5 | Coffin Door actuator DIR | Output (MDD10A, **inverted**) |
| 13 | Coffin Door actuator PWM | Output (MDD10A) |
| 16 | Burning Rose light | Output (relay) |
| 26 | PIR Motion Sensor | Input |

### Sir Dragomir (Character 4, 192.168.8.130)

**PCA9685 I2C (0x40, 50Hz):**
| Channel | Part | Type |
|---------|------|------|
| 0 | Head servo | **Continuous rotation** (360°) |
| 1 | Jaw servo | Standard (180°) |
| 3 | Magic Box servo | Standard (180°) |

*No GPIO-direct parts on Sir Dragomir.*

### PumpkinHead (Character 1, 192.168.8.150)

**PCA9685 I2C (0x40, 50Hz):**
| Channel | Part |
|---------|------|
| 15 | Elbow servo |

**GPIO:**
| Pin | Part | Direction |
|-----|------|-----------|
| 26 | Motor DIR | Output (MDD10A) |
| 13 | Motor PWM | Output (MDD10A) |
| 16 | PIR Motion Sensor | Input |

### Renfield (Character 6, 192.168.8.224) — Raspberry Pi 5 / Debian 13

*No PCA9685 fitted. `/dev/i2c-1` exists (enabled during the Pi 5 bring-up audit), so the
bus is free for one later.*

**GPIO:**
| Pin | Part | Direction |
|-----|------|-----------|
| 26 | Shake Motor DIR | Output (MDD10A) |
| 13 | Shake Motor PWM | Output (MDD10A) |

Same pair and same order as PumpkinHead — GPIO 13 is the PWM line on every MDD10A in the fleet.
(These were briefly wired reversed on 2026-09-13 and swapped back the same day.) DIR and PWM are
not interchangeable: swapped, `motor_control.py` puts the 2 kHz PWM train on the DIR line and a
static level on the PWM line, so the board sees a permanently-asserted enable with direction
chattering — the motor runs flat out and speed does nothing.

`gpiochip0` is the RP1 bank on this Pi 5, which is what every wrapper already opens — no code
change was needed for the platform.
