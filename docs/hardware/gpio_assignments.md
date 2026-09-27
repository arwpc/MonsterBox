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

### Renfield (Character 6, Raspberry Pi 4B at 192.168.8.249 — no PCA9685)

His Pi 5 fried on 2026-09-27; this is the wiring given to the operator for the
replacement Pi 4B, and the operator confirmed it. The 40-pin header is the same
on both boards. Every part is bare-GPIO: lgpio drives the servo and motor
(`/dev/gpiochip0`, bcm2711), and on the Pi 4 the eye rings run on rpi_ws281x
(PWM0 + DMA 10, root) as `monsterbox-led.service` — see
`scripts/install-led-ring-service.sh`, which also turns off onboard analog audio
because it shares PWM0.

| BCM | Header pin | Part | Direction | Power / ground |
|-----|-----------|------|-----------|----------------|
| 12 | 32 | Shake motor RPWM (BTS7960, R_EN/L_EN tied to 5 V) | Output (lgpio software PWM) | logic GND pin 34; 12 V side separate |
| 13 | 33 | Shake motor LPWM (BTS7960) | Output (lgpio software PWM) | — |
| 18 | 12 | Eye rings WS2812B data (2×8) | Output (rpi_ws281x PWM0) | 5 V pin 2, GND pin 6 |
| 22 | 15 | PIR Motion Sensor | Input (pull-down; watcher reads /dev/gpiomem) | 5 V spliced, GND pin 14 |
| 26 | 37 | Writing Pen MG90S signal | Output (lgpio `tx_servo`, 50 Hz) | red 5 V pin 4, brown GND pin 39 |

Only pins 2 and 4 carry 5 V: share them through a terminal block or splice,
never two crimps on one pin. The ReSpeaker XVF3800 and the webcam are USB.

History: on the Pi 5 the pen moved GPIO 26 → 21 → 20 and a FITEC FS90R stood in
for two MG90S units that would not respond to a 3.3 V RP1 pad (commit 81384573);
the operator refitted an MG90S for the Pi 4.

> **Bare-GPIO servo rule (2026-09-26):** before trusting any move, run
> `python3 python_wrappers/servo_cli.py probe <gpio>`. Healthy = `pullUpReadsHigh: true` and
> `riseUs` ≈ 15. A loaded line (on the Pi 5, pin 20 read LOW under pull-up and took ~1040 µs to rise) shortens
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
