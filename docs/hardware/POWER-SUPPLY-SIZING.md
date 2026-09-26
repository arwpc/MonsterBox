# Power-supply spec — PumpkinHead (char 1) and Renfield (char 6)

**Date:** 2026-09-26. **The job:** power a Raspberry Pi (with its USB mic array, webcam and eye
rings) and a 12 V wiper motor, outdoors, from 110 V, so that nothing the motor does can reset the
Pi. **What triggered it:** PumpkinHead's supply got wet and cooked, and his 12 V→5 V buck
converter is dead and shorted — it kills any supply it is connected to. Cut it out; never
reconnect it.

## What actually runs forever — the two configurations everyone else uses

The Raspberry Pi forums, the prop-building forums and the robotics crowd all land on the same two
answers. Everything else (a buck module hung on the motor rail, a shared supply with no reservoir)
is the configuration that reboots — a motor pulls 5–8× its running current for 80–180 ms at every
start, and a supply that sees that as overcurrent drops out, taking the logic with it.

### A. Two supplies, one box, common ground — the standard answer

The motor gets its own 12 V adapter. The Pi gets the official Raspberry Pi USB-C supply. Both plug
into one outdoor power strip inside one weatherproof box. The only thing they share is the mains
cord and a ground wire, so the motor cannot touch the Pi's 5 V. This is what nearly every Pi +
motor build that stays up is doing, and it is the cheapest of the options.

| Item | Part | Note |
|---|---|---|
| Motor supply | 12 V, 8–10 A brick — e.g. Mean Well LPV-100-12 (8.5 A, IP67) or any 12 V 10 A adapter | prop-community sizing is a 12 V 5 A adapter per wiper motor; 10 A gives the MDD10A its start pulse at ≤ 85 % PWM |
| Pi supply | **official Raspberry Pi 27 W USB-C supply** | works on the Pi 4 and the Pi 5; on the Pi 5 it negotiates the 5 A contract, so no config flag and no USB current cap |
| Box | weatherproof outdoor cord box or deck box, cords out the bottom | one outdoor power strip inside, on a GFCI outlet |
| Ground | MDD10A logic GND → a Pi GND pin; motor return → the 12 V adapter only | the signal reference is shared, the motor current path is not |
| Fuse | 15 A blade on the 12 V motor lead; 4,700–10,000 µF 25 V across the driver's supply terminals | |
| Rings | from the Pi's 5 V header pin is fine on the 5 A supply; series resistor + 1000 µF at the ring | `docs/troubleshooting/LED-RING-HANDOFF.md` |

The Pi forum's belt-and-braces for anyone forced to share a supply — a diode in the Pi's 5 V feed
plus a capacitor reservoir that carries it through the pulse — is not needed here, because nothing
is shared.

### B. A battery-backed bus — the car / RC / robot answer, as one product

Cars run an ECU and a wiper motor off one battery; RC cars run a receiver and servos beside a
motor pulling 50 A off one pack. The battery is the low-impedance bus and the charger only tops it
up, so nothing on the bus can sag the logic. Robot builders do the same with a 12 V pack and a
UBEC for the Pi. The consumer product that packages this — one thing to buy, plugged into 110 V —
is a portable power station in pass-through, and the one with a real 30 A 12 V outlet AND a
weather rating is the **Bluetti AC240P** (IP65, 1,843 Wh LiFePO4, RV port 12 V/30 A, 2 × 100 W
USB-C). The AC200MAX has the 30 A port but no weather rating (deck box). Sub-$400 stations have
only a 10 A outlet and are not recommended for the motor. Costs several times configuration A.

| Item | Note |
|---|---|
| Bluetti AC240P (or AC240) | UPS/pass-through ON, **ECO mode OFF** (ECO shuts the DC side off after hours at ≤ 10 W and an idle driver is 0 W); AC input stays plugged in; fans — keep it away from the mic |
| RV-port cable → 15 A blade fuse → 12 AWG → driver | bulk cap at the driver |
| USB-C → Pi | the port offers 5 V at 3 A, not the Pi 5's 5 A contract: on Renfield set `usb_max_current_enable=1` (his node ran a 5-min playback + mic + camera stress clean on a 3 A battery source, KNOWN-BUGS 2026-09-20); update his bootloader on mains first |
| USB-A → rings' 5 V/GND, ring GND also to a Pi GND pin | keeps their ≤ 1 A off the Pi's 3 A port |
| Cold nights | LiFePO4 will not charge below 0 °C but discharges fine; start the night full |

Operator to pick A or B. Both are known-good; neither has a converter on the motor rail.

## Load budget (what sized the parts)

| Rail | Load | PumpkinHead (Pi 4B) | Renfield (Pi 5) |
|---|---|---|---|
| 12 V | Jeep Wagoneer wiper motor (MDD10A / BTS7960) | 2–5 A running; start/stall pulse 15–25 A (PWM ≤ 85 % holds it near 20 A) | not wired — 0 A; identical the day it is |
| 12 V | powered speakers, ONLY if their adapter is 12 V DC (unverified — read the label) | 1–2 A | 1–2 A |
| 5 V | Pi board, busy (tracking + STT) | ~1.3 A | ~2.4 A |
| 5 V | XVF3800 (400 mA) + webcam (500 mA) over the Pi's USB | 0.9 A | 0.9 A |
| 5 V | 16 × WS2812B | ≤ 1 A full white; 0.2–0.4 A in the shipped animations | same |

Sources: `data/character-1/parts.json`, `data/character-6/parts.json`,
`data/models/led_ring_models.json` ("16 pixels is about 1A"), KNOWN-BUGS Groundbreaker entry
("a 12 V Jeep Wagoneer wiper stalls at ~15–25 A"), Renfield's 2026-09-20 entry (USB descriptors).

## Rules that hold in either configuration

1. Motor speed stays ≤ 85 % — the 100 % DC-on start is the documented reset; the shipped poses sit
   at 40 %.
2. Every DC splice at the rig lives in its own box; drip loops on every cable; GFCI on the cord.
3. Nothing derives the Pi's 5 V from the motor's 12 V. Ever.

## Before re-energizing PumpkinHead after the water event

- Remove the buck converter from the rig entirely (it is shorted).
- Dry the rig 24 h. Inspect the MDD10A, the Pi, the ReSpeaker XVF3800 and the webcam for
  corrosion; meter the MDD10A's VMotor/GND for a short before it sees 12 V.
- Bring the Pi up on its own supply alone and confirm a clean boot; then connect the 12 V lead
  and pulse the motor.

## Acceptance — prove it, don't assume it

- `vcgencmd get_throttled` → `0x0` after boot **and** after ten motor pulses at 60–85 % with TTS
  and the LED daemon running (the 2026-09-20 bisect combination that killed him).
- `journalctl -k -b | grep -c over-current` → `0` after five minutes of playback + mic + camera
  (Renfield's 2026-09-20 acceptance test).
- Renfield: `/proc/device-tree/chosen/power/max_current` no longer reads `900`.
- `/var/log/monsterbox.err` carries no `Undervoltage` line beyond the known 2 s boot dip.
- Stall test, deliberate: hold the motor and command it — the fuse opens or the port trips, and
  the Pi does not so much as log a dip.

## Considered and rejected (so nobody re-derives them)

- **Two potted IP67 bricks hard-wired in a NEMA 4X box** (HLG-320H-12 + LPV-100-5): the same
  isolation as A with more work; A gets it with two plugs.
- **ATX PC supply:** one box, 12 V at 40 A+, but its 5 V is derived from its own 12 V rail and it
  is not weatherproof.
- **Mean Well RD-125A:** channels share one transformer (cross-regulation, not isolation);
  **RID-125-1205** is isolated but 5 V is only 3 A; neither has a 20 A 12 V channel. (There is no
  HLG-480H-12; that series starts at 24 V. The 40 A part is the HLG-600H-12.)
- **Any 12 V→5 V module on the motor rail:** the coupling path that reset him. Gone for good.

## Unrecorded — operator to fill in

- Which configuration, A or B.
- The powered speakers' adapter voltage (same set as Sir Dragomir).
