# Power-supply sizing — PumpkinHead (char 1) and Renfield (char 6)

**Date:** 2026-09-26. **Operator decision:** one outdoor supply per character, and that supply
delivers BOTH the 12 V rail and a clean, regulated 5 V rail. The 12 V→5 V buck converter goes away.

## Why the buck goes away

PumpkinHead's Pi 4B takes its 5 V from a DC-DC converter hung on the motor's 12 V rail. The wiper
motor's start pulse sags that rail, the converter's output drops through the Pi's 4.63 V
under-voltage floor and the board hard-resets — `docs/troubleshooting/KNOWN-BUGS.md`, PumpkinHead
2026-09-07 ("only the DC inrush of a full-on wiper motor pulls the 5 V below 4.63 V … a separate
12 V feed for the converter would remove it") and 2026-09-20 ("His PSU cannot carry the whole show
at once … The fix is his power supply, not software"). A 5 V rail regulated inside the supply, on
its own lead, never sees the motor.

Renfield's failure was different — USB over-current, five hard resets on 2026-09-20. With no
USB-PD contract the Pi 5 caps its USB ports (his node measured 900 mA) and the ReSpeaker XVF3800
(400 mA) plus the 1080p webcam (500 mA) declare exactly that. Any plain 5 V feed over USB-C makes
no PD contract, so rule 2 below is mandatory for him.

## Load budget per rail

| Rail | Load | PumpkinHead (Pi 4B) | Renfield (Pi 5) |
|---|---|---|---|
| 12 V | Jeep Wagoneer wiper motor (MDD10A / BTS7960) | 2–5 A running; start/stall pulse 15–25 A (PWM ≤ 85 % holds the pulse near 20 A) | not wired — 0 A; identical to PumpkinHead the day it is |
| 12 V | powered speakers, ONLY if their adapter is 12 V DC (unverified — read the label) | 1–2 A | 1–2 A |
| 5 V | Pi board, busy (tracking + STT) | ~1.3 A | ~2.4 A |
| 5 V | XVF3800 (400 mA) + webcam (500 mA) over USB | 0.9 A | 0.9 A |
| 5 V | 16 × WS2812B, fed from the rail, not the header | ≤ 1 A full white; 0.2–0.4 A in the shipped animations | same |
| **12 V rail rating** | | **≥ 25 A** — the motor pulse must sit below the supply's trip point | **≥ 5 A today; ≥ 25 A once the motor is wired** |
| **5 V rail rating** | | **≥ 5 A, 5.1–5.2 V measured at the Pi** | **≥ 5 A, 5.1–5.2 V measured at the Pi** |

Sources: `data/character-1/parts.json`, `data/character-6/parts.json`,
`data/models/led_ring_models.json` ("16 pixels is about 1A"), KNOWN-BUGS Groundbreaker entry
("a 12 V Jeep Wagoneer wiper stalls at ~15–25 A"), Renfield's 2026-09-20 entry (USB descriptors).

Why three times the running load on 12 V: a supply sized near the running current trips its
over-current protection on the start pulse, drops the whole rail, and takes every rail derived
from it down too. That is the reset, restated. Cheap IP67 "LED driver" bricks hiccup on overload;
prefer units that current-limit instead.

## Units that fit

No compact dual-output supply has a 12 V channel that survives the wiper motor's start pulse.
Mean Well **RD-125A** is roughly 5 V / 12 A + 12 V / 10 A, 130 W combined (vendor listings
disagree — the datasheet governs). Mean Well **RID-125-1205** isolates its two channels, which is
exactly what a motor next to a Pi wants, but its 5 V channel is only 3 A — too thin for either Pi.

**PumpkinHead — an ATX PC supply, 500 W class, 80 Plus Bronze or better, in a vented
weatherproof box.** 12 V at 40 A+ and 5 V at 15–20 A, each rail with its own over-current
protection far above the motor's stall; modern units regulate 5 V with an internal DC-DC stage
carrying ten times the headroom of the module being retired. Turn-on is PS_ON (the green wire) to
ground. It is not weatherproof: NEMA 3R box, fan side clear, drip loops on every cable.
*No-box alternative, still no buck:* two IP67 bricks — **HLG-320H-12** (12 V, 22 A; HLG-480H-12
for 40 A) + **LPV-100-5** (5 V, 12 A). Two supplies, and the rails are completely isolated.

**Renfield as he is today — Mean Well RD-125A** (5 V ≥ 7 A, 12 V ≥ 7 A; indoor case, same box
treatment). The 12 V channel carries the speakers with room to spare and cannot carry the shake
motor. The day the motor is wired he is PumpkinHead's case: same ATX unit.

## Wiring rules (both nodes)

1. **5 V lead:** ≤ 1 m of 16–18 AWG on its own pair straight from the supply terminals — never
   daisy-chained through the motor lead — ending in a USB-C pigtail at the Pi. If the unit has a
   trim pot, set 5.15–5.2 V *measured at the Pi under load*. The Pi 4 under-voltage floor is
   4.63 V; the Pi 5 wants 5.1 V.
2. **Pi 5 (Renfield) only:** a bare 5 V feed makes no PD contract, so the USB ports stay capped
   (600 mA nominal, 900 measured). Set `usb_max_current_enable=1` in `/boot/firmware/config.txt`.
   KNOWN-BUGS warns against this flag *on a supply that cannot deliver 5 A*; a ≥ 7 A rail can.
   Update his bootloader EEPROM **on mains** first — the May 2025 image mis-negotiated the
   official 27 W supply — and re-check `/proc/device-tree/chosen/power/max_current`.
3. **Rings:** 5 V from the rail with a common ground, 330–470 Ω in series with data at DIN,
   1000 µF across V_CC/GND at the ring (`docs/troubleshooting/LED-RING-HANDOFF.md`).
4. **12 V motor lead:** 10–15 A blade fuse (a stalled wiper cooks until something opens; the
   MDD10A is 10 A continuous / 30 A peak) and 4,700–10,000 µF, 25 V across the driver's
   motor-supply terminals. **Pi 5 V lead:** 5 A fuse.
5. **Common ground** between supply, driver and Pi. Motor speed stays ≤ 85 % — the 100 % DC-on
   start is the documented reset, and the shipped poses already sit at 40 %.
6. **Outdoors:** GFCI outlet; the ATX/RD unit inside a vented weatherproof box, or the IP67
   bricks mounted leads-down; every DC splice in a box.

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
- PumpkinHead's current 12 V supply and buck-converter models were never recorded; both retire
  under this plan.
