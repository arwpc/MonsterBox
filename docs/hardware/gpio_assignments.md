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
| 7 | Head servo | **Multi-turn position** (900°, goBILDA Stingray-2) |
| 3 | Jaw servo | Standard (180°) |
| 11 | Magic Box servo | Standard (180°, `invert: true`) |

**GPIO:**
| Pin | Part | Direction |
|-----|------|-----------|
| 23 | PIR Motion Sensor | Input |

> Corrected 2026-09-21. Every channel in this table was wrong (it read 0/1/3, and
> called the head a 360° continuous servo), and it claimed he had no GPIO-direct
> parts while a PIR was physically installed the whole time. The head is a
> multi-turn POSITION servo — commanding it as continuous turns an angle into a
> timed spin. Its full rotation tears the head cabling, so keep travel inside the
> calibrated window.

### Renfield (Character 6, Raspberry Pi 5 — no PCA9685)

Every part is bare-GPIO on the RP1 header. lgpio drives servos and motors (`/dev/gpiochip0`);
the eye rings use the RP1 PIO block (`/dev/pio0`, no root).

| Pin | Part | Direction |
|-----|------|-----------|
| 12 | Shake motor RPWM (BTS7960, enables tied to 5 V) | Output |
| 13 | Shake motor LPWM (BTS7960) | Output |
| 18 | Eye rings WS2812B data (2×8, RP1 PIO) | Output |
| 20 | Writing Pen MG90S signal (physical pin 38) | Output (lgpio `tx_servo`, 50 Hz) |
| 22 | PIR Motion Sensor | Input (pull-down, sampled via lgpio) |

> **Bare-GPIO servo rule (2026-09-26):** before trusting any move, run
> `python3 python_wrappers/servo_cli.py probe <gpio>`. Healthy = `pullUpReadsHigh: true` and
> `riseUs` ≈ 15. A loaded line (pin 20 read LOW under pull-up and took ~1040 µs to rise) shortens
> every pulse — 1450 µs arrived as ~770 µs, 500 µs never — while every driver reports success.
> Measure at the pad with `pinctrl poll <gpio>`; it prints edge timestamps and needs no extra hardware.

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
