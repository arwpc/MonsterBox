# Power-supply spec — PumpkinHead (char 1) and Renfield (char 6)

**Date:** 2026-09-26. **Operator requirement, verbatim in substance:** one outdoor power supply per
character. 110 V in. A clean 5 V rail for the Pi and its USB devices, a 12 V rail for the motors and
other parts. The two rails **isolated, so no draw on 12 V can brown out the 5 V**. **Waterproof.**
No buck converter anywhere in the chain.

**What triggered it:** PumpkinHead's supply got wet and cooked (2026-09-26). His 12 V→5 V buck
converter is dead and shorted — it kills any supply it is connected to. Cut it out; never reconnect
it, not even to test.

## The unit: one waterproof box, two independent supplies inside

No reputable maker sells a single potted IP67 unit with an isolated 12 V/25 A + 5 V/5 A pair, and
the compact dual-output units fail the spec: an ATX PC supply derives its 5 V from its own 12 V
rail, Mean Well's RD-125A shares one transformer between channels, and the isolated RID-125-1205
has only 3 A on 5 V. So the unit is **built, not bought**: one NEMA 4X enclosure, one 110 V cord in
through a gland, and two potted IP67 bricks inside that share nothing but that cord. Each brick has
its own transformer, rectifier and regulator, so a stall, short or start pulse on the 12 V rail can
only push the 12 V brick into its own current limit — the 5 V rail never moves. That is the isolation
the 2026-09-07 note asked for ("a separate 12 V feed for the converter would remove it"), with the
converter itself gone. Build two identical units, one per character, so spares interchange.

### Bill of materials, per character

| Item | Part | Rating / note |
|---|---|---|
| 12 V brick | **Mean Well HLG-320H-12** | 12 V, 22 A, 264 W, IP67, -40…+90 °C case, current-limits on overload (no hiccup). Operator floor for this rail is **20 A** (2026-09-26); this is the smallest potted IP67 Mean Well at or above it — the HLG-240H-12 is only 16 A |
| 12 V brick, bigger | **Mean Well HLG-600H-12** | 12 V, 40 A, 480 W, IP67 — if more 12 V parts are planned. (There is NO HLG-480H-12; that series starts at 24 V.) |
| 5 V brick | **Mean Well LPV-100-5** | 5 V, 12 A, 60 W, IP67, -25…+70 °C, fixed output |
| Enclosure | NEMA 4X / IP66 polycarbonate, ≥ 12 × 10 × 6 in, with back plate | bricks on the plate with an air gap; lid outward, glands on the bottom face |
| Cable glands | 3 × IP68 (AC in, 12 V out, 5 V out) + 1 breathable vent plug or desiccant pack | condensation is the enemy of the fuse block, not the potted bricks |
| AC cord | outdoor 14 AWG SJTW with plug | on a **GFCI** outlet |
| Fusing | inline blade holders: **15 A on the 12 V lead, 7.5 A on the 5 V lead** | protects the wiring; a stalled wiper cooks until something opens |
| Terminals | 4-way barrier strip or DIN block | the ONE place the two DC negatives meet (see grounding) |
| DC leads | 12–14 AWG, ≤ 1 m | 5 V lead ends in a USB-C pigtail (VBUS + GND) at the Pi |

## Load budget per rail (what sized the bricks)

| Rail | Load | PumpkinHead (Pi 4B) | Renfield (Pi 5) |
|---|---|---|---|
| 12 V | Jeep Wagoneer wiper motor (MDD10A / BTS7960) | 2–5 A running; start/stall pulse 15–25 A (PWM ≤ 85 % holds it near 20 A) | not wired — 0 A; identical the day it is |
| 12 V | powered speakers, ONLY if their adapter is 12 V DC (unverified — read the label) | 1–2 A | 1–2 A |
| 5 V | Pi board, busy (tracking + STT) | ~1.3 A | ~2.4 A |
| 5 V | XVF3800 (400 mA) + webcam (500 mA) over USB | 0.9 A | 0.9 A |
| 5 V | 16 × WS2812B, fed from the rail, not the header | ≤ 1 A full white; 0.2–0.4 A in the shipped animations | same |
| **12 V brick** | | **22 A holds the pulse (operator floor 20 A); a sag here no longer reaches the Pi** | **same brick — spares interchange; the motor is coming** |
| **5 V brick** | | **12 A against ~3.2 A worst case** | **12 A against ~4.5 A worst case** |

Sources: `data/character-1/parts.json`, `data/character-6/parts.json`,
`data/models/led_ring_models.json` ("16 pixels is about 1A"), KNOWN-BUGS Groundbreaker entry
("a 12 V Jeep Wagoneer wiper stalls at ~15–25 A"), Renfield's 2026-09-20 entry (USB descriptors).

## Wiring rules

1. **Grounding — one point only.** Tie the two bricks' negatives together at the terminal strip and
   nowhere else. The Pi and the motor driver then share a reference, but motor return current flows
   to the 12 V brick, never through the Pi's ground lead. The MDD10A's logic GND pin still goes to a
   Pi GND pin (signal reference); its VMotor/GND terminals go to the 12 V lead only.
2. **5 V lead:** its own pair from the terminal strip, ≤ 1 m, 12–14 AWG, USB-C pigtail. The LPV is
   fixed at 5.0 V, so the lead is where the volts are lost — keep it short. The Pi 4 under-voltage
   floor is 4.63 V. The Pi 5 wants 5.1 V and is the fussier board: his lead is the shortest and
   heaviest, and if he ever logs under-voltage the fallback is an adjustable indoor **Mean Well
   LRS-50-5** inside the box, trimmed to 5.2 V (the sealed box keeps rain off it; add desiccant).
3. **Pi 5 (Renfield) only:** a bare 5 V feed makes no USB-PD contract, so the USB ports stay capped
   (600 mA nominal, 900 measured on his node) and the 2026-09-20 over-current resets return. Set
   `usb_max_current_enable=1` in `/boot/firmware/config.txt`. KNOWN-BUGS warns against this flag
   *on a supply that cannot deliver 5 A*; a 12 A brick can. Update his bootloader EEPROM **on mains**
   first, then re-check `/proc/device-tree/chosen/power/max_current`.
4. **Rings:** 5 V from the rail with the common ground, 330–470 Ω in series with data at DIN,
   1000 µF across V_CC/GND at the ring (`docs/troubleshooting/LED-RING-HANDOFF.md`).
5. **12 V lead:** 15 A blade fuse; 4,700–10,000 µF, 25 V across the driver's motor-supply terminals
   so the start pulse is served locally. Motor speed stays ≤ 85 % — the 100 % DC-on start is the
   documented reset, and the shipped poses already sit at 40 %.
6. **Outdoors:** every DC splice at the rig in its own box; drip loops on all three cables; the
   enclosure mounted so water cannot pool on a gland.

## Before re-energizing PumpkinHead after the water event

- Remove the buck converter from the rig entirely (it is shorted).
- Dry the rig 24 h. Inspect the MDD10A, the Pi, the ReSpeaker XVF3800 and the webcam for
  corrosion; meter the MDD10A's VMotor/GND for a short before it sees the new 12 V rail.
- Bring up the **5 V brick alone** (Pi + USB devices + rings) and confirm a clean boot; then add
  the 12 V lead and pulse the motor.

## Acceptance — prove it, don't assume it

- `vcgencmd get_throttled` → `0x0` after boot **and** after ten motor pulses at 60–85 % with TTS
  and the LED daemon running (the 2026-09-20 bisect combination that killed him).
- `journalctl -k -b | grep -c over-current` → `0` after five minutes of playback + mic + camera
  (Renfield's 2026-09-20 acceptance test).
- Renfield: `/proc/device-tree/chosen/power/max_current` no longer reads `900`.
- `/var/log/monsterbox.err` carries no `Undervoltage` line beyond the known 2 s boot dip.

## Unrecorded — operator to fill in

- The powered speakers' adapter voltage (same set as Sir Dragomir) — decides whether they ride
  the 12 V rail or stay on 110 V.
