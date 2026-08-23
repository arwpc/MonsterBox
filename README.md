# MonsterBox - Animatronic Control and Media System

MonsterBox is a single-node animatronic control system for Raspberry Pi 4B with:
- PipeWire + WirePlumber audio (multiple speakers/microphones, per-stream routing)
- MJPEG webcam streaming via mjpg-streamer (port 8090)
- Real hardware control for servos, motors, linear actuators, lights, sensors, steppers.
  (Per-part safety limits were retired at operator direction 2026-08-20 —
  `config/hardware-safety.json` ships empty; the operator manages physical risk at the rig)
- A persistent servo daemon (`python_wrappers/servo_daemon.py`) that owns the I²C bus, so
  multiple servos move **together** instead of glitching each other
- A conversation-driven gesture engine (`services/gestureEngineService.js`) — composite,
  concurrent body motion while the character speaks
- ElevenLabs AI integration for STT, Conversational AI, and TTS
- Goblin video display subsystem for Pi 3B+/4B signage playback
- GitHub Actions CI for automated testing on every commit

This README provides an accurate quick-start and operational overview and links to detailed docs in /docs. The full historical README (~2,640 lines) is preserved in Git history.

## What's New — v10.5.0 (August 2026) — Follow Orders: the animatronics obey spoken commands

Tell any character to "raise your arm", "open the box", or "close your coffin door"
and it obeys — voice orders drive every part type that moves or makes sound, plus
named poses and gesture recipes, on every character. Full design:
`docs/features/follow-orders.md`.

- **Local, deterministic matching** of STT transcripts — no LLM in the loop and
  zero ElevenLabs persona changes. Stop phrases outrank everything; the operator's
  custom commands outrank fuzzy matching; ambiguity refuses with candidates.
- **Bounds-safe execution only**: broken parts skipped, fenced parts refused,
  everything clamped into calibrated windows and duration-capped.
- **Dedicated setup page** at `/setup/follow-orders` (vocabulary builder, spoken
  acks, dry-run phrase tester, order history), a dashboard Orders toggle with a
  live ON AIR badge, a fleet-wide toggle, and disarm wired into emergency stop.
- **Body awareness**: the character knows what its body was last commanded to do
  (ElevenLabs `contextual_update` — non-interrupting, persona untouched), so it
  moves, knows the arm is up, and has an opinion about being ordered around.
- **Cross-animatronic proof**: `scripts/follow-orders-crosstest.mjs` has one
  animatronic order another through real air, with camera evidence per trial.

## What's New — v10.4.0 (August 2026) — What the machine tells you is what the machine did

Nearly every fix in this release is the same fault wearing different clothes: the
software reported the number it was **given** instead of the number it **used**.

- **Mina's PCA9685 channel map, measured.** All sixteen channels swept with an acoustic
  witness plus register readback: **channel 4 (Jaw) is the only channel with anything
  responding on it.** The suspected 0/4/9/11 map and the off-by-one theory are both
  refuted, `parts.json` needs no remap, and the fault is physical — see
  `docs/hardware/PCA9685-CHANNEL-MAP-MINA.md` and the three checks in
  `docs/hardware/OPERATOR-TODO.md`.
- **Calibration stopped guessing.** `nudge` no longer starts from a fabricated 90°
  (which drove a jaw 43° past its calibrated minimum); it seeds from the position store
  and refuses when position is unknown. Set Min/Set Max refuse too, instead of recording
  0°/180° as if it were a measurement.
- **Servo moves report the DRIVEN angle.** An inverted servo commanded to 60° drives to
  119.6°; both `/goto` and `/api/parts/:id/test` used to reply "Moved to 60°".
- **Dead settings removed, not documented.** The STT Sample Rate dropdown and five
  buffer-timing sliders reached nothing. The one microphone gain slider that really
  works was kept; its dead twin was removed.
- **The cameras were always fine** — the panels were lying. A latched retry guard pinned
  healthy webcams at "Webcam unavailable" forever; the dashboard reported "Streaming"
  over a 503.
- **USB model identity** (`meta.usbId`) so a part page can tell "same model" from
  "different model" — vendor:product, never the per-unit serial.
- **Browser suite: 507 passing, 0 failing** (from 501/6/8) — and it no longer drives the
  coffin actuator on every run.
- **A written contract for the part → model → calibration → hardware → API → UX chain**,
  at `docs/development/PART-MODEL-CALIBRATION-UX-CHAIN.md`.

Nothing in this release was verified by ear: speaker output was off throughout and all
three nodes were confirmed muted.

## What's New — v10.0.0 (August 2026) — The Scare Console, and one skin over the whole platform

The dashboard at `/` is now the **Scare Console**: a stage with the live camera,
overlay superpower chips and Listen/VU; a **one-tap deck** beside it with four tabs
(Scenes · Poses · Sounds · **AI**); a **say bar** for the monster's voice; and a
drawer for the long tail. The classic accordion dashboard survives at
`/dashboard/classic`; `/live` was absorbed and redirects to `/`.

- **The AI conversation is a deck tab, not a drawer.** The full chat log, speaker
  routing and browser-mic toggles sit beside the stage; the say bar is the composer.
- **Tactile Obsidian** dresses all 27 pages: serif is the monster's voice, mono is
  machine truth, **amber means happening-now and nothing else**, poison green means
  armed, blood means danger. Taught in-app at `/setup/style-guide`; see
  [docs/development/TACTILE-OBSIDIAN.md](docs/development/TACTILE-OBSIDIAN.md).
- **The telemetry strip is real** — version, RSS, servo latency, uptime and agent
  socket read from live endpoints. An unread value stays an em dash; an unmoved
  servo says `idle` rather than claiming 0 ms.
- **Two motion-arbitration defects fixed**: overlapping poses could free each
  other's servo claims mid-transition, and stopping motion tracking stranded the
  head-tracking pan claim so the servo was locked out of idle motion until restart.
- **Two calibration pages that served live 500s** now redirect to unified
  calibration; **tuned voice configs stopped growing phantom fields** on save; both
  hardware calibration suites were rewritten against the real API and move nothing.

Full detail in `CHANGELOG.md`. Open gaps — including a calibration Run button that
simulates while Save persists — are tracked in
[docs/troubleshooting/KNOWN-BUGS.md](docs/troubleshooting/KNOWN-BUGS.md).

> **Running the browser suite:** stop the service first (the PID lock has no
> test-mode exemption) and set `BASE_URL`:
> `sudo systemctl stop monsterbox.service && BASE_URL=http://localhost:3200 npx playwright test`,
> then restart the service.

## What's New — v9.3.0 (August 2026) — Mina's servos were never broken, and calibration finally lets you calibrate

An evening session on the Mina node plus a fleet-wide audit. Highlights (full detail in
`CHANGELOG.md`):

- **Every UI servo command was silently becoming "go to 50°"** — the part-test route ignored
  the request shape the Pose Editor and calibration pages actually send. Mina's "dead" neck
  was additionally frozen by a zero-width calibration window (`{108,108}`) captured while the
  first bug hid the motion. Both are fixed and can't recur: `isDegenerateWindow()` refuses
  zero-span bounds at every writer, and the parts test route honors all caller shapes
  (including motor `stop`, which used to *drive the motor forward at 100%*).
- **Supervised calibration override** — the calibration page's manual controls, nudge, homing
  and jog-raw can now measure a part's *real* travel past the previously-configured safety
  window, and homing reaches the physical endstop. Quarantines, retract blocks, speed caps
  and fused-rail serialization never relax. Runtime paths stay fully clamped.
- **The progressive-slowdown family is gone**: leaked VU/sensor/status polling loops (each
  spawning a ~350 ms Python+ALSA process, stacking per page interaction) were found by a
  five-dimension adversarially-verified audit and fixed across calibration, audio, system and
  motion-tracking pages, along with the dead audio-levels cache behind them.
- **Controls tell the truth now**: the continuous-servo Stop that stopped nothing, the
  EMERGENCY STOP that 404'd into a green toast, sweeps/homing/jogs that reported success for
  refused drives, and phantom calibration positions from swallowed hardware refusals.
- **Character independence in the hot paths**: `characterId` threaded through scene execution,
  head tracking (with failure back-off), and jaw/head calibration lookups.
- **Hygiene**: the ElevenLabs API key no longer leaks into the world-readable log, deploys no
  longer overwrite a node's own calibration/state, `wpctl`-first audio control on nodes
  without `pactl`, and ~70% less log spam on SD cards.
- **Orlok's voice** matches the owner's vocal-profile research on both the agent and
  say/scene paths (stability 0.3, octave-dropped chest voice), ear-checked live.

## What's New — v9.2.0 (August 2026) — Right voice, body that moves together, show that reaches the yard

Includes v9.1.0, which was opened and superseded in the same session and never shipped
separately. No new frameworks, no new npm dependencies, all existing API contracts preserved.

- **Your characters speak in their own voices again.** Four of six were speaking in someone
  else's on the say/scene path — PumpkinHead in Sir Dragomir's voice, Renfield and
  Groundbreaker both as Orlok — because a hardcoded voice map in `services/aiConfigStore.js`
  never tracked the agent-side voice changes. Voice identity is now **data**, synced into each
  character's `ai-config/tts-config.json` from the committed agent snapshots in
  `config/elevenlabs/agents/`. Separately: **saving anything on the AI settings page used to
  delete the selected character's `voice_id` and `speed`** (the save replaced the whole file
  and that page exposes three fields). Saves now merge.
- **Servos can finally move together.** Every servo command was a new process, and
  `pca9685_control.py` re-initialised the chip unconditionally — and writing the prescaler
  requires MODE1 SLEEP, which stops the oscillator and **drops PWM on all sixteen channels**.
  Measured before/after on a reference node, 24 commands aimed at an unconnected channel:
  **11 SLEEP events and 53 no-pulse reads on the head channel → 0 and 0.** Init is now
  non-destructive and channel writes are atomic. A new persistent daemon
  (`python_wrappers/servo_daemon.py` + `services/hardwareService/servoDaemonClient.js`) owns
  the bus: **two servos written <1 ms apart, a two-channel 50 Hz ramp sustained at 49.9 Hz,
  p50 round trip 3.37 ms against 200–580 ms per process spawn.** Direct I²C remains as a
  fallback, and safety is still decided in Node before dispatch — the daemon can only narrow a
  limit, never widen one.
- **New: a conversation-driven gesture engine.** `services/gestureEngineService.js`, recipes as
  data in `data/character-{id}/gestures.json`, API at `/api/gestures`. Steps run
  **concurrently** (the head leads, the body follows), and the loader **refuses** single-part
  recipes, out-of-bounds targets, safety-blocked parts, and two parts on one power rail whose
  motion overlaps. Verified on hardware: **head 98.8° → 119.6° and forearm 103.9° → 109.9°
  within one gesture, 0 SLEEP events, 0 torn reads.** Spec:
  [docs/development/GESTURE-ENGINE-SPEC.md](docs/development/GESTURE-ENGINE-SPEC.md).
  ⚠️ The ElevenLabs client tool that would let an agent *call* a gesture is **staged but
  withheld** — a live probe showed one character speaking gesture ids aloud in 30% of replies
  instead of calling the tool (`config/elevenlabs/gesture/README.md`).
- **New: `scripts/fleet-audio/earcheck.mjs` — the instrumented cast test.** It records each
  node's **own** microphones while that node speaks, measures the speech envelope against that
  mic's own noise floor, transcribes with ElevenLabs Scribe, and now also checks **which voice
  was actually used** against the canonical snapshot. Result with all three live nodes on
  9.2.0: **Orlok AUDIBLE** (20.1 dB rise, 100% word recall), **Sir Dragomir AUDIBLE** (33.3 dB,
  canonical voice confirmed), **Mina AUDIBLE** (12.4 dB, 80% recall, canonical voice confirmed)
  — **the three offline nodes untestable, not passing.**
  `scripts/yard-theater/verify-moment.mjs`
  applies the same two gates to a whole show — the Dusk Ceremony is now verified end to end on
  real speakers, each node confirmed by its own microphone.
- **A test run can no longer reach the real yard.** A browser test fired a genuine fleet
  emergency stop twice during a suite run and disarmed superpowers on live animatronics.
  Route-level `MB_TEST_MODE` guards had missed `/api/panic` entirely; the guard now sits on
  `orchestrationService.httpNode`, the single egress point for every inter-node call. Reads are
  still allowed, writes are refused.
- **Halloween show fixes.** Every audio step in every Yard Theater moment was a guaranteed
  no-op (`play-audio` needs an `audioId`, `perform.mjs` only sent a filename), and
  `thomas-whisper.mp3` was in no node's audio library at all — the Thomas moment would have
  been silent. Also: `/home/remote/yard-theater-logs/` did not exist, so **every scheduled cron
  line would have failed at the redirect and never run.**
- **The PHI scrubber that protects the Yard Registry was rebuilt as an allow-list** after an
  adversarial corpus of 36 cases broke the old deny-list 23 times — worst case leaving
  "Emily Rodriguez" completely intact because Emily is a canon name. Now 51/51, with a real
  transcript carrying "Aaron Warner" having forced a further tightening. The 2am harvest only
  runs if that suite passes.
- **mDNS discovery is working fleet-wide again** — `avahi-utils` had never been installed on
  this node and `avahi-daemon` was not running on another. All three live nodes now advertise
  `_monsterbox._tcp` and see each other, which is what lets a node auto-appear when it boots.
- **Renfield (character 6) completed on paper** — shake-motor enable pins fixed (both BTS7960
  enable lines were declared on the same GPIO, which would have failed at pin setup so the
  motor never turned), placeholder image, and a fleet entry with a deliberately **null** IP
  that fails in ~126 ms instead of dialling a guessed address. **His Pi has never been on the
  network.**

> ⚠️ **Three of six nodes were offline for this entire session and are unverified on
> hardware:** PumpkinHead (char 1), Groundbreaker (char 5), and Renfield (char 6), which has
> never been networked at all. Nothing in this release has run on them.
>
> **Orlok, Mina and Sir Dragomir are all deployed and serving 9.2.0**, and all three were
> confirmed audible by their own microphones. **A fix only exists on a node that received the
> deploy**, which is not theoretical: the ear-check caught Sir Dragomir still speaking in his
> **retired** voice because the fix had not yet reached his Pi; after deploying he came back
> AUDIBLE in his canonical voice, checked against the committed agent snapshot.
>
> ⚠️ **The speaker rigs are not level-matched** — one node carries across a room at sink volume
> 0.30 while two others are inaudible below ~0.5 (Mina was `GARBLED` at her 0.65 default and
> needed 0.90). **A daylight level-balancing pass in the yard is still outstanding.**
> Full status: [docs/troubleshooting/KNOWN-BUGS.md](docs/troubleshooting/KNOWN-BUGS.md).

## What's New — v9.0.0 (August 2026) — Hardware safety, real hardware paths, live conversation

The release that stops the software lying about the hardware. No new frameworks, no new npm
or system dependencies, all existing API contracts preserved.

- **Per-part hardware safety limits, enforced.** `config/hardware-safety.json` +
  `services/hardwareService/safetyLimits.js` clamp angle to the intersection of calibrated
  bounds and configured limits, cap speed and duration, hard-block retraction of a part
  already sitting at its mechanical minimum, and **serialize servos that share a power rail**
  so their inrush currents cannot stack and pop a fuse. Parts with no configured limits are
  pass-through, so nothing else changes. A part can also be quarantined outright
  (`blockAllMotion`) or excluded from automated tests.
- **Hardware commands go to the character you asked for.** `controlPart()` and
  `batchMoveServos()` used to re-resolve the part against whatever `selectedCharacter` was on
  disk. Part IDs are unique only *within* a character, so a flipped global value meant
  "move part 4" drove a completely different physical channel — and a test run could flip it
  on the live node. Fixed, and it explains the long-standing "channel 15 is moving and nothing
  is configured there" mystery.
- **The conversation loop actually works.** Continuous microphone capture (one long-lived
  `parec`/`ffmpeg`/`arecord` stream instead of a fresh process every tick) took the mic duty
  cycle from **34% to 98.5%**, so the agent hears whole sentences instead of a third of them;
  jaw motion is driven per 50 ms frame rather than once per network chunk; echo suppression no
  longer breaks after the first reply, so the animatronic stops conversing with itself; and
  the canonical STT call, which used to hang **forever** on every transcription, now returns
  in under a second. Verified live: speaker → air → USB mic → transcript, word for word.
- **The jaw stays inside its calibrated range.** A placeholder 0–180 calibration profile was
  silently overriding hand-set Min/Max markers, so the jaw was being driven past its stops on
  every path including TTS. ⚠️ Jaw travel visibly changes with this release — it is now
  correct, not reduced.
- **One dead part no longer ends the show.** A failing hardware step used to abort the entire
  scene. Hardware steps are now non-fatal: the scene plays through and reports which steps
  failed. Sensor gates stay fatal on purpose (a trigger that silently "succeeds" would fire
  the scene at the wrong time).
- **Orlok pose library: 8 → 34 poses**, authored inside the verified-safe envelope and
  excluding every broken or quarantined part. Also fixed underneath it: the idle loop was
  silently discarding lights and linear actuators from idle poses, and pose *duration* set in
  the editor was ignored by the engine.
- **Security.** Remote unauthenticated **reboot/shutdown is closed** (any caller without an
  `Origin` header — every curl and script — used to be allowed; now loopback only, or set
  `MB_ADMIN_TOKEN`). The leaked SSH password is out of the working tree; unauthenticated
  arbitrary file deletion via the SSH-key endpoint is closed; dev-only advisories patched.
  ⚠️ **The SSH credential is still in git history and must be rotated on every node**, and
  `MONSTERBOX_SSH_PASSWORD` / `MB_ADMIN_TOKEN` must be set in each node's `monsterbox.service`
  environment — the app does not load `.env`.
- **UI-triggered fleet deploy works** (it had always passed the wrong arguments to
  `deploy-to-animatronic.sh`), and hardware tests no longer leave phantom parts behind in live
  show data.

### Interface

Four reviewers drove the live UI as different people — a newcomer, the builder, the operator
on Halloween night, and someone running a multi-prop display. They found the same thing from
four directions: **the product asserted success it had not established.** Details and the
full prioritized list: [docs/development/V9-PERSONA-REVIEWS.md](docs/development/V9-PERSONA-REVIEWS.md).

- **A global control bar on every page**, carrying character identity, a live server probe,
  master volume and stop-everything. Stop **fires on press** — a 600 ms hold was measured
  firing *nothing* when jabbed five times, which is what a person actually does when a child
  starts crying. One `POST /api/panic` does the work server-side, because a client-side
  fan-out can sit in a saturated connection pool and never leave the handset.
- **Panic now disarms the trigger, not just the playback.** Lurk, the motion sensor, head
  tracking and the idle loop are all switched off — previously the frightened guest backing
  away tripped the sensor and fired the scare again.
- **The calibration API no longer bypasses the safety layer.** It drove adapters directly, so
  the whole `/api/calibration/*` surface went around `blockAllMotion` and the angle windows.
- **A responsive layer**: 44 px touch targets, hover scoped to devices that can hover, tables
  that become labelled cards, full-screen modal sheets, safe-area insets, and a wake lock so
  the phone stops sleeping between groups.
- **`npm run audit:design-system`** in the gate — a shrink-only ratchet, like the
  character-independence audit. **1429 → 211 violations** and it can only go down.
- **The design system's colours finally apply.** A v6.1 stylesheet was redeclaring the
  semantic tokens in `:root` and, loading last, silently overrode all three themes app-wide.
- **`/live` (Show Mode) is reachable**, and the character speaks with its whole jaw:
  perceptual amplitude mapping took jaw travel from **21.8% to 100%** of its calibrated range.
  *(v10: `/live` was absorbed into the Scare Console at `/` and now redirects there.)*

> ⚠️ **Orlok is NOT fully hardware-verified.** Part 4 (Elbow) is **confirmed physically dead**
> by the operator and is software-quarantined; part 2 (Left Arm) does not move; part 3 (Bow)
> is quarantined for contradictory wiring. **The ch4/ch5 fuse problem is mitigated in software
> only — the root cause is electrical and unresolved**, and the state of that rail is the
> highest-value physical check outstanding. The pose library is statically validated but only
> partly watched on hardware. Full per-part status and next diagnostics:
> [docs/troubleshooting/KNOWN-BUGS.md](docs/troubleshooting/KNOWN-BUGS.md).

## What's New — v8.5.0 (July 2026) — Fleet Command Center

The orchestration page is rebuilt into a single-pane **Fleet Command Center** that
monitors and runs the entire animatronic network from one place — no new frameworks, no
new dependencies, HTTPS-only inter-node, all existing API contracts preserved.

- **Remote webcams stream again.** The proxy hardcoded the wrong MJPEG boundary
  (`boundary=frame` vs mjpg-streamer's `boundarydonotcross`), so browsers never rendered a
  frame. It now forwards the upstream Content-Type and drops the 30s stream timeout that
  killed healthy feeds. Verified painting live frames in-browser.
- **Live node wall** — one cockpit card per animatronic: streaming webcam (click to
  enlarge), source/trust chip, a live health line (version · RSS · uptime · servo latency ·
  CPU), and per-node Say / Ask-AI / audio play·loop·stop / Auto-AI. Cards patch
  incrementally, so the 15s refresh never wipes typed input or restarts a webcam.
- **Sticky command bar** — fleet-health rollup, six superpower masters (Lurk / Jaw / Head /
  Motion / Idle / Mute) broadcast to the whole fleet or a selected subset, master-volume
  slider, Start/Stop all queue loops, Say-to-all, and a big red **EMERGENCY STOP** (halts
  queues + audio + random poses + mute). Destructive actions confirm first.
- **Real fleet health & meaningful results** — `GET /api/orchestration/fleet-health`
  aggregates per-node telemetry; broadcasts now report `{successful, total, failed}` instead
  of a misleading always-`true`.
- **Discovery panel** — surfaces mDNS availability and the config/discovered/pinned
  breakdown, with a **pin-a-node form** whose pins now persist across restarts
  (`data/manual-nodes.json`) for multicast-blocked networks.
- **Hardening** — inter-node calls go through one audited gateway with abortable timeouts;
  host validation closes an SSH command-injection vector via spoofed discovery; optional
  `MB_NODE_TOKEN_ENFORCE` gates control on mDNS trust. ⚠️ Rotate the committed fallback SSH
  password and set `MONSTERBOX_SSH_PASSWORD` per node (startup now warns).
- Tests: orchestration system suite (41) and browser suite (13) rewritten; all-pages
  health green (24/24). See [docs/development/ORCHESTRATION.md](docs/development/ORCHESTRATION.md).

## What's New — v8.4.1–8.4.3 (July 2026) — Multi-node made easy

### Zero-config node discovery (mDNS) — v8.4.1
- **New animatronics are found automatically.** Name a node at setup, let DHCP assign its
  address, and every other node discovers it over mDNS (`_monsterbox._tcp`) and shows it
  come online — no hand-typed IPs, no `config/animatronics.json` edits on any peer.
- Built on the system `avahi` daemon via `child_process` (**no new npm dependency**);
  discovery only, control stays HTTPS. Falls back to the static config when mDNS is
  unavailable, so existing setups are unchanged.
- Manual-IP fallback for multicast-blocked networks (`POST /api/orchestration/nodes/manual`),
  an optional `MB_NODE_TOKEN` trust secret, and `GET /api/orchestration/nodes` for the live
  registry. See [docs/development/NODE-DISCOVERY.md](docs/development/NODE-DISCOVERY.md).

### One-command fleet deploy — v8.4.2
- **`npm run deploy:all`** deploys the current codebase to **every** animatronic in
  `config/animatronics.json` at once (in parallel, with a ✓/✗ summary) and lights up mDNS
  discovery on each node. Character-independent — a 6th character deploys with no script
  edit. SSH creds come from `MONSTERBOX_SSH_PASSWORD` (never hardcoded); `--dry-run` previews.

### Fleet discovery matrix — v8.4.3
- **`npm run check:discovery`** queries every node and prints a who-sees-whom matrix, so a
  node that's up but not being discovered (multicast-blocked, avahi down) is obvious at a
  glance. First-run guide: [docs/setup/NODE-DISCOVERY-VALIDATION.md](docs/setup/NODE-DISCOVERY-VALIDATION.md).

## What's New — v8.4.0 (July 2026) — Gold Release

MonsterBox 8.4.0 is a gold stability release. It consolidates a full application-wide
audit, complete in-app help coverage, a new whole-app health test, and a clean
dependency-security bill of health — no new frameworks, no new dependencies, no API
contract changes.

### Full Stability Audit — 58 fixes
- **14-subsystem adversarial audit** of the whole app (server, routes, services, controllers, Python wrappers, client JS). 75 raw findings → **58 verified defects** (2 critical, 14 high, 21 medium, 21 low); all fixed bar one intentionally-unchanged sync write.
- **Security:** closed path-traversal on the character-image and `/api/play-audio` endpoints, OS-command injection via `journalctl`/`ssh-keygen` (switched to `execFile`), guarded destructive `/api/system` endpoints (optional `MB_ADMIN_TOKEN` + CSRF rejection), bound always-on test ports (3100/3200) to loopback, gated `GET /__kill` to test mode, and moved SSH creds off the process table.
- **Crashes & correctness:** server no longer dies at boot without an ElevenLabs key; Goblin video/playlist deployment now works; calibration and actuator-position stores are character-scoped (part IDs aren't globally unique); jaw config, `/api/parts`, and scene CRUD honor the requested character; fixed a null byte in `servo_cli.py` that had broken **all** PCA9685 servo moves since v7.9.6.
- **Data integrity:** new `services/atomicStore.js` (temp-file+rename writes with a promise-chain mutex) and an `updateJsonUnderLock` helper serialize read-modify-write for scenes, poses, super-powers, parts, app-config, and calibration.
- Full per-finding table: [docs/development/STABILITY-AUDIT-2026-07.md](docs/development/STABILITY-AUDIT-2026-07.md).

### Complete Mouseover / Help Coverage
- **Every interactive control now has a native `title` tooltip** — buttons, selects, link-buttons, and interactive inputs, including controls emitted at runtime from inline scripts. Enforced by `scripts/audit-tooltips.mjs` (current status: **0 gaps**).

### All-Pages Health Test
- **`tests/browser/all-pages-health.spec.js`** — visits all 24 pages, opens every modal, and asserts zero JS/console/network/server errors per page (**24/24** green).

### Dependency Security — 0 Vulnerabilities
- Non-breaking `npm audit fix` patched 9 advisories (multer, ws, axios, form-data, qs, express, body-parser, follow-redirects, js-yaml) inside existing `^` ranges, plus a new `goblin/package-lock.json` for the Goblin subsystem. `npm audit` now reports **0 vulnerabilities**.

### Previous — v8.3.0 (April 2026)

### Stabilization Pass
- **Pre-deploy gate** — `npm run gate` runs schemas + resolver audit + bias audit + smoke + pact in ~30 s on RPi4B. Blocks regressions at pre-push and in CI. Opt-out via `MB_SKIP_GATE=1` (use sparingly — CI still runs).
- **Canonical character resolver** — `services/characterContext.js` is the only supported path to character context. Direct reads of `selectedCharacter` / `characterId` outside the resolver are blocked by `npm run audit:resolver`.
- **Per-character schemas** — `config/schemas/*.schema.json` cover `parts.json`, `poses.json`, `scenes.json`, `super-powers.json`, `ai-config/*`. Startup validates without crashing; failures degrade the affected subsystem only.
- **Pact suite** — `tests/pact/character-contract.test.mjs` runs 11 assertions per character from `data/characters.json`. Adding a 6th character auto-adds 11 assertions with no new code.
- **Ratchet allowlists** (shrink-only): a resolver allowlist and a character-independence allowlist that only shrink over time — see `eslint-rules/no-direct-character-resolution.allowlist.json` and `tests/baseline/character-independence-allowlist.json`.
- **Claude Code primitives** — `character-auditor` subagent, `/add-part`, `/add-character`, `/pre-deploy-gate` skills in `.claude/`.
- See [docs/development/STABILIZATION-RESULTS.md](docs/development/STABILIZATION-RESULTS.md) for full metrics.

### Previous — v8.0.0 (March 2026)

### Mina Fully Operational
- **All 10 hardware parts working** — Servos, coffin door actuator, laser, light, PIR sensor, speaker, webcam, microphone verified
- **Per-character TTS voices** — Each character has a unique ElevenLabs voice fallback; no character accidentally sounds like another
- **invertDirection for actuators** — Per-part flag for reversed wiring polarity (Mina's coffin door vs Orlok's)
- **8 poses + head tracking** — Full pose library and head tracking configured for Mina

### Orchestration (Multi-Animatronic Control)
- **HTTPS inter-node communication** — Orchestration now properly uses HTTPS with self-signed cert support to communicate between MonsterBox nodes
- **Webcam proxy fix** — Orchestration webcam streams now work correctly (URL path extraction from absolute URLs)
- **40 new tests** — 26 system API tests + 14 browser E2E tests covering all orchestration endpoints
- **Multi-node deployment** — Code synced across Orlok and Mina via git push/pull

### Previous — v7.9.6 (March 2026)

### Pose Execution & Movement
- **Instant pose response** — Dashboard pose buttons fire-and-forget; hardware moves in background with no UI delay
- **Batch PCA9685 commands** — All servos in a pose sent in a single Python call (~500ms total vs ~1350ms+ sequential)
- **Idle loop fixed** — Transition engine now correctly reads pose angle format; servos move between idle poses during Lurk Mode
- **Browser speaker for TTS** — "Say This" mode plays audio through browser when Browser Spk is enabled

### Listen In Audio (Browser Audio Bridge)
- **Clean audio streaming** — Fixed static/noise by buffering pw-record output into fixed 200ms chunks at 48kHz (matches browser AudioContext native rate)
- **Motion sensor toggle** — Standalone PIR sensor control in superpowers strip, independent of Lurk Mode

### Dashboard UX Overhaul
- **Unified chat input** — "Ask AI" and "Say This" modes in a single input with toggle button; no more hunting between two text fields
- **Consolidated audio controls** — One mute toggle, one stop button; browser audio routing kept in chat panel
- **Draggable panels** — Reorder Scenes, Poses, Manual Controls, Console, and Audio Bridge panels by dragging; order persists
- **Removed Translate** — Unused feature removed from toggle strip, routes, and tests

### Real-Time Activity Badges
- **Green hardware indicators** — Lurk mode badges glow green when hardware is actively firing (jaw moving, head tracking, idle transitioning, motion detected, AI speaking)

### Head Tracking Fixes
- **Person detection** — Fixed default detection mode from `motion` to `person`
- **Scanning sweep** — Head servo pans left-to-right when no target detected, searching for visitors
- **Click-to-track** — Visual crosshair overlay on webcam shows tracking target; 30-second countdown

### Movement Telemetry
- **Connected to hardware** — Transition engine now actually dispatches servo commands (was computing angles but not moving)
- **Telemetry flowing** — Movement tab on System page now shows live cycle time, latency, and command rate data

### Tooltips Everywhere
- Comprehensive tooltip coverage added to Audio Library, AI Settings, Video Library, Navigation, Calibration, Pose Editor, Characters, and Dashboard controls

### Previous: v7.8.0 (March 2026)

### Lurk Mode Motion Sensor & Sleep/Wake
- **Motion sensor monitoring** — PIR sensor polled every second while Lurk mode is active; movement keeps the animatronic alive
- **Inactivity timeout** — After 5 minutes of no motion or activity, Lurk mode "sleeps" (disables superpowers, keeps watching sensor)
- **Wake on motion** — PIR detection while sleeping fully re-activates all superpowers; the animatronic springs back to life
- **Graceful degradation** — Characters without motion sensor, jaw servo, or head servo get badges grayed out (no errors)
- **Larger, readable Lurk bar** — Font sizes increased for dashboard readability

### Previous: ElevenLabs v3 TTS (v7.5.0)
- **Default TTS model upgraded** from `eleven_flash_v2_5` to `eleven_v3` — the most expressive ElevenLabs model, with native audio tag support
- **Audio tags** for dramatic animatronic speech: `[breathes heavily]`, `[whispers]`, `[hisses]`, `[slow]`, `[dramatically]`, `[exhales]`
- **Pause mechanics** via punctuation: dashes for dramatic pauses, ellipses for weight/hesitation, commas for breath
- **v3-aware service layer** conditionally omits `style`/`use_speaker_boost` params (not supported by v3)
- **TTS Settings UI** updated: v3 shown as default, info note when v3 selected about unsupported params

### Character Renames
- **Coffin Breaker → Mina** (Character 2) — updated across entire codebase
- **Skulltalker → Sir Dragomir** (Character 4) — updated across entire codebase
- All deployment scripts, hostnames, part names, documentation, and test fixtures updated
- ElevenLabs agent IDs mapped correctly to all 5 characters

### Agent Template Overhaul
- Agent prompts now **encourage** audio tags and pause mechanics (previously forbidden)
- Quick fallback responses use dramatic punctuation and tags for all characters
- LLM model list updated (Claude Sonnet 4.6, Gemini 2.0 Flash)

### Previous: v7.3.0 (March 2026)

#### Audio Reliability Overhaul
MonsterBox 7.3 makes audio input and output rock-solid with targeted fixes to the entire audio pipeline:

- **TTS playback fixed**: `pw-play` was receiving MP3 data it couldn't decode — now MP3 always routes through `mpg123`, with `pw-play` reserved for WAV/PCM only
- **No more audio gaps**: AI speech no longer kills the persistent playback stream — uses separate one-shot players instead
- **Audio library always loads**: Fixed startup race condition where the library appeared empty if requests arrived before the initial file scan completed
- **Microphone stability**: Cached PipeWire source resolution (60s TTL) eliminates repeated `wpctl status` shell-outs on every capture chunk
- **Audio loop robustness**: Fixed EPIPE crash when audio device disconnects during looped playback

### Audio Library Redesign
- **Table-based file manager** replaces unusable grid of tiny cards — all files visible immediately
- Inline play/stop, loop, favorite, edit, download, delete on every row
- Now Playing indicator highlights active row
- Compact search, category filter, and sort controls
- Designed for managing 50-150 audio files per animatronic

### System Volume Control
- **Volume slider** added to System > Settings tab (first accordion item)
- Uses `wpctl set-volume` for immediate PipeWire volume changes
- Default set to 90%

### Previous: v7.0.0 (March 2026)

MonsterBox 7.0 is a major release consolidating all v6.x features into a polished, production-ready platform. Key highlights:

### Head Tracking & Motion Detection
- **Head Tracking Setup Page** (`/setup/head-animation`) — OpenCV-based motion tracking with servo head mapping, live webcam overlay, hot-parameter tuning, test sweep
- **Face & Hand Detection** — Haar cascade face detection and HSV skin-color hand detection as alternatives to motion tracking, with hot-switchable detection modes
- **Click-to-Track** — Click on webcam to set a manual tracking target for 30 seconds with countdown overlay
- **Head Tracking Presets** — Save/load/delete custom tuning presets; built-in presets (Person, Noisy, Sensitive) protected from deletion
- **Dashboard Integration** — Status badge (Active/Searching/Off), toast notifications, 1-second status polling

### Audio & Microphone
- **Faster VU Meter** — Reduced STT capture chunks from 2s to 0.3s, cached capture method, 3x gain boost
- **Echo Suppression Everywhere** — Mic suppression added to all playback paths (buffer, AI, jaw sync), increased tail buffer to 2500ms
- **Scene Concurrency** — Fire-and-forget model replaces pair-based grouping — multiple consecutive concurrent steps all fire in parallel

### Dashboard & UI
- **Bootstrap Tooltips** — Descriptive hover tooltips on all Monster Features toggles (Jaw, Parrot, Translate, Head Tracking, Mute)

### Documentation
- New setup guides: Audio & Microphone Setup, Echo Suppression, Scene Concurrency

### Previous Highlights

### Jaw Animation v2: Real-Time Audio-Synchronized Jaw Control
- **Persistent Servo Daemon**: Long-running Python process for PCA9685 I2C control replaces per-frame Python spawns (~580ms → <1ms per servo command)
- **Pre-Analysis Engine**: Complete audio analysis before playback using ffmpeg bandpass filter (500-2500Hz speech formants), AGC, and quantization to discrete jaw positions
- **Synchronized Playback**: `playWithJawSync()` pre-analyzes entire audio file, then plays audio and jaw timeline in parallel with drift-correcting scheduling — eliminates the 100-500ms desync
- **Scene Integration**: `sayThis`, `askAI`, and `audio` scene steps now automatically sync jaw movement during TTS/audio playback
- **Speech Filter**: Bandpass filter isolates 500-2500Hz speech formant range — eliminates erratic jaw movement from bass/sibilants
- **Auto Gain Control (AGC)**: Automatically normalizes audio peak to 0.8 — no manual sensitivity tuning per audio file
- **Quantization**: Discrete jaw positions (5-20 configurable levels) for more natural animatronic movement
- **Timeline Visualization**: Canvas-based jaw position preview on setup page after TTS test
- **Presets**: Speech, Music, Custom presets for quick configuration of filter/AGC/quantization settings
- **20ms Frame Rate**: Matches PCA9685's 50Hz PWM update rate (was 50ms)

### Previous: v6.1.2 — Audio Stack Overhaul

### Previous: v6.1.1 — Bootswatch Themes, PIR Sensor Fix, Calibration Refactor

### Previous: v6.1.0 — Animation Studio
- **Unified three-panel interface** at `/scenes` replaces separate Scenes, Scene Editor, and Poses pages
- Left: Scene Library (search/filter), Pose Library (by category), Queue (play/loop/pause/skip)
- Center: Timeline editor with color-coded step blocks, inline editing, SortableJS drag-reorder
- Right: Webcam live preview, Part Palette (grouped by type), quick-add Action palette
- Toolbar with Jaw Animation and Head Tracking toggles, Emergency Stop, Ctrl+S save
- 14 scene step types including new **jaw-animation** and **head-tracking** steps
- Drag-and-drop from palette to timeline, scenes to queue, poses to timeline

### Route Consolidation
- `/setup/poses` and `/poses` now redirect to Animation Studio; JSON APIs preserved
- Navigation shows single "Animation Studio" link under Activities

### Testing (v6.1.0)
- **174 passing** (browser + system + unit), 7 skipped, 2 pre-existing failures
- 10 new system tests for jaw-animation/head-tracking step types
- 18 updated browser tests for Animation Studio UI

### Previous: v6.0.0 — Character Independence & Dynamic Versioning
- All hardcoded character names and ID defaults removed
- Version sourced from `package.json` everywhere
- `MB_TEST_MODE=1` flag for safe testing without hardware init

## Quick Start (RPi4B)
```bash
# 1) Clone the repo
git clone git@github.com:arwpc/MonsterBox.git
cd MonsterBox

# 2) Run the full installer (system deps, Node, Python, audio, SSL certs, systemd service)
sudo bash install.sh

# 3) Reboot to apply hardware/audio changes
sudo reboot

# MonsterBox starts automatically via systemd
# Dashboard: https://<your-pi-ip>:3000
```

For manual/partial setup or multi-node deployment: docs/deployment/README.md

## Key Services and Ports
- MonsterBox app: :3000 (HTTPS, self-signed cert)
- Real-time chat WS (conversation): :8795
- Webcam (mjpg-streamer): :8090
- Goblin player API (on Goblins): :3001

## Audio (PipeWire/WirePlumber)
Goals: device-first routing (avoid hw: directly), VU meters, server-side microphone/STT and speaker/TTS per Character.

**Speaker mute is persistent.** The mute toggle is stored in `data/speaker-state.json`
and restored on startup, so a node muted for the night stays muted across a service
restart — including the restart performed by `npm run deploy:all`.

- Device enumeration (server):
```bash
wpctl status
pactl list short sinks
pactl list short sources
```
- Health endpoints (server):
```bash
curl http://localhost:3000/api/audio/health
curl http://localhost:3000/api/audio/info
```
- TTS test (plays on Character's assigned speaker):
```bash
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from MonsterBox","characterId":3}'
```

More: docs/deployment/README.md

## Webcam (MJPEG) - Verification
Always verify actual image bytes, not just service status.

- Check headers:
```bash
curl -s -D - http://localhost:8090/?action=stream | sed -n '1,10p'
```
- Check MJPEG boundary and JPEG data:
```bash
curl -s http://localhost:8090/?action=stream | dd bs=1k count=64 2>/dev/null | \
  (grep -a -m1 -E -- '--|Content-Type: image/jpeg' -n || hexdump -C | head -n 8)
```

## Calibration and Controls
- Calibration panels shown only for **movement parts**: servos, motors, linear actuators, steppers
- Non-movement parts (webcam, microphone, speaker, light, sensor) show type-specific controls only — no calibration UI
- Guardrails: Jaw Animation and Head Tracking respect Min/Max
- **Calibrated stamp**: the Bounds panel carries an explicit operator toggle —
  `POST /api/calibration/:partId/calibrated` with `{ calibrated: true|false }`. Use it to
  bless a part you verified by hand, or to retire a calibration you no longer trust
  (stamping OFF keeps the captured numbers on disk but stops every motion path from
  trusting them). It works for **all** capability kinds: only absolute servos carry a
  bounds window — continuous servos, linear actuators, motors and steppers are
  `bounds: null` and calibrate through their motion model. The one refusal is a
  zero-span (`min == max`) window, which would freeze the part at a single position.
- **Clear Calibration**: Remove calibration data for individual parts or all parts of current character
  - Individual Clear: Click "Clear" button in calibration panel (removes min/max/presets for selected part)
  - Clear All: Click "Clear All Calibrations" button next to mode toggle (clears all parts of current character)

Open: http://localhost:3000/setup/calibration

## Jaw Animation v2 (Super Power)

Jaw Animation v2 drives a servo to match speech amplitude in real-time, producing lifelike mouth movement during TTS playback. Uses a persistent Python servo daemon (<1ms per command), complete audio pre-analysis with speech bandpass filtering, and synchronized playback scheduling.

**Architecture:**
1. **Persistent Servo Daemon** (`python_wrappers/servo_daemon.py`, entered via `jaw_servo_daemon.py`): Long-running Python process initializes the PCA9685 I2C bus once and accepts JSON commands. Managed by `services/jawServoDaemon.js`. As of v9.2.0 this is the **single owner of the I²C bus for every servo**, not just the jaw — it serves the original stdin/stdout jaw protocol byte-for-byte *and* a Unix socket at `$MB_SERVO_SOCKET` (default `/tmp/monsterbox-servo.sock`) that `batchMoveServos` and PCA `moveToAngle` use. Callers fall back to spawning `servo_cli.py` if the daemon is absent.
2. **Pre-Analysis Engine**: Before playback, entire audio is decoded and analyzed:
   - ffmpeg bandpass filter isolates 500-2500Hz speech formants
   - 20ms RMS frames (matching PCA9685 50Hz PWM rate)
   - AGC normalizes peak amplitude automatically
   - Quantization snaps to N discrete jaw positions (default 10)
   - Attack/release envelope for natural motion
3. **Synchronized Playback** (`playWithJawSync()`): Pre-analyzes complete audio, starts playback and jaw timeline simultaneously with drift-correcting setTimeout scheduling.
4. **Scene Integration**: `sayThis`, `askAI`, and `audio` scene steps auto-sync jaw when enabled.

**Configuration** (`data/character-{N}/super-powers.json`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `true` | Enable jaw animation |
| `servoPartId` | — | Part ID of the jaw servo (from `parts.json`) |
| `sensitivity` | `4` | Amplitude multiplier (higher = more responsive) |
| `smoothing` | `0.2` | EMA smoothing factor (0=max smooth, 1=raw) |
| `volumeThreshold` | `0.02` | Minimum amplitude to register (noise gate) |
| `attackTime` | `30` | Max degrees/frame when opening (ramp limiter) |
| `releaseTime` | `80` | Max degrees/frame when closing (ramp limiter) |
| `minAngle` | `70` | Servo closed position (degrees) |
| `maxAngle` | `93` | Servo open position (degrees) |
| `useBandpassFilter` | `true` | Enable 500-2500Hz speech filter (v2) |
| `useAGC` | `true` | Automatic gain control (v2) |
| `quantizationLevels` | `10` | Discrete jaw positions, 5-20 (v2) |
| `preset` | `speech` | Tuning preset: speech, music, custom (v2) |

**Presets:**
- **Speech**: Filter on, AGC on, 10 positions — optimized for TTS/conversation
- **Music**: Filter off, AGC on, 15 positions — tracks all frequencies
- **Custom**: Manual control of all parameters

**Setup Page:** `http://localhost:3000/setup/jaw-animation`

**API:**
```bash
# Save jaw config for character 3 (v2 fields)
curl -X POST http://localhost:3000/setup/jaw-animation/api/jaw-animation/3 \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"servoPartId":"10","sensitivity":4,"smoothing":0.2,"volumeThreshold":0.02,"attackTime":30,"releaseTime":80,"useBandpassFilter":true,"useAGC":true,"quantizationLevels":10,"preset":"speech"}'

# Drive jaw to specific amplitude (0.0-1.0)
curl -X POST http://localhost:3000/setup/jaw-animation/api/jaw-animation/3/drive \
  -H "Content-Type: application/json" -d '{"amplitude":0.5}'

# Poll real-time audio levels during playback
curl http://localhost:3000/setup/jaw-animation/api/jaw-animation/3/audio-levels

# Test TTS with jaw drive (returns timeline for UI visualization)
curl -X POST http://localhost:3000/setup/jaw-animation/api/jaw-animation/3/test-tts \
  -H "Content-Type: application/json" -d '{"text":"Hello from the animatronic"}'
```

**Key Files:**
- `python_wrappers/servo_daemon.py` — Persistent PCA9685 daemon (all servos)
- `python_wrappers/jaw_servo_daemon.py` — Thin entry point; its name is load-bearing (spawned by `jawServoDaemon.js`, reaped by `singleInstance.js`)
- `services/hardwareService/servoDaemonClient.js` — Node client for the daemon socket
- `services/jawServoDaemon.js` — Daemon lifecycle manager
- `services/jawAnimationSuperPowerService.js` — Pre-analysis, sync playback, config
- `routes/setup/jaw-animation.js` — API routes
- `views/setup/jaw-animation.ejs` — Setup UI with presets and timeline canvas
- `public/js/jaw-animation.js` — Client-side controls (ES5 IIFE)

## Gesture Engine

A thin coordination layer over the existing motion stack — no new motion primitives, no new
hardware. Gestures are **composite and concurrent**: steps fire together offset by `delayMs`,
so the head leads and the body follows. Full design:
[docs/development/GESTURE-ENGINE-SPEC.md](docs/development/GESTURE-ENGINE-SPEC.md).

**Recipes are data** — `data/character-{N}/gestures.json`. A character with no file is a silent
no-op, so config can ship before recipes and recipes before hardware. **Only character 3 ships
recipes today.**

**The loader refuses, at load time and loudly:**
- any recipe with fewer than two moving parts (a single-part gesture reads as a machine);
- a target outside the part's calibrated window;
- any part marked `blockAllMotion` in `config/hardware-safety.json`;
- two parts on one shared power rail whose step windows overlap.

**API:**
```bash
curl -k https://localhost:3000/api/gestures                       # list this character's gestures
curl -k -X POST https://localhost:3000/api/gestures/<id>/perform  # fire one
curl -k -X POST https://localhost:3000/api/gestures/conversation/start   # (…/stop)
```

Motion is fire-and-forget: unknown gestures, missing files, denied priority claims and dead
servos all resolve to a quiet "did not perform" — a reply never waits on a servo.

⚠️ The ElevenLabs client tool that lets an agent *call* a gesture is **staged, not live** —
see `config/elevenlabs/gesture/README.md` for the measurements behind that decision.

**Key files:** `services/gestureEngineService.js`, `routes/api/gestures.js`,
`data/character-{N}/gestures.json`.

## Fleet Audio Ear-Check — proving a speaker was actually heard

A `success: true` from the say/TTS path only means the request was accepted. The ear-check
listens instead: it records each node's **own** microphones with the yard quiet to establish
that mic's noise floor, casts a known phrase through the real say path, measures the speech
envelope against that floor, transcribes with ElevenLabs Scribe, and compares **the voice
actually used** against the canonical voice in the committed agent snapshots.

```bash
node scripts/fleet-audio/earcheck.mjs               # every node in config/animatronics.json
node scripts/fleet-audio/earcheck.mjs --nodes 2,3   # a subset, by animatronic id
node scripts/yard-theater/verify-moment.mjs --moment dusk-ceremony --volume 0.30
```

A node passes only if it rose above its own floor **and** the words came back; a mismatched
voice is a `WRONG-VOICE` failure. It records *every* microphone on a node, because an empty
adapter jack returns a dead-flat floor that reads as a silent speaker. Requires passwordless
SSH to each node and an ElevenLabs key. More:
`scripts/fleet-audio/README.md`, `scripts/yard-theater/README.md`.

## AI Management (ElevenLabs)

All AI voice services run through **ElevenLabs** (single provider, single API key).

### Models
| Service | Model | Use Case |
|---------|-------|----------|
| TTS | `eleven_v3` | Character voice (default, most expressive, supports audio tags) |
| TTS | `eleven_flash_v2_5` | Low-latency alternative (~75ms) |
| TTS | `eleven_multilingual_v2` | Narration / high-quality |
| STT | `scribe_v2` | File-based transcription |
| STT | `scribe_v2_realtime` | Real-time streaming via WebSocket |

**Audio tags are model-aware.** `[whispers]`, `[sings]`, `[Romanian accent]` and friends
are performance directions on `eleven_v3` and are sent through untouched. On any model
that would pronounce them instead of performing them they are stripped before the
request — see `stripAudioTags()` / `textForModel()` in `services/elevenLabsTTSService.js`.

**Not every TTS control reaches a conversation.** Each ElevenLabs agent sets
`overrides.conversation_config_override.tts.*` to false, so `stability`,
`similarity_boost`, `speed`, `voice_id` and `model` bite only on the one-shot say/TTS
path; in conversational mode the agent's own voice settings win.

### Architecture
- **Per-character config**: `data/character-{N}/ai-config/tts-config.json` and `stt-config.json`
- **Three sections**: STT settings, AI Agent (Conversational AI), TTS voice config
- **Microphone**: Server-side via PipeWire (not `getUserMedia`)
- **Audio format**: 16 kHz mono PCM, 20-40 ms frames
- **Conversation**: Real-time WebSocket on port 8795 with barge-in support

### API Quick Test
```bash
# Generate speech with character's configured voice
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from MonsterBox","characterId":3}'

# Check STT capabilities
curl http://localhost:3000/api/elevenlabs/stt/capabilities

# Realtime STT status
curl http://localhost:3000/api/elevenlabs/stt/realtime/status
```

Docs: docs/development/AI-Management-Feature.md, docs/integration/ELEVENLABS_INTEGRATION.md

## Goblin - Video Display System

**Goblin** is MonsterBox's video playback system for Raspberry Pi 3B+/4B units acting as dedicated video displays for Halloween effects and animatronic sequences.

**Architecture:**
- **MPV-based**: Direct video playback using MPV with DRM/KMS output
- **Hardware Decoding**: v4l2m2m-copy for Pi3 hardware acceleration
- **Queue Management**: Video queues with loop modes (single, queue, off)
- **REST API**: HTTP API for remote control and immediate playback
- **MonsterBox Integration**: Full integration with playlist management and Step execution

**Video Format (Standardized):**
- **Resolution**: 720p (1280x720) @ 30fps
- **Codec**: H.264 in MP4 container
- **Directory**: `/home/remote/media/video/` (all Goblins)
- **Playback**: `--video-sync=display-vdrop` for smooth 30fps on 60Hz displays

**Goblin API:**
```bash
# Immediate playback (for Steps - interrupts queue, returns after)
curl -X POST http://GOBLIN_IP:3001/api/video/play-immediate \
  -H "Content-Type: application/json" \
  -d '{"filename":"fireball.mp4","returnToQueue":true}'

# Queue management
curl -X POST http://GOBLIN_IP:3001/queue/add -d '{"filename":"video.mp4"}'
curl -X POST http://GOBLIN_IP:3001/queue/start -d '{"loopMode":"queue"}'
curl -X POST http://GOBLIN_IP:3001/queue/stop

# Video library scanning
curl http://GOBLIN_IP:3001/api/videos/scan

# Status
curl http://GOBLIN_IP:3001/api/status
curl http://GOBLIN_IP:3001/health
```

**MonsterBox Integration:**

*Services:*
- `goblinManagerService` - Registration, monitoring, playback control
- `goblinVideoService` - Video scanning, metadata caching
- `goblinPlaylistService` - Playlist CRUD and deployment

*Features:*
- **Goblin Management UI** (`http://localhost:3000/goblin-management`):
  - Real-time status monitoring for all Goblins
  - Double-click any Goblin card to open video queue modal
  - Browse and search 57+ videos from `/home/remote/media/video`
  - Add videos to queue or play immediately
  - Queue controls: Start, Stop, Clear, Skip
  - Save/Load/Distribute playlists across all Goblins
  - Real-time playback status updates
- Scan video libraries from all Goblins (`/goblin-management/api/goblins/scan-all-videos`)
- Create/edit/delete playlists (UI or API)
- Deploy playlists to one or all Goblins
- Trigger immediate video playback from Steps (e.g., fireball effect during spell-casting)

*Step Integration:*
```javascript
{
  "type": "goblin-video",
  "goblinId": "goblin-three",
  "videoId": "fireball.mp4",
  "returnToQueue": true
}
```

*Pre-configured Playlists:*
- **Spinster**: Character videos for Spinster animatronic
- **Fire**: Fire-themed videos (541-560 series)
- **Poltergeist**: Character videos for Poltergeist animatronic
- **Test**: Sample videos for testing playback

**Deployment:**
Goblin is deployed via "Facehugger" system in Goblin Management:
1. Package Goblin files
2. SCP to target Goblin
3. Install systemd service
4. Start playback automatically

**Current Status:**
- ✅ Goblin3 (192.168.8.14) - Operational, tested immediate playback
- ⏳ Goblin1 (192.168.8.40) - Pending deployment
- ⏳ Goblin2 (192.168.8.106) - Offline

See: `goblin/`, `docs/integration/GOBLIN_VIDEO_INTEGRATION.md`

## Network and Roles (MonsterNet)

Static IPs below are a **fallback**; nodes discover each other's live addresses over mDNS
(`_monsterbox._tcp`). Status and version as observed at the end of the v9.2.0 session
(2026-08-16) — re-check with `npm run check:discovery` and
`curl -sk https://<node>:3000/health`.

**Animatronics:**

| Character | ID | Address | Status (2026-08-16) | Version |
|---|---|---|---|---|
| PumpkinHead | 1 | 192.168.8.150 | 🔴 Offline all session — **unverified** | unknown |
| Mina | 2 | 192.168.8.140 | 🟢 Online — AUDIBLE by ear (12.4 dB rise, 80% recall, canonical voice) | 9.2.0 |
| Orlok | 3 | 192.168.8.120 | 🟢 Online, primary dev node — AUDIBLE (20.1 dB, 100% recall) | 9.2.0 |
| Sir Dragomir | 4 | 192.168.8.130 | 🟢 Online — AUDIBLE (33.3 dB, canonical voice confirmed) | 9.2.0 |
| Groundbreaker | 5 | 192.168.8.200 | 🔴 Offline all session — **unverified** | unknown |
| Renfield | 6 | *(none — `ip: null` by design)* | 🔴 Never networked — **unverified** | n/a |

Sir Dragomir carries 3 PCA9685 servos — head ch0 (continuous), jaw ch1, magic box ch3 —
plus webcam, mic, speaker. (`parts.json` is the source of truth for channels; older docs
claiming jaw ch0 / magic box ch8 / head ch4 were wrong.) Groundbreaker's former
`characterId` mismatch (7 vs 5) was reconciled 2026-08-17 — the registry is a clean 1–6
([KNOWN-BUGS](docs/troubleshooting/KNOWN-BUGS.md)).

**Goblins (Video Display):**
- Goblin One: 192.168.8.40:3001 ⏳ Pending deployment
- Goblin Two: 192.168.8.106:3001 ⏳ Offline
- Goblin Three: 192.168.8.14:3001 ✅ Operational

SSH for RPi4B: see docs/security/remote-access.md

## Testing

MonsterBox has comprehensive test coverage across system, unit, and browser tests.

### Test Results (v8.4.0 - July 2026)

| Suite | Framework | Passing | Pending | Failing |
|-------|-----------|---------|---------|---------|
| Unit | Mocha | 168 | 35 | 0 |
| System | Mocha | 339 | 12 | 1† |
| Browser — all-pages health | Playwright | 24 | 0 | 0 |

Green except for one hardware-only case. Pending tests are hardware/character-conditional
skips (no GPIO, no ffmpeg/mic, or a character without the relevant part in the dev container).

† The single system failure is the `audio-setup` dry-run capture test, which needs a
physical microphone not present in CI/dev containers. `npm audit` reports 0 vulnerabilities.

```bash
# Pre-deploy gate — runs automatically via .git/hooks/pre-push and in CI
npm run gate                # schemas + resolver + independence + smoke + pact (~30s RPi4B)

# Run all tests
npm test

# Individual suites
npm run test:system         # Mocha system tests
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser tests — see caveat below
npm run test:hardware       # Hardware tests (needs real GPIO)
npm run test:pact           # Per-character contract suite (iterates every character)
npm run test:pact:character -- --char 3   # Same, scoped to one character
npm run verify              # system + unit + browser

# The browser suite against the ALREADY-RUNNING server (this is the one that works
# on a node). `npm run test:browser` starts its own server on port 3200, trips
# server.js's single-instance PID guard, and Playwright reports a CONFIG failure that
# reads exactly like a test failure. Port 3100 serves the full app and is always up.
MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 \
  npx playwright test tests/browser --reporter=list
# NOTE: port 3100 runs with MB_TEST_MODE unset, so a test that hits a hardware
# endpoint drives REAL hardware unless it passes dryRun. ~54 min on an RPi4B.

# Ratchets (also wrapped by `npm run gate`)
npm run validate:schemas    # Per-character data files vs config/schemas/
npm run audit:resolver      # No direct character-state reads outside services/characterContext.js
npm run audit:independence  # No bias violations outside tests/baseline/character-independence-allowlist.json
```

### Testing philosophy
Per-character contract tests (the pact suite) run the same assertions against every character registered in `data/characters.json`. Adding a 6th character automatically adds every assertion in the suite — no new test code required. Character-specific tests in `tests/system/` and `tests/browser/` catch runtime behavior the pact can't reach; together they form the safety net that the gate enforces on every commit.

## Troubleshooting Quick Commands
```bash
# App logs (systemd)
journalctl -u monsterbox -f

# Port conflicts
sudo lsof -i :3000 || sudo fuser -k 3000/tcp

# GPIO sanity
python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); print('GPIO OK')"
```

## Documentation Index

### Core
- [CHANGELOG.md](CHANGELOG.md) — Release history
- [Deployment Guide](docs/deployment/README.md) — Systemd, SSH, production setup

### AI & Audio
- [ElevenLabs Integration](docs/integration/ELEVENLABS_INTEGRATION.md) — Architecture, services, per-character config
- [AI Management Feature](docs/development/AI-Management-Feature.md) — UI, models, agent setup
- [AI Integration Guide](docs/development/ai-integration-guide.md) — Developer reference

### Hardware
- [Hardware Integration](docs/integration/Hardware-Integration-Layer-Interfaces.md) — Service layer, adapters
- [GPIO Assignments](docs/hardware/gpio_assignments.md) — Pin mappings
- [Legacy Hardware Config](docs/hardware/legacy_hardware_config_reference.md) — Historical reference

### Setup & Calibration
- [Animatronic Setup Guide](docs/setup/ANIMATRONIC-SETUP-GUIDE.md) — Full setup walkthrough
- [Linear Actuator Calibration](docs/setup/LINEAR_ACTUATOR_CALIBRATION.md) — Calibration procedure
- [STT Tuning Guide](docs/setup/STT_TUNING_GUIDE.md) — Speech-to-text optimization

### Characters
- [Groundbreaker Setup](docs/characters/GROUNDBREAKER_SETUP_INSTRUCTIONS.md)
- [PumpkinHead Parts](docs/characters/PUMPKINHEAD_COMPLETE_PARTS_LIST.md)

### Goblin Video System
- [Goblin Video Integration](docs/integration/GOBLIN_VIDEO_INTEGRATION.md) — Deployment, API, playlists

### Testing
- [Testing Overview](docs/testing/index.md) — All test categories
- [Test Organization](docs/testing/organization.md) — Directory structure
- [Deep Testing Framework](docs/testing/DEEP-TESTING-FRAMEWORK-SUMMARY.md) — Playwright framework

### Security
- [Remote Access](docs/security/remote-access.md) — SSH, access control
- [Authentication](docs/security/authentication.md) — Auth mechanisms


## Historical Hardware Reference
For debugging connection issues or restoring older hardware configurations, see: [docs/hardware/legacy_hardware_config_reference.md](docs/hardware/legacy_hardware_config_reference.md).
