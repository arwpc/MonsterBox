# LED Ring (PumpkinHead) — Debugging Handoff

**Date:** 2026-09-12, updated 2026-09-13  **Node:** `pumpkinhead` (192.168.8.150), character 1
**Part:** id `9`, name "Pumpkin Eyes", type `led_ring`
**Status:** ✅ **RESOLVED 2026-09-13 — the cabling was connected BACKWARDS: data was feeding
the ring's DOUT, not DIN** (§6 hypothesis 2 / §7 step 4). The operator reversed it and both
rings animate. Software work COMPLETE; §9 bugs 1–2 FIXED 2026-09-13.

---

## 0. 2026-09-13 — RESOLUTION, and what the measurements actually showed

**Root cause (operator-confirmed): the feed was mated to the ring chain's OUTPUT end.** Data
entered DOUT, so no frame could ever latch; the rings sat in their power-on state (these
clones power on bright white) and V_DD 3.3 V simply browned them out. Reversing the
connection direction fixed everything instantly — the daemon's 50 fps `fade` stream became
visible the moment the path was right.

**The probe evidence below, reinterpreted:** a WS2812B DOUT is a push-pull *output* that
idles low. From the header that reads as a low-impedance pull to ground — defeats the
internal pull-up, reads 0 in every pull mode, and fights (loses to) the pin driver on
readback. That is EXACTLY what was measured, and it is the opposite of a healthy DIN
(megaohm high-impedance). **Reusable diagnostic: if an addressable-LED data line measures as
a driven-low load instead of high-Z, suspect you are on DOUT / the far end of the chain.**
The 2026-09-12 session's "mystery" pull-up-reads-0 on two different rings was this same
signature all along — not ring damage, not (as §0 first guessed) a miswired extension.

The section below is preserved as written before the operator's confirmation — the
localization ("downstream of the header, at the data entry point, common to both rings")
was correct; the specific mechanism guessed (extension internal miswiring) was not.

---

## 0b. 2026-09-13 EARLIER — evidence that localized the fault (pre-confirmation)

**New electrical evidence (validated probe, this time with controls).** With the daemon
stopped, GPIO18 was characterized as an input against two bare control pins (GPIO23/24):

| Probe | bare control pins | GPIO18 (into extension + ring) |
|---|---|---|
| pull-up (≈50 kΩ) | 1 | **0** |
| pull-down | 0 | 0 |
| no pull | 1 (floats) | **0, immediately, even after pull-up precharge** |
| driven high / low, read back | — | 1 / 0 (pin driver wins) |

The data line presents a **load of roughly 100 Ω–50 kΩ to ground** (defeats the pull-up,
not the pin driver). A healthy WS2812B DIN is megaohm-class high-impedance. Two independent
rings — including a factory-fresh one — cannot share that defect through a keyed connector;
the one element common to both is the extension. This also retro-explains §5.1's mystery
reading: the probe was always looking at the extension, not at ring health.

**Symptom signature grounded in community documentation:** "all LEDs bright frozen white,
ignores every command, no light at all at V_DD = 3.3 V" is the documented behaviour of a
WS2812B whose **power or ground never actually arrives** (glow via parasitic/ESD paths, no
frame ever latches). A strip visibly lights with GND disconnected (return current exits the
data pin: forum.arduino.cc/t/ws2812b-led-strip-turning-on-without-ground-connected/1227819),
and the datasheet's "reverse connect protection" explains rings surviving if the extension
mirrors 5 V↔GND (a known defect class in generic JST-SM extensions — the outer two
conductors swap in a mirrored crimp while center data stays put).

**Webcam witness test (attempted, void):** GPIO18 was toggled slowly while sampling the
node's own webcam for illumination change. Result void — the operator was at the bench,
in frame, moving the rig (including holding the pumpkin to the lens) throughout the
sampling window. Do not re-run it while anyone is at the bench.

**Decisive test handed to the operator (2026-09-12 late):** bypass the extension — ring
pigtail direct to header, black→pin 6, red→pin 2, green→pin 12, connected GND → 5 V →
data. The daemon streams a bright `fade` at 50 fps, so success is visible the instant the
path is right. If (unexpectedly) still frozen white when direct: fit the 1N4001 in series
with the ring's 5 V feed per §7.6.

**Software shipped 2026-09-13** (see §9 — both bugs fixed):
- Daemon SIGTERM zombie fixed: all `rpi_ws281x` access serialized behind `_strip_lock`
  (the C library is not thread-safe; concurrent `ws2811_render` from the animator and the
  shutdown path was the suspected wedge), plus a `threading.Timer` → `os._exit(1)`
  failsafe 10 s after any shutdown request, so the process can never again survive as a
  zombie holding PWM0. Verified on an isolated GPIO10/SPI instance (SIGTERM → clean exit in
  0.26 s) **and on the real PWM path after the resolution: 0.16 s.** Honesty note: the
  original 2026-09-12 hang did NOT reproduce today — old code also exited in ~1 s on the PWM
  path — so the zombie was situational (likely a render already wedged mid-teardown). The
  fix removes the concurrency hazard and the failsafe guarantees exit even if the wedge
  recurs, so the failure class is closed either way.
- `colorOrder` and `dataRateHz` are no longer decorative: the daemon takes
  `--color-order` (validated, mapped to `ws.WS2811_STRIP_*`) and the client now passes
  `--freq` and `--color-order` from the part config (`_geometryFor` picks
  `dataRateHz`/`colorOrder` with 800 kHz / GRB fallbacks).

---

## 1. The hardware

5-pack generic **8-bit WS2812B 5050 RGB rings**, DC5V, JST 3-pin connector.
(The part's `modelId` still says `led_ring_diymall_x0040mb5ln_8bit` — electrically
equivalent 8-bit WS2812B, but the metadata does not match what is physically fitted.)

Configured as two rings chained to one 16-pixel strip:
`gpioPin 18` (BCM) = **header pin 12**, PWM0 channel 0, dma 10, `pixelCount 16`, `ringSplit 8`.

**Wiring as last confirmed by the operator:**

| Ring pigtail | Extension | Pi header |
|---|---|---|
| black | white | pin 6 (GND) |
| green | green | pin 12 (GPIO18, data) |
| red   | red   | pin 2 (+5V) |

The JST connector is keyed and mates only one way.
**The extension cable has NEVER been continuity-tested.** Its colours differ from the
ring pigtail (white vs black), so the wire-to-pin mapping inside the two housings is
an assumption, not a verified fact. See §6.

---

## 2. Symptoms

- At V_DD = 5 V: ring lights **bright white, frozen**. Ignores every command —
  blackout, solid colours, walking pixel, palette fade.
- A second ring chained behind it: **always dark**.
- A **brand-new ring** straight from the 5-pack: **identical bright-white frozen behaviour.**
- At V_DD = 3.3 V: **no light at all**.
- Unchanged by brightness (8 / 32 / 255), by data rate (800 kHz and 400 kHz),
  and identical under the MonsterBox daemon and the bare `rpi_ws281x` library.

A WS2812B that never changes has **never latched a valid frame**. It is showing its
power-on garbage state.

---

## 3. PROVEN WORKING (do not re-investigate)

Everything on the Pi side of the header pin is verified.

| Item | Evidence |
|---|---|
| `rpi_ws281x` installed | imports as root: `/usr/local/lib/python3.11/dist-packages/rpi_ws281x/` |
| Daemon owns the strip | `led_ring_daemon.py` `exit(1)`s if `PixelStrip.begin()` fails; it stays running |
| No PWM/audio contention | `snd_bcm2835` blacklisted, not in `lsmod` |
| GPIO18 held by PWM | `raspi-gpio get 18` → `alt=5 func=PWM0_0` |
| PWM clock correct | `vcgencmd measure_clock pwm` = **2 438 964 Hz** = 3 × 800 kHz (WS2812B encoding). `CM_PWMCTL=0x91` (ENAB, BUSY, SRC=osc 54 MHz), `CM_PWMDIV` DIVI=22 → 54/22 = 2.4545 MHz |
| PWM configured for WS2812 | `CTL=0x00002323` → PWEN1=1, MODE1=1 (serialiser), USEF1=1 (FIFO); `RNG1=32`; `DMAC=0x80000703` (ENAB=1) |
| Data actually transmitting | `STA1` (transmitting) asserted in **~3.4 %** of register samples — matches 16 px × 24 bits ÷ 800 kHz = 480 µs per 20 ms frame = 2.4 %. `BERR=0`, no errors |
| GPIO18 not damaged | driven high → `level=1`, low → `level=0`, 4/4, identical to bare control pin GPIO23 |
| Software renders correct colours | dumped `_render()` output directly: smooth red→orange→green→blue→purple, **never white** |

**Conclusion: the Pi emits correct WS2812B data on GPIO18. The fault is downstream of header pin 12.**

---

## 4. ELIMINATED hypotheses

- Driver not installed / daemon not running / PWM misconfigured — all disproved above.
- Onboard audio stealing PWM0 — module blacklisted.
- Wrong PWM pin — swept GPIO18/12/13/19 (header 12/32/33/35) with solid green; no response on any.
- Data rate / WS2811 400 kHz clones — tested 400 kHz, no change. Part is confirmed WS2812B.
- Power sag / current surge — tested at brightness 8, 32, 255; no change.
- Colour-order mismatch — would produce *wrong colours*, not a frozen display.
- Software colour or brightness bug — render output dumped and verified correct.
- **Damaged rings** — a factory-fresh ring behaves identically. See §5.

---

## 5. MY WRONG TURNS (read this — it will save you hours)

1. **I called the ring "damaged" on bad evidence.** I probed GPIO18 as an input with
   the internal pull-up; it read `0` where a bare control pin read `1`, and I concluded
   the WS2812B data input was leaking to ground. **A brand-new, never-connected ring
   reads exactly the same.** The probe was never validated against a known-good ring,
   so it proves nothing about ring health. **Do not use it as a damage test, and do not
   discard any rings on its basis.** What it actually means is still unexplained — it is
   neither a healthy high-Z input (`1`) nor a hard ground (which would defeat the
   driver, and the driver test passed).
2. **I suggested powering the ring at 3.3 V.** WS2812B needs 4.5–5.3 V. It produced no
   light, which wasted a cycle. (Community reports say 3.3–3.6 V *should* give dim light —
   getting nothing is itself a clue, see §6.)
3. **I assumed the extension cable passes straight through, and never tested it.** Every
   conclusion downstream of the header rests on that untested assumption.
4. **I burned early effort on a camera "witness" test** using the character's own webcam.
   The camera faces outward into the room and cannot see the eyes. Inconclusive, discarded.

---

## 6. OPEN hypotheses, ranked

1. **The extension cable is miswired or has an open conductor.** Never tested. Its colours
   do not match the ring pigtail. This is the single largest untested gap and sits exactly
   between the proven-good Pi and the non-working ring.
2. **Data never physically reaches DIN** — open conductor, or landed on DOUT instead of DIN.
3. **Ground not truly common** between the ring's supply and the Pi — a floating data
   reference gives exactly this frozen-garbage symptom.
4. **3.3 V logic level below V_IH.** WS2812B needs V_IH = 0.7 × V_DD = **3.5 V** at 5 V; the Pi
   drives 3.3 V. Genuinely out of spec and worth fixing regardless — but it does **not**
   explain zero light at V_DD = 3.3 V, so it is probably not the whole story.

---

## 7. NEXT STEPS (all require a multimeter or physical rework)

Software diagnosis is exhausted. Everything below needs the physical circuit.

1. **Measure V_DD at the RING end**: red ↔ black on the ring's own pigtail. Expect **4.5–5.3 V**.
   If absent, the extension is the fault — stop there.
2. **Bypass the extension entirely.** Jumper the ring pigtail straight to the Pi:
   black→pin 6, green→pin 12, red→pin 2. Connect **GND → 5 V → data**, in that order.
3. **Continuity-test the extension** end to end, wire by wire, and confirm which ring wire
   each extension wire actually reaches.
4. **Verify DIN vs DOUT.** JST gender enforces direction: the *input* connector mates with
   the feed cable. Confirm the feed is on DIN.
5. **Meter the data line.** A ready-made 1 Hz square-wave script (slow enough for any DC
   multimeter) is at
   `/tmp/claude-1000/-home-remote-MonsterBox/61d597af-8e1b-488f-965f-2e8142d333df/scratchpad/toggle18.sh`
   — stop the daemon first (see §10), run it, then probe at the ring's DIN pad.
   Alternating 0 V / 3.3 V there = the data path is intact.
6. **If all wiring checks out**, fit a **74AHCT125** or **74HCT245** level shifter on the data
   line (powered from 5 V). Cheap field alternative: **one 1N4001 in series with the ring's
   5 V feed**, band toward the ring — drops V_DD to ~4.35 V, pulling V_IH to ~3.0 V so the
   Pi's 3.3 V clears it. Also standard practice: **330–470 Ω** in series with data and
   **1000 µF** across V_CC/GND at the ring.

---

## 8. SOFTWARE CHANGES — complete, tested, UNCOMMITTED

### `python_wrappers/led_ring_daemon.py`
- **Fixed a real brightness bug in `_push()`.** It multiplied master brightness and the
  animation envelope together in perceptual space, then applied the gamma table to each
  channel of the already-quantised 8-bit value. Every table input below 15 maps to 0, so:
  - default `idle` peaked at **RGB(7,1,13)** and sat at **literal black for half its breath**;
  - hue rendered **7:1:13** instead of the intended **3:1:4** — per-channel gamma crushed
    green out entirely and dragged the colour toward its dominant channel.

  Gamma now applies **once**, to the pixel's intensity envelope, in float, with one rounding
  step; all three channels scale by a single factor (hue preserved); a lit pixel is floored
  at 1 so it can never quantise to black. Replaced the 256-entry `GAMMA` table with
  `GAMMA_EXP` + `_duty()`.

  Measured before → after (default idle, brightness 60):
  `0.150: (0,0,0)→(1,0,1)` · `0.425: (2,0,4)→(3,1,5)` · `0.700: (7,1,13)→(10,3,14)`;
  hue 7:1:13 → 3.3:1:4.7.

- **Added a `fade` state** — palette cross-fade. New `_coerce_palette()`, `_palette_color()`,
  `_number()`; `fade` branch in `_render()`; `'fade'` added to `STATES` and `_default_color`.
  Options: `palette`, `paletteRight`, `fadeMs`, `holdMs`, `phaseRight`.

### `services/ledController.js`
- `LED_STATES` gains `'fade'`; new exported `LED_COLORABLE_STATES`.
- `FADE_DEFAULTS` (fadeMs 1200, holdMs 600).
- `setState()` now merges `paletteFor(state)` **under** caller options — saved colours are
  defaults, an explicit colour still wins.
- New `paletteFor()`, `colorConfig()`, `saveColorConfig()`; module-level `normalizeRgb()`,
  `normalizePalette()` (a single bad entry rejects a whole palette).
- `saveColorConfig()` merges into the existing part config so geometry (pin, pixelCount,
  ringSplit, dma) survives a colour edit; invalidates the part cache so changes apply
  without a restart.

### `routes/api/ledRoutes.js`
- `GET /api/led/config`, `POST /api/led/config`.
- `/states` also returns `colorable`.
- `statusForReason`: `no-parts-file` → 409, `write-failed` → 500.

### `views/setup/calibration.ejs`
- New `advancedLedRing` panel in the Advanced tab (shown when `part.type === 'led_ring'`,
  following the existing webcam-panel pattern); `renderAdvancedTab()` extended.
- ~250 lines of panel JS: live per-eye colour picker (drives hardware as you drag),
  link-eyes toggle, live brightness, colour-per-state rows with per-state Test buttons,
  palette swatch editor, fade/hold sliders, Preview Fade, Save, and an "Identify pixels" walk.
- **Reachable at `/setup/calibration` → select "Pumpkin Eyes" → Advanced tab.**

### `data/character-1/parts.json`
- Part 9 config gained `colors`, `palette`, `fadeMs`, `holdMs`, `brightness` (written
  through the API during testing). Geometry untouched.

### Verification
`729` unit tests pass · `62` pact tests pass · `validate:schemas` pass ·
`audit:resolver` pass · `audit:independence` pass · all 3 inline scripts syntax-checked.

---

## 9. BUGS FOUND (1–2 FIXED 2026-09-13)

1. ✅ **FIXED — `colorOrder` and `dataRateHz` were decorative.** `_init_strip()` never passed
   `strip_type` or the frequency to `PixelStrip`. The daemon now takes `--color-order`
   (argparse-validated against the six RGB orders, mapped to `ws.WS2811_STRIP_*`) and the
   client passes `--freq`/`--color-order` from the part config. See §0.
2. ✅ **FIXED — the daemon ignored SIGTERM** (zombie holding PWM0 presented as "LEDs dead"
   after a service restart). Strip access is now serialized (`_strip_lock`), the shutdown
   path never renders concurrently with the animator, and a 10 s `os._exit(1)` failsafe
   arms on any shutdown request. Verified via SPI harness; see §0 for the verification
   boundary. (`sudo` still does not forward a `pkill -TERM` aimed at the wrapper — signal
   the python PID, or use the socket `shutdown` command.)
3. **Do not ship the pull-up "health probe"** I proposed earlier — §5 shows it is invalid
   as a *ring* test. (§0 shows what it actually measures: the extension's fault.)

### 9b. 2026-09-13 adversarial review — fixed vs deferred

Two independent reviewers (Python daemon, JS/controller) plus the gate ran over the whole
LED subsystem before it was staged. **Fixed this session** (all verified):
- Daemon signal handler was not async-signal-safe — it called `Event.set()`/`Timer`/buffered
  `_log` from the handler, which can self-deadlock on a lock the interrupted main frame holds
  (the exact SIGTERM-unkillable zombie the failsafe targets, with the failsafe never arming
  because it sat after `set()`). Handler now only records the signal; the main loop does the
  shutdown. Failsafe timer now arms *before* the fallible log.
- Duplicate-daemon hazard: the client's 3 s backoff made `isAvailable()` false-negative, so a
  live daemon could be shadowed by a second `sudo` daemon that claimed PWM0 before checking
  socket ownership, then rendered against the real one forever (cross-process — `_strip_lock`
  can't help). Fixed both ends: client `resetAvailability()` before the probe; daemon checks
  the socket **before** `_init_strip` and yields (blackout + exit) if it loses a startup race.
- Client crash risk: no `error` listener on the spawned child → an async spawn failure
  (ENOENT/EAGAIN/ENOMEM, realistic under RPi memory pressure) was an uncaught exception that
  took the web server down. Listener added.
- Character-independence: `saveColorConfig(patch, X)` for a non-active character X repointed
  the live controller at X and pushed X's brightness to the daemon driving the ACTIVE
  character. Now only mutates live state when X is active; still returns X's own config.
- `led-ring-bench.py`: `Ctrl+C` mid-run left ~1 A of white latched — wrapped in try/finally
  blackout; also given `--color-order`/`--freq` so it can't disagree with the daemon.

**Deferred (minor, non-blocking) — left as knowledge, not fixed:**
- `_partCache` is only invalidated by `saveColorConfig`; a geometry edit (gpioPin/pixelCount/
  colorOrder) made through the generic parts editor is invisible to the controller until a
  service restart. Colours edited through the LED panel are fine. A restart always picks up
  disk truth.
- The colour-per-state pickers always POST a value for every state, so after the first save
  the "leave unset to keep the default" affordance can't clear a state from the panel (the
  server still supports deletion via the API).
- `set_pixels` sets state `'manual'`, which is not in `STATES`, so a client echoing
  `getStatus().state` back into `set_state` is rejected. Cosmetic.
- The daemon drops its (persistent) client socket after 30 s idle; the client transparently
  reconnects on the next `request()`. Self-healing.

**Running-daemon note:** the live daemon (GPIO18) was spawned before the signal-safety and
peer-check edits and still runs the earlier (also-working) version; those edits are on disk
and activate on the next `systemctl restart monsterbox.service`. They were verified on an
isolated GPIO10/SPI daemon: duplicate refused without touching the strip, SIGTERM clean exit
in 0.89 s via the new flag path.

---

## 10. USEFUL COMMANDS

```bash
# Stop the daemon (SIGTERM does NOT work — see §9.2). Bracket avoids self-match.
sudo pkill -KILL -f "[l]ed_ring_daemon"; sudo rm -f /tmp/monsterbox-led.sock

# Drive the strip directly, daemon out of the picture
sudo python3 scripts/led-ring-bench.py --count 8 --pin 18

# Prove the PWM peripheral is really serialising (expect STA1 asserted ~3% of samples)
sudo raspi-gpio get 18          # expect: alt=5 func=PWM0_0
vcgencmd measure_clock pwm      # expect: ~2438964

# Live API (character 1)
B=https://localhost:3000
curl -sk "$B/api/led/status?characterId=1"
curl -sk "$B/api/led/config?characterId=1"
curl -sk -X POST "$B/api/led/state?characterId=1" -H 'Content-Type: application/json' -d '{"state":"fade"}'
curl -sk -X POST "$B/api/led/pixels?characterId=1" -H 'Content-Type: application/json' \
     -d '{"pixels":[[255,0,0],[255,0,0],[255,0,0],[255,0,0],[255,0,0],[255,0,0],[255,0,0],[255,0,0]],"target":"both"}'

# Restart everything
sudo systemctl restart monsterbox.service
```

---

## 11. NODE STATE AT HANDOFF

`monsterbox.service` **active**, `/health` **200**, LED daemon **up**, state `idle`.
GPIO18 returned to PWM ownership. Nothing left half-configured.
