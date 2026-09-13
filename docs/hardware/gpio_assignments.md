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
| 18 | Eye Rings (pair, one signal) | Output (switched light) — header pin 12 |

The eye rings are a **plain switched light**, not addressable. MonsterBox has no WS2812/NeoPixel
support anywhere, and `rpi_ws281x` does not work on a Pi 5 — RP1 broke the DMA/PWM register
access it relies on. GPIO 18 is the Pi's I2S `PCM_CLK`; unused here because Renfield's audio is
entirely USB, but move the rings first if I2S is ever enabled on this node.

`R_EN` and `L_EN` are **jumpered to VCC on the board**, not driven from GPIO —
`linear_actuator_control_v2.py` only ever writes them HIGH at setup, so a GPIO buys nothing a
jumper does not, and tying them in hardware removes the `GPIO_BUSY (-79)` trap a shared enable
pin used to cause.

**Proven moving 2026-09-13** at 30% duty. `VCC` → Pi pin 2, `GND` → Pi pin 6, `R_EN` and
`L_EN` both → Pi pin 4 (5 V, same rail). `R_IS`/`L_IS` unconnected.

> ⚠️ **The IBT-2 needs 5 V on `VCC`.** Unlike the MDD10A it does not power its logic from the
> motor rail. `VCC` → Pi header pin 2 or 4, `GND` → any Pi ground pin. With `VCC` unconnected the
> board moves nothing and every command still returns success. Never put 12 V on `VCC`.

Both `RPWM` and `LPWM` carry PWM on this board (one at a time, by direction), unlike the MDD10A
where `DIR` was a static level. `lgpio.tx_pwm()` is **software** PWM and runs on any GPIO, so
nothing today depends on the choice — but GPIO 12/13 are the Pi 5's RP1 hardware-PWM pair
(`dtoverlay=pwm-pi5`), so they are the only pins that would not need rewiring if hardware PWM is
ever added.

An MDD10A was wired here on 2026-09-13 (DIR=26, PWM=13) and destroyed itself with smoke after a
couple of minutes powered. GPIO 22, 26 and 27 are free.

`gpiochip0` is the RP1 bank on this Pi 5, which is what every wrapper already opens — no code
change was needed for the platform.
