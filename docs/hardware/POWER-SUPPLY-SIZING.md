# Power-supply spec — PumpkinHead (char 1) and Renfield (char 6)

**Date:** 2026-09-26. **Operator requirement, in substance:** ONE unit per character, fed from
110 V, that puts out a 12 V rail for the motors and other parts (20 A is acceptable) AND a USB
port for the Pi and its devices, the two isolated so no draw on 12 V can brown out the Pi, and
waterproof. No buck converter anywhere in the chain, and not two bricks. The operator's own
suggestion — a battery unit — is the one that fits.

**What triggered it:** PumpkinHead's supply got wet and cooked (2026-09-26). His 12 V→5 V buck
converter is dead and shorted — it kills any supply it is connected to. Cut it out; never
reconnect it, not even to test.

## The unit: a portable power station in pass-through, one per character

A power station plugged into the wall and left in UPS/pass-through mode puts its battery between
the mains and every output. The 12 V port and the USB-C port are separate converters off the
battery bus, so a motor start pulse, a stall or a dead short on 12 V can only trip that port's own
limit — the USB 5 V rides on the cells and never sees it. Wall dropouts don't reach the Pi either,
which the SD card will appreciate (KNOWN-BUGS: brownouts corrupt SD cards).

The catch is the 12 V port: on nearly every consumer station it is a 10 A cigarette outlet, which
the wiper motor's start pulse will trip. The units that carry a real 20–30 A 12 V outlet:

| Unit | 12 V high-current port | USB-C | Weather | Note |
|---|---|---|---|---|
| **Bluetti AC240P** | RV port 12 V DC / 30 A, 360 W max | 2 × 100 W (PD 5/9/12/15/20 V @ 3 A; 20 V @ 5 A) | **IP65** | 1,843 Wh LiFePO4; UPS + ECO modes via app/screen. **The pick.** |
| Bluetti AC240 (original) | RV port 12 V / 30 A | 2 × 100 W | **IP65** | 1,536 Wh; discontinued in the US, still sold by some retailers |
| Bluetti AC200MAX / AC200L | "Super DC" 12 V / 30 A; AC200L D40 aviation 12 V / 30 A | 100 W | none — needs a deck box | cheaper on sale |
| EcoFlow Delta Pro | Anderson 12.6 V / 30 A | 100 W | none | overkill |
| Goal Zero Yeti 1500X | Anderson 25 A / 300 W | 60 W | none | — |

Sub-$400 stations (EB3A, River 2, Solix C300, Explorer 300) have only the 10 A outlet. They would
run the motor at speed, but the start pulse needs a software soft-start ramp in the motor wrappers,
and a stall trips the outlet and can leave it off until someone presses the DC button — bad for an
unattended show. Not recommended unless the ramp is added.

### Bill of materials, per character (identical units, spares interchange)

| Item | Note |
|---|---|
| Bluetti AC240P (or AC240) | outdoors as-is (IP65); keep the port covers closed around the cables, cables exiting downward |
| Bluetti RV-port cable (AC240 accessory) | terminate to a 15 A blade fuse holder, then 12 AWG to the driver's VMotor/GND |
| USB-C to USB-C cable, ≤ 1 m | station USB-C → Pi power input |
| USB-A cable with bare leads | station USB-A → the WS2812B rings' 5 V/GND (keeps their ≤ 1 A off the Pi's port) |
| 4,700–10,000 µF 25 V capacitor | across the driver's motor-supply terminals |
| Outdoor 14 AWG cord | station AC input, on a GFCI outlet |

## Load budget per rail (what sized the ports)

| Rail | Load | PumpkinHead (Pi 4B) | Renfield (Pi 5) |
|---|---|---|---|
| 12 V | Jeep Wagoneer wiper motor (MDD10A / BTS7960) | 2–5 A running; start/stall pulse 15–25 A (PWM ≤ 85 % holds it near 20 A) | not wired — 0 A; identical the day it is |
| 12 V | powered speakers, ONLY if their adapter is 12 V DC (unverified — read the label) | 1–2 A | 1–2 A |
| USB-C | Pi board, busy (tracking + STT) | ~1.3 A | ~2.4 A |
| USB-C | XVF3800 (400 mA) + webcam (500 mA) over the Pi's USB | 0.9 A | 0.9 A |
| USB-A | 16 × WS2812B | ≤ 1 A full white; 0.2–0.4 A in the shipped animations | same |
| **12 V port** | | **30 A holds the pulse; a trip here cannot reach the Pi** | **same unit — the motor is coming** |
| **USB-C port** | | **3 A against ~2.2 A** | **3 A against ~3.3 A busy — tight; see rule 2** |

Sources: `data/character-1/parts.json`, `data/character-6/parts.json`,
`data/models/led_ring_models.json` ("16 pixels is about 1A"), KNOWN-BUGS Groundbreaker entry
("a 12 V Jeep Wagoneer wiper stalls at ~15–25 A"), Renfield's 2026-09-20 entry (USB descriptors).

## Setup and wiring rules

1. **Station settings:** UPS / pass-through ON, **ECO mode OFF** — in ECO the DC side shuts off
   after hours at ≤ 10 W, and an idle motor driver is 0 W, so the motor would be dead by showtime.
   Leave the AC input plugged in for the whole show. Place the station away from the mic array;
   its fans run under load.
2. **Pi 5 (Renfield):** the USB-C port offers 5 V at 3 A, not the Pi 5's 5 A contract, so the Pi
   caps its own USB ports (600 mA nominal, 900 measured on his node) and the 2026-09-20 over-current
   resets return. Set `usb_max_current_enable=1` in `/boot/firmware/config.txt`. His node already
   ran a 5-minute playback + mic + camera stress clean on a 3 A PD battery source (KNOWN-BUGS,
   2026-09-20), which is what this is. Keep the rings on the USB-A port, not the Pi, so his busy
   draw stays under the 3 A. Update his bootloader EEPROM on mains first.
3. **Rings:** 5 V/GND from a USB-A port, ring GND also to a Pi GND pin (data reference), 330–470 Ω
   in series with data at DIN, 1000 µF across V_CC/GND at the ring
   (`docs/troubleshooting/LED-RING-HANDOFF.md`).
4. **12 V lead:** RV port → 15 A blade fuse → 12 AWG → driver VMotor/GND; bulk cap at the driver.
   The MDD10A's logic GND pin to a Pi GND pin as before. Motor speed stays ≤ 85 % — the 100 % DC-on
   start is the documented reset, and the shipped poses already sit at 40 %.
5. **Cold nights:** LiFePO4 will not charge below 0 °C (the BMS blocks it) but discharges fine, and
   1.8 kWh carries a 40–60 W node through a night many times over. Start the night full.
6. **Outdoors:** every DC splice at the rig in its own box; drip loops; port covers closed on
   the cables.

## Before re-energizing PumpkinHead after the water event

- Remove the buck converter from the rig entirely (it is shorted).
- Dry the rig 24 h. Inspect the MDD10A, the Pi, the ReSpeaker XVF3800 and the webcam for
  corrosion; meter the MDD10A's VMotor/GND for a short before it sees the 12 V port.
- Bring the Pi up on **USB-C alone** first and confirm a clean boot; then connect the 12 V lead
  and pulse the motor.

## Acceptance — prove it, don't assume it

- `vcgencmd get_throttled` → `0x0` after boot **and** after ten motor pulses at 60–85 % with TTS
  and the LED daemon running (the 2026-09-20 bisect combination that killed him).
- `journalctl -k -b | grep -c over-current` → `0` after five minutes of playback + mic + camera
  (Renfield's 2026-09-20 acceptance test).
- Renfield: `/proc/device-tree/chosen/power/max_current` no longer reads `900`.
- `/var/log/monsterbox.err` carries no `Undervoltage` line beyond the known 2 s boot dip.
- Stall test, deliberate: hold the motor and command it — the 12 V port trips or the fuse opens,
  and the Pi does not so much as log a dip.

## Considered and rejected (so nobody re-derives them)

- **Two potted IP67 bricks in a NEMA 4X box** (Mean Well HLG-320H-12 + LPV-100-5): isolated by
  construction and waterproof, but two supplies — operator declined 2026-09-26.
- **ATX PC supply:** one box, 12 V at 40 A+, but its 5 V is derived from its own 12 V rail and it
  is not weatherproof.
- **Mean Well RD-125A:** channels share one transformer (cross-regulation, not isolation);
  **RID-125-1205** is isolated but 5 V is only 3 A; neither has a 20 A 12 V channel. (There is no
  HLG-480H-12; that series starts at 24 V. The 40 A part is the HLG-600H-12.)
- **Any 12 V→5 V module on the motor rail:** the coupling path that reset him. Gone for good.

## Unrecorded — operator to fill in

- The powered speakers' adapter voltage (same set as Sir Dragomir) — decides whether they ride
  the 12 V port or a station AC outlet.
