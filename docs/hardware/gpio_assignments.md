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
| 12 | Shake Motor RPWM | Output (BTS7960 / IBT-2) — header pin 32 |
| 13 | Shake Motor LPWM | Output (BTS7960 / IBT-2) — header pin 33 |
| 18 | Eye Rings (pair, chained) | Output (WS2812 data, RP1 PIO) — header pin 12 |

The eye rings are **addressable**, on the **same GPIO 18 as PumpkinHead**. Only the waveform
source differs: his Pi 4 uses `rpi_ws281x` out of the BCM2711 PWM peripheral (`pinctrl get 18`
there reads `a5`), which RP1 removed — so a Pi 5 drives the identical pin from RP1's **PIO**
block via `Adafruit_Blinka_Raspberry_Pi5_Neopixel`. Wiring is identical across node generations.
**Proven lit 2026-09-13.** Needs root; `monsterbox.service` runs as root.

A static level does nothing to these — `light_cli.py` holds the pin high with `pinctrl`, which
is right for every other light on the fleet and useless here. `config.controllerType: "neopixel"`
routes them to `neopixel_cli.py` instead. SPI on GPIO 10 was tried and abandoned; ignore any note
pointing at pin 19.

An MDD10A was wired here on 2026-09-13 (DIR=26, PWM=13) and destroyed itself with smoke after a
couple of minutes powered. GPIO 22, 26 and 27 are free.

`gpiochip0` is the RP1 bank on this Pi 5, which is what every wrapper already opens — no code
change was needed for the platform.
