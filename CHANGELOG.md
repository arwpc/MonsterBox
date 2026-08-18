# Changelog

All notable changes to MonsterBox are documented in this file.

## [10.0.0] - 2026-08-18 — The Scare Console, and one skin over the whole platform

A major release because the page you open every day is a different, better thing.
The work spans three sessions; two of them died mid-flight to API errors and were
resurrected from the working tree, which is why the history reads in salvage waves.

### The dashboard becomes a console you can actually run a show from

`/` now serves the **Scare Console** (`views/conversation/showtime.ejs`): a stage
with the live camera, overlay superpower chips, Listen and VU; a **one-tap deck**
beside it; a **say bar** for the monster's voice; and a drawer for the long tail.
The old accordion dashboard — where finding a control meant hunting through
collapsed panels — survives at `/dashboard/classic` as the fallback. `/live` was
absorbed and redirects to `/`. Every legacy element id was deliberately preserved,
so `public/js/dashboard.js` binds to the new page without a single change.

- **The AI conversation is now the fourth deck tab**, beside Scenes, Poses and
  Sounds. Reading what the character said, and saying something back, used to be
  folded into a collapsed drawer at the bottom of the page — the one surface where
  the character talks back was the hardest thing on the console to find. The chat
  log, speaker routing and browser-mic toggles were *moved*, not copied; the say
  bar stays the composer, because one input bound to one socket cannot drift.
- **The stage is capped so the say bar clears the fixed control bar.** On a
  1280×800 laptop the monster's voice sat *behind* the chrome at first paint. The
  reclaimed width goes to the deck, which is the surface an operator drives.
- **The telemetry strip was decoration and is now instrumentation.** Five spans
  under the stage — version, RSS, servo latency, uptime, agent socket — had no
  code populating them and would have shown em dashes forever. They now read from
  endpoints that already existed. An unread value stays an em dash and an unmoved
  servo says `idle`, because a confident wrong number is worse than an honest gap.
- **All six superpower toggles hold one row** instead of covering a quarter of the
  camera view: desktop names them in words, the phone keeps icons and swipes.

### Tactile Obsidian — one house skin, all 27 pages

Serif is the monster's voice (dialogue, spoken lines, character prose). Mono is
machine truth (telemetry, ids, pins, channels, addresses). **Amber means
happening-now and nothing else**; poison green means armed; blood means danger.
Wired through a single `<link>` in `master.ejs`, which is also the rollback story.

The sweep corrected two places where the vocabulary contradicted itself: the jaw
page's live dot used **blood red** while TTS was merely playing, and the audio
page's Listen In / Talk Through badges read **poison green "armed"** while audio
was genuinely streaming. Danger is not liveness; armed is not happening-now.
`/setup/style-guide` now teaches the three commitments with live examples, so the
next contributor doesn't have to reverse-engineer them. 24 tooltips were added,
all on JS-generated controls the earlier tooltip waves could not see.

### Motion arbitration: two ways a servo could be stolen or stranded

- **A pose could free another pose's servo mid-transition.** Every random-pose
  execution claimed under one shared owner string, so when two overlapped — a
  manual trigger racing a TTS-driven pose, or poses closer together than their own
  transition time — the first to finish released the *second's* live claim. The
  servo fell back to the idle loop, which commanded a conflicting angle: exactly
  the snap-back jerk the arbitration was written to prevent. Each execution now
  mints its own owner, so a stale release is refused.
- **Stopping the camera froze the pan servo.** Head tracking claimed the pan servo
  at enable but released it only on the disable paths. Stopping motion tracking
  killed the tracker while leaving the claim held with no frames arriving to drive
  or release it — the servo was locked out of all idle and ambient motion, logging
  `DENIED` every cycle, until head tracking was toggled off or the service
  restarted.

### Correctness

- **Two calibration pages served live 500s.** `/setup/calibration/linear_actuator/:id`
  and `/setup/calibration/standard_servo/:id` rendered EJS views that do not exist
  on disk. Both now redirect to the unified calibration page, carrying `partId` and
  any incoming `characterId`.
- **Tuned voice configs stopped growing phantom fields.** The AI-settings save
  force-injected `style` and `use_speaker_boost` even under `eleven_v3`, where the
  UI disables both — so any save merged default-valued keys into a hand-tuned file.
  Playback was *proven* innocent: a live generate left `tts-config.json`
  byte-identical, mtime unmoved.
- **Both hardware calibration suites were rewritten** against the real unified
  `/api/calibration` contract they had drifted from. Every motion endpoint is
  exercised only through its refusal path: a bare `npm run test:hardware` moves
  nothing (46 passing, 3 pending).
- **Browser specs follow the console.** Specs were clicking drawer targets that no
  longer exist and asserting visibility on containers v10 moved into the hidden
  compat div — tests that could no longer fail. Coverage now points at the real
  operator surface.

### Known gaps recorded rather than papered over

The Learn Movement panel on the unified calibration page simulates its Run button
while Save persists the typed values as if measured; two dashboard list renders
interpolate names into `innerHTML` unescaped; `esc()` misses quotes in three
attribute interpolations; the PIR watcher can respawn without ever falling back,
and a wedged watcher is indistinguishable from a quiet room. All are in
`docs/troubleshooting/KNOWN-BUGS.md` with fix directions.

Also written down for the first time: **the browser suite cannot run while the
service is up** (the PID lock has no test-mode exemption) and **most specs need
`BASE_URL` pointed at port 3200**, or every navigation fails.

## [9.3.0 post-release] - 2026-08-17 — fleet health pass

### Every character's voice, measured against its persona

Using the acoustic loop proven on Orlok (median F0, sub-150 Hz rumble, drawl rate,
pause fraction — scored against each persona's targets, with a keep-bias toward the
hand-picked voices):

- **Orlok** — the "Count Orlok, Nosferatu" professional voice confirmed as the single
  best match in the entire Voice Library (4-term sweep returns only it); tuned to
  stability 0.25 / similarity 0.6 (65.6 Hz median — a true octave-dropped chest
  voice). Ear-verified 39.3 dB / 100% recall.
- **Mina** — "The Siren's Voicemail" kept (a seduction-built voice for the heart of the
  story); stability 0.35→0.30 measured warmer with more beckoning pause; speed 0.87
  on the agent path. Ear-verified 31.8 dB / 80% recall, canonical.
- **Sir Dragomir** — "Dante" kept for the century-old knight; stability 0.5 / speed 0.9
  measured lower (113.5 Hz), rumblier, more deliberate. Ear-verified 20.6 dB / 94%.
- **PumpkinHead** — "Toby - Little Mythical Monster" kept for the screeching graveyard
  lure; stability 0.25 widens the shriek-to-creak swing (p10 58.8 ↔ medF0 160 across
  test lines). Not ear-verified — node offline.
- **Groundbreaker** — "Malyx - Deep Demon" VERIFIED as a genuine persona fit (78 Hz
  median, deepest and slowest of everything scored — not a wrong-voice-bug bandaid);
  stability 0.45 / speed 0.9 for the consistent boom. Not ear-verified — node offline.
- **Renfield** — "Chris - irritable boss" kept; stability 0.30 widens the
  lucid-vs-shattered register swing his prompt is written for. Not ear-verified —
  node never networked.

No voice swaps anywhere — every hand-picked identity survived a measured library
challenge. Settings-only changes, applied to `tts-config.json` per character.

### Canonical speaker volume is applied at service start

`server.js` reads this node's `sinkVolume` from `config/animatronics.json` at every
start (with retries across the boot race) — reboots and test suites kept resetting
`wpctl` to wrong levels with the right number recorded nowhere. Verified: volume
sabotaged to 0.40, service restart healed it to 0.90 with a log line.

### Log review is now a standing practice

- **`scripts/log-review.mjs`** (`npm run log:review`) — collects fresh error signal
  from a node: failed units, kernel power/USB events, new app-log errors since last
  review, startup-health warnings, voice-config drift vs committed canonical, sink
  volume vs canonical, mute state, journal flooding, git drift. `--fleet` walks
  **every** animatronic in `config/animatronics.json` (whoever is live that day —
  no hostname is special-cased), reports OFFLINE nodes honestly, flags mixed
  versions, and deep-sweeps reachable nodes over SSH when credentials are present.
- **`/log-review` skill** — the AI-side triage: reconcile findings against
  `docs/troubleshooting/KNOWN-BUGS.md` (known / tracker-wrong / new / noise-to-kill)
  and commit the tracker update. Part of session startup.
- **Every 10 commits**: `scripts/git-hooks/post-commit` runs the quick collector
  automatically. `install-git-hooks.sh` now installs both hooks (this node was
  missing even the pre-push gate).
- **Canonical sink volumes live in `config/animatronics.json`** (`sinkVolume`) —
  they were operator lore that evaporated on every reboot/test run.
- **`install.sh` now applies the full node OS baseline** (avahi file ownership,
  journald persistent+64M, logrotate, service priority/secrets drop-ins) so any
  reimaged or newly-built animatronic gets 2026-08-17's fixes automatically.
- **Found by the first collector runs:** Mina's boot readiness check probed
  `http://` against the HTTPS server (it had NEVER passed — fixed); three orphaned
  `mcp-*` user units crash-looping ~8k journal lines per boot on Mina and Orlok
  (disabled); the test suite's fleet-write leak through the production `:3100`
  listener confirmed live (tracked 🔴 in KNOWN-BUGS).


- **The startup servoChannels audit ran before the hostname→character correction**
  (`645ac407`), so a node that booted with a stale `selectedCharacter` audited another
  character's channel map and persisted false warnings to `startup-health.json`. Observed
  live: Sir Dragomir booted carrying `selectedCharacter: 3`, warned about Orlok's fused
  rail, and flagged his own jaw servo as an unmapped channel. The check now runs after the
  correction. (How the stale value reached his disk is a separate open item — see
  KNOWN-BUGS, "post-reboot health pass".)
- **OS-level cleanup on all three live nodes** (not in git; recorded in KNOWN-BUGS): avahi
  service-file ownership (ends the every-boot EACCES), Sematext agents disabled on Orlok
  (143k journal lines/boot), journald persistent + capped 64M fleet-wide, logrotate for the
  app logs, Mina's missing priority/secrets drop-ins, Mina's boot-check unblocked, stray
  `goblin.service` disabled. Orlok's webcam moved to a stable `/dev/v4l/by-id/` path at
  15 fps after an over-current burst re-enumerated it mid-day.

## [9.3.0] - 2026-08-16 — Mina's servos were never broken, and calibration finally lets you calibrate

*Started as 9.2.1 (the first seven commits carry that label); released as 9.3.0 — the
supervised-calibration override is a behavioural addition, not a patch.*

An evening session on the Mina node, driven by one complaint: "the neck and eye servos
rarely work, the jaw barely moves, and everything gets slower the more I use it." All of it
was software. A multi-agent audit (5 finders, adversarial verification) then swept every
calibration path, VU meter, and superpower for the same defect families and fixed what it
confirmed.

### Fixed — why Mina's servos looked dead

- **Every UI servo command silently became "go to 50°".** `POST /api/parts/:id/test` read
  only `{position}`, but the Pose Editor and calibration pages send
  `{action:'moveToAngle', params:{angleDeg}}` — the angle fell through to the default and
  the response still said success. Proven live: asked for 150°, servo went to 50°. The
  route now honors every caller shape, dispatches motor `stop` as a stop (it used to DRIVE
  the motor forward at 100% for a second), reads an actuator direction sent as the action
  (Retract used to extend), and refuses a servo test with no angle at all.
- **The Neck was frozen by its own calibration**: `{minAngle:108, maxAngle:108}`, captured
  by pressing Set Min and Set Max while the servo (per the bug above) never moved. Every
  command clamped to 108°. `isDegenerateWindow()` now refuses zero-span windows (angle and
  normalized shapes, non-finite values) at every bounds writer — set-min/set-max, the raw
  profile POST, parts.json marker writes, the jaw page's Min/Max quick-adjust — and the
  store's read path withholds such a window from anything that moves hardware.
- **The progressive slowdown was leaked VU-meter polling** on the calibration page: every
  part selection stacked another 150 ms loop, each poll spawning a ~350 ms Python+ALSA
  process, forever. The audit found and fixed the whole family: the motion-sensor GPIO
  poll, the audio page's per-mic meters (7 mic parts ≈ 15 spawns/sec, unstoppable from the
  UI), the System Logs tab (journalctl + 2×tail every 5 s after leaving the tab), and an
  orphaned OpenCV motion tracker that kept a core busy and the head scan-sweeping after
  switching parts. The `/api/audio-levels` cache was also inert (entries born older than
  their own TTL) — it now actually coalesces.

### Fixed — controls that reported success while doing nothing (or the opposite)

- The calibration page's continuous-servo **Stop** posted a delta-0 nudge that
  short-circuited "Already at target" — the servo kept turning. **EMERGENCY STOP** posted
  to a route that does not exist and toasted success on the 404s. Both now hit the real
  stop endpoint and report honestly.
- `AbsoluteServoAdapter` swallowed hardware refusals, minting phantom positions that
  Set-Min/Set-Max then persisted as bounds the servo never visited. `jog-raw` reported
  "Done" for quarantined parts, discarding the safety refusal written specifically for it.
  Head-animation Test Sweep swept placeholder 0-180 "calibration" on unmeasured servos and
  reported "Sweep completed" regardless of results — it now refuses without a measured
  range and reports per-step failures.
- Pose-Editor lights tested fine and then never fired in playback (editor writes
  `state:'on'`, controller only knows `turnOn`) — now mapped. Random-pose "safety" scaling
  pulled angles toward a literal 90°, which for Mina's 22..91 jaw turned a near-closed pose
  into nearly wide open — now scales toward each part's own calibrated midpoint.

### Fixed — character independence in the hot paths

- Head tracking pins its character at enable time and passes `characterId` on every
  hardware call and calibration lookup (a mid-session selection change produced 10,409
  "Part 2 not found" errors in one night while hammering a dead channel — there is now a
  5-failure/60 s back-off). Scene execution threads `characterId` through all six
  `controlPart` sites; the jaw service's calibration lookups are character-scoped.

### Fixed — hygiene from the overnight log triage

- ElevenLabs services no longer print the `xi-api-key` header into the world-readable
  service log on API errors; the WS session cleanup can't crash the process on a malformed
  `startTime`; goblin reconnect spam (63% of an 8.5 MB nightly log) is throttled;
  `pactl`-less nodes now get default sink/source via `wpctl`; start-all no longer dials
  Renfield's deliberately-null address.

### Added — supervised calibration override

- The operator could not calibrate: the safety window (which encodes the *previous*
  measurement, or a guess) clamped every attempt to measure past it — "stops me at 120°
  when I want to go to 197°" — and homing was stopped short of the endstop by the duration
  cap, then recorded as homed anyway (`OpenLoopLinearAdapter.home` ignored refusals
  entirely). The calibration surfaces (nudge, home, jog-raw, and the calibration page's
  manual angle control via `goto {calibrationOverride:true}`) now relax the angle window
  and duration cap, loudly. **Never relaxed, override or not:** `blockAllMotion`
  quarantines, `noRetractBelowMin`, speed caps, and fused-rail power-group serialization.
  Automated sweeps, preset recalls, Monster Builder, scenes, poses and superpowers stay
  fully clamped. Six unit tests pin the semantics.
- Fleet deploys now exclude node-local operational state (`calibration_profiles.json`,
  actuator positions, super-powers/lurk state, `app-config.json`) — a deploy brings code,
  never another machine's measurements.

### Voice

- Orlok's Gemini vocal-profile research (preserved at
  `docs/development/Count_Orlok_Vocal_Profile.pdf`) is fully applied: octave-dropped
  chest-voice description in the persona prompt, stability 0.3 on both the agent and
  say/scene paths. Ear-checked live: AUDIBLE, canonical voice, 100% recall.

> ⚠️ Mina's Neck/Eye still need **one visual confirmation** that the (now-correct) register
> sweeps produce physical motion. ⚠️ Sir Dragomir dropped off the network mid-evening —
> physical check needed; he has not received this release.

## [9.2.0] - 2026-08-16 — The right voice, a body that moves together, and a show that reaches the yard

*Includes **9.1.0**, which was opened during the same overnight session and superseded before
it shipped; it has no separate entry. Halloween-night release.*

For the operator, three things changed. **Your characters now speak in their own voices** —
four of the six were speaking in someone else's on the say/scene path, and the fleet had no
way to notice because a character speaking clearly in a stranger's voice passes every
level-and-transcript check ever run against it. **The body now moves as one figure instead of
one joint at a time** — servos can finally move together, and a new gesture engine drives
them from the conversation. **And the show was proven to reach the yard**, by recording each
animatronic with its own microphone while it performed and reading the words back.

> ⚠️ **Three of six nodes were offline for this entire session and are unverified.**
> PumpkinHead (char 1) and Groundbreaker (char 5) never answered; Renfield (char 6) has never
> been on the network at all. Nothing in this release has been exercised on their hardware.
>
> ⚠️ **This release only takes effect on nodes that receive the deploy.** At the close of the
> session **Orlok, Mina and Sir Dragomir all report 9.2.0** and serve HTTPS 200; the other
> three are unreachable and have received nothing. The voice fix was confirmed end to end
> exactly this way: the ear-check caught Sir Dragomir still speaking in his **retired** voice
> (`SOYHLrjzK2X1ezoPC6cr`) because the fix had not yet reached his Pi; after deploying, he came
> back **AUDIBLE in his canonical voice** (`wXvR48IpOq9HACltTmt7`), checked against the
> committed agent snapshot.
>
> ⚠️ **The speaker rigs are not level-matched, and a daylight balancing pass is outstanding.**
> Sir Dragomir carries across a room at sink volume **0.30**; Mina and Orlok (both Unitek
> Y-247A adapters) are inaudible below **~0.5**. Mina scored `GARBLED` at her 0.65 default and
> only became `AUDIBLE` at 0.90. `wpctl` volume is node-local and is not deployed.
>
> Unless stated otherwise, "measured" below means measured on the Orlok node.

### Fixed — voice and audio

- **Four of six characters spoke in the wrong voice** on the say/scene path (v9.1.0).
  `services/aiConfigStore.js` carried a hardcoded per-character voice map that never tracked
  the agent-side voice changes: **PumpkinHead spoke in Sir Dragomir's voice**, Sir Dragomir in
  a voice retired from his agent, and **Renfield and Groundbreaker both spoke as Orlok** (no
  map entry → global fallback; Groundbreaker also registered under characterId 7 against a map
  keyed 5). Only Mina and Orlok were correct. An earlier fix had written camelCase `voiceId`
  into the character configs while every reader uses snake_case `voice_id`, so it was dead on
  arrival and the wrong voices shipped anyway. Voice identity is **now data**: each
  character's voice, speed, stability and similarity are synced into
  `data/character-{id}/ai-config/tts-config.json` from the committed agent snapshots in
  `config/elevenlabs/agents/`, and the map is gone. A character with no configured voice now
  warns once instead of silently impersonating someone else.
- **Saving anything on the AI settings page deleted the selected character's voice.**
  `saveTTSConfig` wrote the request body straight over the config file, and that page exposes
  only model/stability/similarity — so every save dropped `voice_id` and `speed`, the two
  fields that are the character's *identity* rather than tunables, and the character carried on
  in the shared fallback voice with nothing logged. Caught live when a browser-test pass
  stripped a character's voice mid-run. **Saves now merge** — only fields the caller actually
  sent are changed. The same partial-save bug was silently dropping `microphonePartId` on the
  STT side.
- **Every audio step in every Yard Theater moment was a guaranteed no-op.**
  `POST /api/orchestration/animatronic/:id/play-audio` requires an `audioId` and 400s without
  one; `perform.mjs` only ever sent `filename`. Both Thomas moments are audio-only, so **the
  Thomas moment would have been silent on Halloween.** Filenames now resolve to that node's own
  `audioId` (ids are per-node), and a file missing from a node's library is skipped with a
  warning instead of failing the show.
- **`thomas-whisper.mp3` was in no node's audio library at all** — the file sat in
  `data/audio-library/` but never in `files/` and was absent from `library.json`, so every
  play-audio call for it resolved to nothing. Now registered with real probed metadata and
  confirmed present in a node's library. (`dusk-theme.mp3` is still missing **on purpose** —
  the moment documents it as an optional music bed that skips gracefully.)

### Added — the ear-check: proof that a speaker was actually heard

- **`scripts/fleet-audio/earcheck.mjs`** — the instrumented cast test. It records each node's
  **own** microphones with the yard quiet to establish that mic's noise floor, casts a known
  in-character phrase through the real say/TTS path, measures the speech envelope against that
  floor, transcribes with ElevenLabs Scribe, and scores word recall. A node passes only if it
  rose above its own floor **and** the words came back.
  - **Result, with all three live nodes on 9.2.0: Orlok, Mina and Sir Dragomir all AUDIBLE** —
    Orlok 20.1 dB rise / 100% word recall, Sir Dragomir 33.3 dB / 69% with his **canonical
    voice confirmed**, Mina 12.4 dB / 80% with **canonical voice confirmed**. PumpkinHead,
    Groundbreaker and Renfield were **untestable** (`OFFLINE`), not passing.
  - **The default capture window was widened 9 s → 13 s.** A slow-speaking character's line
    runs past 11 s, and a short window clipped the tail and scored a perfectly good node
    `GARBLED` — measured on one node, same configuration: **53% word recall at 9 s vs 80% at
    15 s.**
  - **Mina was `GARBLED` purely because her speaker was too quiet** (10.2 dB rise, 47% recall at
    sink 0.65) and became `AUDIBLE` at 0.90 — the rigs are not matched, and a single fleet-wide
    volume does not mean the same thing on each node.
  - It records **every** microphone, because one node's USB adapter jack is empty and returns a
    dead-flat floor — which reads as a silent speaker when it is really an unplugged mic.
  - It now also checks **which voice was actually used** against the canonical voice in the
    committed agent snapshots, and fails the run on a mismatch (`WRONG-VOICE`). Audible was
    never the same as right; that gap is exactly why four wrong voices went unnoticed.
- **`scripts/yard-theater/verify-moment.mjs`** — the same two gates applied to a whole show
  instead of one phrase. `perform.mjs` returning 200 only ever proved the orchestration API
  accepted the call. **The Dusk Ceremony now verified end to end on real speakers** at reduced
  volume, each node confirmed by its own microphone and Scribe: Mina 6.5 dB / 100% recall,
  Orlok 11.3 dB / 100%, Sir Dragomir 13.0 dB / 92% — all `HEARD`.
  `--volume` records each node's sink volume, sets a rehearsal level and restores it in a
  `finally`, so a ceremony can be rehearsed at 3am without waking the street.
- **The level gate was window-length dependent** and is fixed: one 8 s line inside a 96 s
  capture is ~8% of frames, so a p90 landed in the silence and a node Scribe read back at 100%
  recall still scored `SILENT`. Scoring the **loudest ~4 s** means the same thing at any window
  length. `--volume-map` sets a per-node rehearsal level, because the rigs are not matched —
  Sir Dragomir carries across the room at sink 0.30 while Mina and Orlok (both Unitek Y-247A
  adapters) are inaudible below ~0.5.

### Fixed — servos could not move together (the headline)

- **Root-caused: every servo command re-initialised the PCA9685 and blanked all sixteen
  channels.** Each command was a new process, every new process called `pca9685_init`, and
  init unconditionally ran reset/SLEEP/prescale/wake. Writing the prescaler **requires MODE1
  SLEEP, which stops the oscillator** — so every single servo move dropped PWM on every other
  channel for the length of that write. This is the long-documented "head twitches to 60° and
  120°".
  - **Measured, 24 one-shot commands aimed at an unconnected channel while sampling the head
    channel: before 11 MODE1 SLEEP events and 53 no-pulse reads → after 0 and 0** (with the
    daemon down, i.e. the direct path alone).
  - `pca9685_init` is now **non-destructive**: the chip is probed and adopted as-is if it is
    already awake at the right prescale, so the full sequence runs once per power cycle instead
    of once per command.
  - Channel writes are now **one atomic 4-byte block write**. Four separate byte writes let a
    concurrent writer interleave, producing a pulse width nobody asked for — and two concurrent
    `servo_cli.py` processes on one channel was an observed configuration, not a theory.
- **Added: a persistent servo daemon that owns the I²C bus** —
  `python_wrappers/servo_daemon.py` plus `services/hardwareService/servoDaemonClient.js`. It
  generalises the jaw daemon (the one servo path that never glitched the others, precisely
  because it was persistent) into a single long-lived owner of the bus, serving both a Unix
  socket (`$MB_SERVO_SOCKET`, default `/tmp/monsterbox-servo.sock`) and the original
  stdin/stdout jaw protocol byte-for-byte, so `services/jawServoDaemon.js` needs no change.
  `batchMoveServos` and single-part PCA `moveToAngle` route through it, each keeping the
  `servo_cli.py` spawn as a fallback — **a missing daemon degrades to the old behaviour rather
  than dropping the command.**
  - **Measured: two servos written <1 ms apart** (all 8 stepped transitions on both channels
    landed inside one sampler iteration), a two-channel 50 Hz ramp **sustained 49.9 Hz**, and a
    **p50 round trip of 3.37 ms against 200–580 ms per process spawn** before.
  - **Safety is unchanged and still decided in Node before dispatch.** `applySafetyLimits()`
    runs first exactly as before; the resulting window is passed down so the daemon can only
    **narrow**, never widen; power-grouped parts still do **not** join a batch — Orlok's elbow
    and forearm share a fuse that has blown before and stay serialized with their cooldown.
    Shutdown deliberately leaves servos holding position; releasing everything would drop the
    head under gravity.
  - The socket file is now removed on clean shutdown (it is a daemon thread, so the process
    could exit first and leave callers paying a refused connection before falling back).
- **Added: `--mode1` and `--keep-invalid` to the read-only I²C sampler**, which is what made the
  glitch visible at all — the LED registers keep their values through a re-init, so only
  counting MODE1 SLEEP entries is register-level evidence of a cross-channel drop. Measured
  against the live service before the fix: **5 SLEEP entries and 26 no-pulse reads on the head
  channel in 3 seconds of ordinary idle-loop motion.**

### Added — conversation-driven gesture engine (v9.1.0)

Implements `docs/development/GESTURE-ENGINE-SPEC.md`: a thin coordination layer over the
existing motion stack — **no new motion primitives, no new hardware, no new dependencies**.
`services/gestureEngineService.js`, recipes as data in `data/character-{id}/gestures.json`,
API at `routes/api/gestures.js` (`GET /api/gestures`, `POST /api/gestures/:gestureId/perform`,
`POST /api/gestures/conversation/:action`). Execution goes through `priorityManager` for
arbitration and `transitionEngine` for easing, with three new priority layers (AMBIENT 40,
GESTURE_STATE 85, GESTURE_SEMANTIC 90).

- **Concurrency is the point.** Steps run concurrently, offset by `delayMs`, so the head leads
  and the body follows. The loader **refuses any recipe with fewer than two moving parts** —
  sequential single-part motion is impossible to express by accident.
- **Safety is enforced at load time, loudly**, not silently reinterpreted at run time. The
  loader rejects targets outside a part's calibrated window, any part marked `blockAllMotion`,
  and **two parts on one shared power rail whose step windows overlap** — while accepting the
  same pair correctly staggered. The hardware layer would serialize a shared rail anyway, but
  doing so at run time would destroy the timing the author intended, so the recipe is refused.
- **The conversation is bulletproof against the body.** Motion is fire-and-forget: unknown
  gestures, missing files, malformed JSON, denied claims and dead servos all resolve to a quiet
  "did not perform", and the handler answers the agent immediately without ever awaiting a
  servo.
- **Verified on real hardware** by sampling the PCA9685 registers while firing a gesture:
  **head 98.8° → 119.6° and forearm 103.9° → 109.9° within one gesture**, 478 samples per
  channel, **0 rejected reads and 0 MODE1 SLEEP events** — two servos moving together with no
  chip re-initialisation, which is what the daemon work was for.
- **Fixed during that verification: light steps never fired.** `setLight` called a
  `controlLight()`/`setLight()` pair that does not exist on the hardware service; light parts
  take `turnOn`/`turnOff` through `controlPart`. Since most recipes pair a servo with a light,
  every gesture was quietly reduced to the single-part motion the design exists to refuse. A
  gesture now reports 3/3 steps where it reported 2/3.
- **Only one character ships a vocabulary, by design rather than oversight.** The engine
  refuses raw angle targets for parts with **no calibrated bounds**, and the other characters
  have not yet had the pose/calibration pass the spec's §9.1 describes — so they have no
  `gestures.json`, which is a silent no-op. The shipped set is authored against the parts that
  actually work on that node: the bow-at-waist and elbow are safety-blocked, so its bow gestures
  are expressed as head bows. 20 unit tests (`tests/unit/gesture-engine.test.js`), four of which
  assert the **shipped** recipes pass every safety rule against real config.

### Security and safety

- **A browser test fired a REAL fleet emergency stop, twice.** A stale route interceptor sent a
  genuine `POST /api/panic {fleet:true}` during a suite run, which **disarmed superpowers
  across every reachable node**; Sir Dragomir's jaw animation was found switched off afterwards
  and was restored. Nothing in the run reported it — it surfaced only by diffing the nodes.
  Route-level `MB_TEST_MODE` guards existed but had **missed `/api/panic` entirely**, and
  `orchestrationService` had none at all. The guard now sits on
  **`orchestrationService.httpNode`, the single egress point every inter-node call passes
  through**, so no route, script or future test can go around it. **Reads are still allowed**
  deliberately (blocking them would push tests toward mocking the code under test); **writes
  are refused and reported as refused.**
- **Character-independence bug: `sceneExecutor` looked up calibration profiles without a
  `characterId`.** Part IDs are unique only *within* a character, so the lookup fell back to
  whichever character the **node** has selected — **clamping one character's motor step from
  2000 ms to 0 ms using another character's calibration.** Previewing any character's scenes on
  a shared node was affected. `characterId` is now threaded through all four lookups and the
  three preset resolvers.
- **The night-memory PHI scrubber was rebuilt as an allow-list.** The registry is built from
  real conversations with real children, and the old scrubber was a deny-list — it removed the
  shapes someone had thought of. **An adversarial corpus of 36 cases broke it 23 times**, worst
  of all structurally: "collapse a capitalized pair unless *either* word is canon" left
  **"Emily Rodriguez" completely intact**, because Emily is a canon name. It had also never
  seen O'Brien, McDonald, hyphenated or three-part names, ALLCAPS, lowercase transcripts, ages,
  schools, handles, links, dates, or an unnumbered street. Now: **any** run of two or more
  consecutive capitalized tokens collapses to its first token unless the whole run is an
  explicit canon phrase — so surnames nobody has ever seen are removed too. A token-wise canon
  rule was tried first and **rejected on real data**: a live transcript summary carried "Aaron
  Warner" straight through it. `isClean()` is a final guard — a registry line still carrying a
  digit, an `@` or a URL is dropped whole rather than published. **51/51 adversarial cases
  pass**, and the canon cases assert what must *survive*, so the suite cannot pass by deleting
  everything. The 2am cron harvest now **runs `scrub-test.mjs` first and only harvests if it
  passes.**

### Fixed — the Halloween cron schedule would never have run

- **`/home/remote/yard-theater-logs/` did not exist.** Every scheduled line redirects into it,
  so **all three would have failed at the redirect and never run at all.** Created, and the
  crontab now says so up front. Verified against real cron with a temporary entry, not by
  reading it: the `cd /home/remote/MonsterBox &&` prefix is load-bearing (cron runs with
  `cwd=$HOME`; a negative control without it died with `MODULE_NOT_FOUND`), `/usr/bin/node` is
  on cron's PATH, `harvest.mjs` resolves its key from `/etc/monsterbox/elevenlabs.key` with no
  interactive environment, and Node's timezone is `America/Chicago` so the 18:30 / 20:47 / 02:00
  slots mean what the comments say.
- `perform.mjs` now **preflights `GET /api/orchestration/status`**, so steps for nodes that are
  missing from config or unpowered are skipped instantly instead of stalling the show ~20 s each
  on a socket timeout; `"all"` fans out to configured+answering nodes instead of a hardcoded
  `[1..5]`; `say-all` asks for the endpoint's maximum timeouts (its 5 s default is shorter than
  TTS takes, and misreported a working voice as a failure); plus `--dry-run`, local-time log
  stamps and an ok/skipped tally for the cron log. `--hours 0` was silently rewritten to 26.

### Changed — ElevenLabs

- **Judge panel re-run against the shipping configuration: 150 conversations (6 agents × 5
  personas × 5 runs), 0 errors. Every character at or above baseline.**

  | Agent | baseline | this run | delta |
  |---|---|---|---|
  | Orlok | 80% | 96% | +16 |
  | Sir Dragomir | 89% | 96% | +7 |
  | PumpkinHead | 91% | 100% | +9 |
  | Groundbreaker | 77% | 80% | +3 |
  | Mina | 93% | 92% | −1 (one conversation; noise) |
  | Renfield | 100% | 92% | see below |

  `baselines.json` now records these as data and `analyze.mjs` prints a pass/fail gate against
  them, so the next session compares to numbers rather than to a prose table. **Confound
  recorded honestly:** a parallel session attached a new knowledge-base doc to all six agents
  about two minutes into the 13.6-minute run, so part of the run saw it and part did not.
- **Renfield's baseline is corrected from 100% to 93% — this is a BETTER ESTIMATE, not a
  regression.** The original reading was n=25; re-measured at n=100 with the config unchanged
  between the two measurements it settled at 93%. 25/25 carries a 95% interval of
  **[87%, 100%]** against **[86%, 97%]** for 93/100 — the same measurement, taken properly the
  second time. He remains joint-highest in the fleet.
- **Mina was the one agent the fleet LLM migration had missed** — still on
  `gemini-3.1-flash-lite` with `reasoning_effort=minimal`, measured at **~860 ms LLM
  time-to-first-byte against ~160 ms** for `gpt-oss-120b` on the other five, i.e. roughly 5×
  slower per turn on the fleet's highest-delight character. Migrated live, and the judge run
  confirms she held her score.
- **Fleet turn-taking retuned for a yard rather than a phone assistant**, per character rather
  than uniformly. `turn_eagerness`: Orlok patient → normal (patience belongs in the voice, not
  in the silence); Sir Dragomir, Groundbreaker and Renfield → eager; **Mina and PumpkinHead
  stay normal deliberately** — both do close work with small children, who hesitate
  mid-sentence. `turn_timeout`: Orlok 12 → 8 s, Mina 7 → 6 s, the rest 7 → 5 s.
  **`soft_timeout_config` is now enabled fleet-wide** at 1.5–2.5 s per character — it was
  `-1`/disabled, so the in-character filler lines, which had been written and shipped in
  8.5.1-ai, had never once played. `disable_until_first_user_message` is set so a filler can
  never be the first thing a guest hears.
- **Orlok's vocal profile moved toward the 2024 Nosferatu performance** on owner-supplied
  research: stability 0.35 → 0.30, and an ELONGATION rule that stretches the vowel in one or
  two weighted words per reply. The word-count law is untouched. `style` exaggeration was **not**
  set — verified against the live API schema, `style` is absent from `TTSConversationalConfig`
  and cannot be set on `eleven_v3_conversational`.
- **Measured and worth recording: `eleven_v3` ignores `voice_settings.speed` entirely** —
  identical output duration across the whole 0.7–1.2 range, where `eleven_multilingual_v2` goes
  **~10.7 s to ~6.0 s on the same text**. Per-character tuned speeds are therefore only sent on
  the conversational agent path, and deliberately not to v3 where they would look configured
  and do nothing. This retires the "Orlok speed 0.75 may want 0.8" question for the say/scene
  path rather than answering it.
- The judge harness now **detects spoken-gesture leakage** on every run, and the judge
  personalization criterion no longer fails a conversation just because the visitor never gave
  a name — it judges the character on what the character did.

### Withheld — the gesture client tool is staged but NOT live for Halloween

The ElevenLabs half of the gesture spec (one `gesture` client tool, one `# Body` prompt section
per character) is **created in the workspace, attached to no agent**, with the prompt sections,
tool definition, evidence and an apply procedure staged in `config/elevenlabs/gesture/`.

- The spec assumed these calls would be harmless no-ops. They are not: the character prompts are
  dense with `[audio tags]`, so a model handed gesture ids **emits them as more audio tags
  inside the spoken text** — a guest hears the character say "hand glow".
- Once the handler shipped mid-session, the leak was re-measured **on the live path**, where a
  tool call is actually possible: real Agents WebSocket conversations, tool declared and
  answerable. Orlok — the only character with a shipped `gestures.json`, and so the only one
  with anything to gain — over 5 probes and 30 replies: **0 correct tool calls and 9 replies
  (30%) speaking `[hand_glow]` aloud.** The other four agents were quiet; Mina made the fleet's
  single correct call.
- His prompt is the most bracket-primed in the fleet, which points at priming rather than at the
  ids being inherently unsafe. The fix worth trying next — per-character tools with `gesture_id`
  as an enum and a `# Body` that names intents but no ids — departs from spec §5.2 and needs a
  clean 30-reply probe before it ships. Recorded in `config/elevenlabs/gesture/README.md`.
- Zero spoken-gesture leakage across all 150 judge conversations with the config withdrawn, as
  expected. Live agents were restored byte-identical to the committed snapshots.

### Characters and fleet

- **Renfield (character 6) completed** — but **his Pi has still never been on the network**, so
  none of it is hardware-verified.
  - **Shake-motor pins fixed:** `parts.json` declared **the same GPIO (17) for both BTS7960
    enable lines** (inherited from the Groundbreaker part it was copied from). The setup claims
    each enable line separately, and claiming the same line twice returns `GPIO_BUSY (-79)` —
    so **every shake command would have failed at pin setup, before the motor ever turned.**
    L_EN moved to GPIO 23, wiring spelled out in the description including the "do not jumper
    the enables together" constraint. Also added the top-level `maxDuration` the part normalizer
    actually reads, so the 5000 ms cap stops being dropped.
  - **Placeholder image** at `data/character-6/images/` (a monogram card that says
    "PLACEHOLDER IMAGE / not a photograph of the prop" on its face) — `characters.json` already
    pointed at a file that did not exist, and that path is plain `express.static` with no
    fallback, so every Renfield avatar was a broken image.
  - **Fleet entry with a deliberately null IP.** Being absent was not neutral —
    `getHostnameCharacterId()` maps hostname → characterId from `config/animatronics.json`, so
    without an entry his Pi would boot as whatever character `app-config.json` held and
    advertise *that* identity over mDNS. `ip: null` is not a guess and is the fastest possible
    failure: measured on this node, **null fails in ~126 ms (`ENOTFOUND`, and it never passes
    `isValidHost` so it is never dialled), a guessed `192.168.8.170` takes ~3100 ms
    (`EHOSTUNREACH`, and could belong to a stranger's device), and `renfield.local` takes a full
    ~5000 ms timeout.** He is correctly excluded from fleet fan-outs and reports himself
    offline.
- **`views/components/control-bar.ejs` pointed its avatar at a `placeholder.png` that had never
  existed**, so **every page in the app fired a 404** and leaned on the `onerror` handler to
  hide it. Added; the Fleet Command Center now loads with 0 failed requests and 0 console errors
  (both were non-zero).
- **mDNS discovery was dead on this node** — `avahi-utils` had never been installed — and
  `avahi-daemon` was not running on one other node. Both fixed: **all three live nodes now
  advertise `_monsterbox._tcp` and discover each other**, which is what lets a node auto-appear
  when it boots. The three offline nodes are, of course, undiscoverable until they are powered.
- **The fleet status contract now allows `ip: null`**, and a node with no address must report
  itself offline.
- `scripts/deploy-to-animatronic.sh` **no longer refuses to run when only key auth is
  configured.** It demanded an exported `PASSWORD` even on a fleet where SSH keys already work —
  punishing the more secure configuration. It now prefers keys, falls back to the password, and
  reports which mode it used.

### Known issues and things deliberately not done

- **Three nodes unverified.** PumpkinHead, Groundbreaker and Renfield were offline or
  non-existent for the entire session. Every hardware claim here is Orlok, plus the remote
  audio/ceremony checks on Mina and Sir Dragomir.
- **A daylight speaker level-balancing pass in the yard is still outstanding.** The levels
  above are indoor/night rehearsal levels on badly mismatched rigs.
- **`scripts/deploy-to-animatronic.sh` can abort on rsync exit 23** from root-owned files it
  cannot replace (`certs/`, and a stray root-owned `data/ai-config/`). Because of `set -e` the
  abort happens **before the service restart**, so the code lands and the node keeps running the
  old build — a deploy that looks like it did nothing. See
  `docs/deployment/README.md` → Troubleshooting.
- **The gesture engine is verified on one node with one character's recipes.** No other
  character has a `gestures.json`.
- The ch4/ch5 fuse problem, the dead elbow and the quarantined bow are all **unchanged and still
  open** — see `docs/troubleshooting/KNOWN-BUGS.md`.

## [9.0.0] - 2026-08-15 — Hardware safety, real hardware paths, live conversation

A safety-and-honesty pass on the hardware layer, plus the first release in which the
conversational agent actually works end to end. Highlights: a real per-part safety-limit
layer; removal of code paths that reported `success:true` without touching hardware; a test
suite that had been physically stressing Orlok's fused rail; hardware commands that had been
resolving to the *wrong character's* physical channel; a scene engine that no longer dies on
one broken part; a 34-pose library for Orlok; and a conversation loop that hears complete
sentences instead of a third of them. Plus the leaked SSH credential out of the working tree
and an unauthenticated remote reboot/shutdown closed. No new frameworks, no new npm or system
dependencies, all API contracts preserved.

⚠️ **Not a "fleet is healthy" release.** Only Orlok was on hardware this session, and only
partially: parts 2 and 3 remain broken/quarantined, the ch4/ch5 fuse problem is **mitigated
in software only**, and part 4 (Elbow) accepted six commanded moves with **zero acoustic
signature** — see Known issues and `docs/troubleshooting/KNOWN-BUGS.md`.

### Added — interface

Four reviewers drove the live UI as different people (a newcomer, the builder, the operator
on Halloween night, someone running a multi-prop display). They independently found the same
thing: **the product asserted success it had not established.** Full write-up in
`docs/development/V9-PERSONA-REVIEWS.md`.

- **A global control bar on every page** — character identity, a LIVE server probe (never
  persisted state), master volume, and stop-everything, all in the same place everywhere. An
  equivalent bar had existed on exactly one page.
- **`POST /api/panic`** — one server-side request that stops the show. Panic used to be a
  client-side fan-out; browsers cap HTTP/1.1 at six connections per origin, the dashboard
  holds one open forever for the MJPEG stream and pollers take more, so on degrading wifi it
  could sit in the queue and never leave the handset while the UI reported success.
- **Show Mode (`/live`) is reachable from the navbar**, and its pose rows are full-width 56px
  targets with a busy state. It was a complete show-night dashboard that no menu linked to.
- **A responsive layer** (`public/css/mb-responsive.css`): 44px touch targets on coarse
  pointers, hover scoped to devices that can hover (it "sticks" after a tap otherwise), tables
  that become labelled cards below md, full-screen modal sheets, 16px inputs so iOS stops
  zooming on focus, and safe-area insets.
- **A wake lock on the show pages**, so the phone stops sleeping between groups — each wake
  previously cost an unlock plus a reload, which is also the window where the panic button is
  briefly unwired.
- **`npm run audit:design-system`** in the gate: a shrink-only ratchet, like the
  character-independence audit. **1429 → 199 violations**, and it can only go down.
- **A busy state** (`data-busy`) for controls that dispatch hardware. A servo move takes
  500ms+, an unacknowledged tap gets tapped again, and a double-tap double-fires a motor.

### Fixed — interface

- **The design system's colours had never actually applied.** `monsterbox4.css` — a v6.1 file
  whose own header calls it "the single source of truth" — redeclared the semantic tokens in
  `:root`. It loads after `tokens.css` at equal specificity, so it silently overrode all three
  curated themes app-wide with a 2021 palette.
- **Panic required a 600ms hold, and five rapid taps fired nothing.** Under adrenaline people
  tap harder and faster, not longer and steadier — a hold is exactly the gesture stress
  removes. It now fires on `pointerdown`.
- **Panic disarmed nothing autonomous.** Lurk, the motion sensor, head tracking and the idle
  loop survived it, so the frightened guest backing away tripped the sensor and fired the
  scare again. All now disarmed, verified in 414ms.
- **The panic button called a 404.** `dashboard.js` fired `/api/orchestration/stop-all`, which
  does not exist; audio and scene-queue stops landed, so it appeared to work while the
  fleet-wide stop silently did nothing.
- **The calibration API bypassed the safety layer entirely** — it drives adapters directly, so
  `goto`/`nudge`/`set-min`/`set-max`/sweep went around `blockAllMotion`, the angle windows and
  the fused-rail serialization. A reviewer drove the quarantined, physically dead elbow to 45°
  and 135° and was told `success:true, clamped:false` three times.
- **Sweep Test was a one-click full-span slam at 100% speed**, taking its range from an
  `autoGenerated` placeholder, on the rail whose fuse has blown before.
- **Refusals read like successes** — `success:false` next to "Part Elbow tested at position
  50", with the reason discarded one layer short of the screen.
- **The UI displayed a position the servo was not at**, and Set Min/Set Max then captured that
  number as ground truth — recording a lie as calibration.
- **A refused move still advanced the open-loop position estimate**, so the system believed a
  quarantined actuator on its endstop was at mid-travel.
- **`/api/audio-levels` could take the whole process down.** `deviceId` was const-declared
  inside the `try` while the outer `catch` reported it, so any throw became a `ReferenceError`
  raised from the error handler — on an endpoint polled once a second.
- **The in-app log viewer could not contain the answer to its own question** — it read
  journald while the service redirects stdout/stderr to files, and `getConsoleOutput`'s
  `'both'` silently meant stdout only, hiding every safety refusal.
- **Every never-seen Goblin showed a live green heartbeat** (`heartbeatAge < 60` where
  `heartbeatAge` is `null`, and `null < 60` is `true`).
- **Offline fleet nodes rendered fully live controls**, and partial fleet failure was
  indistinguishable from total success (`.mixed` existed and was applied nowhere).
- **`.mb-switch` was unreachable** — 0×0 input, no hit target on the painted track.
- **Scene play and delete were both 24×23px, 8px apart.** Play is now 44×44 and filled.
- **The navbar shelled out to `git rev-parse` on every page render**, with a path hardcoded to
  one machine.
- **Fonts were fetched from Google**, so typography depended on WAN access on the one night of
  the year this has to work. Now self-hosted.

### Added
- **Hardware safety-limit layer** (`services/hardwareService/safetyLimits.js`) — restores
  what was dropped when calibration moved to unified profiles (the TODO at
  `services/hardwareService/index.js:1567`). Clamps angle to the intersection of calibrated
  bounds and configured limits, caps speed and duration, hard-blocks retraction of a part
  pinned at its mechanical minimum (including the bounds-bypassing jog-raw path), and
  serializes parts sharing a power rail with a cooldown so their inrush currents cannot
  stack. Parts with no configured limits are pass-through, so existing behavior is unchanged.
- **`config/hardware-safety.json`** — per-part limits committed with the code, so they
  deploy with it and survive a calibration reset (`data/calibration_profiles.json` is
  node-local). A profile's own `safety` block may only *tighten* them; the more restrictive
  value always wins. Keys: `maxSpeedPct`, `maxDurationMs`, `minAngle`/`maxAngle`,
  `noRetractBelowMin`, `blockAllMotion`, `excludeFromAutomatedTests`, `powerGroup`.
- **`safetyLimits.isTestSafePart()`** — a part is drivable by an automated suite only if it
  is not power-grouped, not quarantined, and not explicitly excluded.
- **Continuous microphone capture** (`serverSTTListener.startContinuousCapture()`) — one
  long-lived process streaming headerless PCM16LE @ 16 kHz mono, tried in order
  `parec` → `ffmpeg` → `arecord` (all already installed; spawn only, no new dependency and
  no new transport). A stream that produced audio and then died retries the same method; one
  that never produced any advances to the next candidate, with exponential backoff capped at
  8 s so a dead device cannot spin. Measured duty cycle **34.4% → 98.5%**, 217 ms startup lag,
  50 ms granularity. `captureChunkWav()` is untouched for its batch callers.
- **Per-frame jaw sync on the agent path** — chunks are sliced into the same 50 ms frames the
  offline path uses, carrying partial frames across chunk boundaries and draining a
  per-character queue on one timer. Agent-path jaw transitions went 4 → 29 on the opening
  line, and 6-over-29 s → 434-over-60 s in conversation.
- **Orlok pose library: 8 → 34 poses** (`data/character-3/poses.json`), authored inside the
  verified-safe envelope (head 60–120, elbow 80–110, short actuator moves, lamp). Parts 2
  (dead), 3 (quarantined), 5 (no bounds) and 10 (daemon-owned) appear nowhere; the elbow is
  untagged from idle so the loop never drives the fused rail on a pick; actuator net travel
  across the library is zero so an open-loop part cannot walk to its end stop. Pre-existing
  poses were sanitized rather than replaced — several held angles outside the safe band.
  **The poses are statically validated but not yet hardware-confirmed.**

### Fixed
- **Hardware commands no longer resolve to the wrong character.** `controlPart()` and
  `batchMoveServos()` resolved the part by reading `selectedCharacter` off disk on every
  call, ignoring the caller's context. Part IDs are only unique *within* a character
  (character-1 part 4 is an "Elbow" on PCA channel 15; character-3 part 4 is an "Elbow" on
  channel 4), so while that global value was flipped, every "part 4" command drove the wrong
  physical channel — **this is what was driving PCA9685 channel 15 on this node with no part
  configured there.** And it was flipped constantly: the test-mode branch of
  `setSelectedCharacter` persisted to disk fire-and-forget, so any test run repointed the
  LIVE node at another character (the existing guard only protected `req.app.locals`, which
  the hardware path never reads). Both functions now take an explicit `options.characterId`,
  falling back to the old behavior so no caller breaks; `poseEngine` and `transitionEngine`
  pass the character they already knew, covering pose playback and the idle loop — the two
  paths that move the fused rail. `setSelectedCharacter` no longer writes to disk from test
  mode or from the test port: a full gate run now leaves `app-config.json` untouched where it
  previously rewrote it to character 1 every time.
- **`/api/parts/:id/test` passes the resolved character to the hardware layer.** The part was
  loaded with `loadParts(req)` (canonical resolver) but `controlPart()` was called without the
  character, so the actual command re-resolved against `selectedCharacter` on disk — testing a
  part with an explicit `?characterId=N` could actuate a *different* character's part of the
  same id, on a different physical channel.
- **One dead part no longer ends the show.** Sequential scene steps were awaited with no
  `try/catch`, so a single failing hardware step aborted the whole scene. Hardware actuation
  steps (`servo`, `motor`, `linear-actuator`, `light`, `pose`, `hardware`, `jaw-animation`,
  `head-tracking`, `goblin-video`) are now recorded as failed and the scene plays on — the
  same non-throwing model the concurrent path already used. Control-flow steps stay fatal on
  purpose: a `sensor` gate exists to hold a scene back, so swallowing its failure would fire
  the scene without its trigger. The scene still reports `success:false` with the failing
  steps listed, so a broken part stays visible rather than hidden.
- **The idle loop no longer silently drops lights and actuators.** It claimed every pose part
  as a servo and handed the lot to `transitionServos`, which filters on `angleDeg != null` —
  so lights and linear actuators in an idle pose were discarded without a word (an idle pose
  that turns a lamp on has never lit anything). Non-servo parts now go through the pose
  engine, only real servos are claimed in the priority manager, and failures in the non-servo
  path are logged without stopping the loop.
- **Pose duration set in the editor is now honoured.** The pose editor writes `duration` and
  `state`; the pose engine read only `durationMs` and `action`, so any actuator pose authored
  in the UI ran for the 2000 ms default no matter what the operator set — most of the travel
  on a 500 ms-class part. Both spellings are accepted everywhere now, with a unit test that
  fails if a future duration read honours only one.
- **Fleet deploy from the UI works.** `orchestrationService.deployCode()` invoked
  `./scripts/deploy-to-animatronic.sh` with only the IP, while the script's signature is
  `<character_id> <ip_address>` — the IP landed in `$1` as the character id and the script
  exited 1 on its own usage check, so UI-triggered deploy has never worked (independently of
  the credential issues). It now passes the character explicitly, falling back to resolving it
  from the node registry by IP, and fails with a clear message rather than a broken command
  when it cannot be determined. The id is parsed as an integer before it reaches a shell.
- **Canonical STT no longer hangs forever on every transcription.** `transcribeAudio()`
  wrapped the audio Buffer in `Readable.from()` and set a synthetic `audioStream.path`;
  `form-data` uses that path to `fs.stat()` the file for the part length, the path does not
  exist, so the length was never resolved, the multipart body never finished and the POST
  never completed. The axios `timeout` does not save it — that guards the wait for a
  *response*, not a request body that is never sent. Measured **>150 s hang → 988 ms**.
  Appending the Buffer directly with an explicit `knownLength` is what `form-data` wants and
  needs no new dependency. This is the canonical one-shot STT used everywhere; the browser
  conversation path awaits it inline inside the mic-loop tick, so a single call wedged that
  session's loop permanently. Verified end to end on real audio hardware: TTS out of the USB
  speaker, through the air, into the USB mic, back through this service — two sentences
  returned word for word.
- **The conversation loop actually hears you.** The agent could hear roughly a third of what
  was said, so a six-second spoken question reached it as the single word "Hello." Four
  causes, all fixed and measured on hardware: (1) mic capture spawned a fresh process per
  tick that recorded 500 ms and exited — 1452 ms of wall clock per 500 ms of audio, a ~950 ms
  blind gap after every half second of speech (now one continuous stream, see Added);
  (2) the agent path took one RMS over each whole network chunk and issued a single jaw angle
  per chunk, which is a twitch, not lip sync (now per-frame, see Added); (3) the jaw was being
  driven 0–180 on *every* path including TTS; (4) echo suppression stopped working after the
  first reply — `aiSpeaking` was cleared only on `conversation_end`, so `speechStartedAt`
  stayed pinned to the first utterance while accumulated audio kept accruing and the
  suppression deadline resolved to a time in the past, and the agent then heard its own voice
  as user speech and conversed with itself. A new utterance is now detected from a gap in
  audio chunks, and the deadline is monotonic so a new utterance cannot shorten a draining
  window. Live proof: a spoken exchange now returns complete verbatim user turns and zero echo
  turns, where the same test previously produced "Or has the -", "Hello." and "Threshold."
- **A placeholder calibration profile no longer overrides hand-set jaw markers.** The
  calibration store stamps any uncalibrated absolute-servo with a full-span 0–180 profile and
  marks it `autoGenerated`; `getCalibrationForPart` treated those numbers as real calibration,
  so the placeholder silently overrode this character's hand-set markers of 63/131 and the jaw
  was driven past its stops. A placeholder no longer outranks real markers and is still used
  as a last resort where no markers exist. Verified by I²C register tracing: 115 changes on
  the TTS path and 434 across an agent exchange, **zero** samples outside the calibrated
  window, and the jaw now parks at 62.7° instead of 0. ⚠️ This visibly changes jaw travel —
  it stays within the calibrated range rather than exceeding it. **Only the jaw path checks
  `autoGenerated` today** — see Known issues.
- **Conversation enable/disable actually starts and stops the live agent.** The endpoint
  persisted `ai_agent_state.json` and returned success but never opened or closed the
  ElevenLabs realtime agent, so the UI toggle was decorative.
  `setAgentEnabledForCharacter()` now creates a headless session (no browser client) and
  starts the agent socket plus the server mic loop; `_waitForAgentReady()` polls until the
  socket is genuinely OPEN so the route reports what really happened; teardown stops the mic
  loop, STT session, socket, timers and playback and is idempotent. The connection shape is
  built by one helper shared with the browser path so the two cannot drift. Verified live on
  hardware: enable is idempotent, three on/off cycles left 0 lingering connections with 7
  starts paired to 7 stops.
- **`getAgentIdForCharacter` returned null for EVERY character** — it resolved the
  fleet-wide registry through `cfg.dataPath` and so read a per-character copy (a stale
  fixture here) instead of `data/characters.json`. The conversation feature could not have
  worked for any character until this was fixed.
- **Headless sessions skip the batch-STT fallback** — the agent does its own ASR and there
  is no client to receive transcripts, so that branch would have burned STT credits every
  2.5 s for nothing. `_cleanupOldSessions` also leaked the mic timer and the Scribe
  keepalive; live headless sessions are now exempt from the reaper, which would otherwise
  silently switch the agent off after an hour.
- **AI settings "Test connection" makes a real API call** (`getVoices()`) instead of
  reporting success whenever a key string exists, so it can no longer pass against an
  invalid or expired key. The STT fallback model was a TTS model
  (`eleven_multilingual_v2`), which the STT endpoint rejects — now `scribe_v2`. Model IDs
  were audited against the live API and are already current (`eleven_v3`, `scribe_v2` /
  `scribe_v2_realtime`); nothing there needed changing.
- **Webcam `startStream`/`stopStream` are no longer simulated** — they probe the real
  mjpg-streamer service that `webcamController` proxies and the Fleet Command Center
  consumes, return the real proxy/snapshot URLs (no more fabricated
  `http://localhost:8080`), and try to start the service once before reporting an honest
  failure. `stopStream` detaches instead of killing a service shared by every other consumer.
- **`microphone.record` is no longer simulated** — it delegates to
  `serverSTTListener.captureChunkWav` (the one canonical capture path), writes the WAV out
  and reports real byte counts. An empty capture is now a failure instead of a success.
  Verified on Orlok's USB mic: 32044 bytes for 1 s @ 16 kHz mono, peak 2096 / RMS 931.
- **Motor stop actually stops the motor** — it sent direction `'stop'`, which
  `motor_control.py` rejects, so stopping always errored and never stopped. Speed 0 now
  drives PWM low and releases the pins.
- **`batchMoveServos` no longer batches power-grouped servos** — one `batch_pca` call moves
  every listed channel simultaneously, which is exactly the concurrent energizing that blows
  a shared fuse. Power-grouped servos are issued serially.
- **`/api/calibration/:partId/goto` clamps to the calibrated angle window** instead of only
  0–180, closing a bypass around the safety layer. `/nudge` is deliberately left unclamped —
  it is the operator's supervised tool for discovering limits, and clamping it would make a
  window impossible to widen.
- **`python_wrappers` resource leaks** — `servo_cli.py` leaked a gpiochip handle when a move
  failed mid-flight (accumulating, since `test_servo` moves 4× per process);
  `linear_actuator_control_v2.py` exited a bad pin config with the chip open and the BTS7960
  R_EN/L_EN still driven HIGH; `motor_cli.py` had no subprocess timeout, so a wedged
  `motor_control.py` hung forever **with the motor energized** (now bounded to duration +
  10 s); `speaker_cli.py` never unlinked its `NamedTemporaryFile(delete=False)`;
  `microphone_cli.py` silent exit-1 paths now report a reason on stderr, leaving stdout as
  pure WAV bytes. All 18 wrappers `py_compile` clean, no stray control bytes.

### Security
- **Remote unauthenticated reboot/shutdown closed.** The guard on the destructive
  `/api/system` endpoints (reboot, shutdown, restart-service, optimize, SSH key management)
  authenticated only when `MB_ADMIN_TOKEN` was set — it is set nowhere by default — and the
  fallback let any request *without* an `Origin` header through, which is every curl and
  script. In practice anyone on the LAN could shut down a running animatronic. Browsers send
  `Origin` on every non-GET request, so a missing `Origin` identifies a non-browser caller;
  those are now allowed only from loopback, and a remote script has to configure
  `MB_ADMIN_TOKEN` (the supported path). Same-origin browser requests still pass, so the
  operator UI is unchanged, and cross-origin CSRF is still rejected. Fleet orchestration is
  unaffected — it drives reboot and restart over SSH, and the endpoints it does call over
  HTTP (`/api/system/info`, `/api/system/volume`) are not behind this guard.
- **Leaked SSH credential removed from the working tree.** The committed fallback password
  is gone from `services/orchestrationService.js`; `sshPassword` now comes only from
  `MONSTERBOX_SSH_PASSWORD`, and a new `requireSshPassword()` makes every SSH op
  (reboot / restart / config push / deploy) fail with a clear, actionable error when unset
  rather than silently authenticating with a leaked default. Import still succeeds so HTTPS
  orchestration boots normally. The literal was scrubbed from 16 shell/python scripts, 5
  docs and the goblin-management view; shell scripts read
  `${MONSTERBOX_SSH_PASSWORD:?...}`, expect scripts read `$env(MONSTERBOX_SSH_PASSWORD)`.
  `deploy-to-animatronic.sh` and `usb-video-copy-daemon.sh` moved from `sshpass -p` (argv,
  visible in the process table) to `sshpass -e` (env).
  ⚠️ **The credential remains in git history and must still be rotated on every node**, and
  `MONSTERBOX_SSH_PASSWORD` must be set in each node's `monsterbox.service` environment —
  the app does not load `.env`, so a `.env` file will not work.
- **Unauthenticated arbitrary file deletion closed.** `DELETE /api/system/ssh/keys/:name`
  passed the raw route param to `fs.unlink`, allowing deletion of any file via `../`
  traversal. `safeKeyName()` now rejects (rather than rewrites) bad names in both
  `deleteSSHKey` and `deployKeyToHost`, with a reserved-name guard, and the three
  `/ssh/keys` routes are gated by `requireAdmin` like the other destructive endpoints.
  ⚠️ `requireAdmin` only authenticates when `MB_ADMIN_TOKEN` is set; it is set nowhere on
  this node today. Set it in the service environment.
- **Dependencies patched** — `npm audit fix` (no `--force`): `brace-expansion`
  1.1.13→1.1.18 / 2.0.3→2.1.4, `js-yaml` 4.3.0→4.3.1. Both transitive and dev-only
  (mocha/nodemon). Local `npm audit`: **2 high → 0**. GitHub Dependabot still reported 3
  high on the last push and those alerts have not been reconciled — `gh` is not
  authenticated on this node.

### Tests
- **The unit suite was physically stressing Orlok's fused rail.**
  `tests/unit/calibration-unified-api.test.js` selected `parts.find(type === 'servo')`,
  which on this fleet's primary node is the 150 kg elbow on the shared elbow/forearm fuse.
  Every `npm run test:smoke` drove it to 45° **and** 135° — both extremes — then called
  set-min/set-max, which rewrite the profile from wherever the test parked it. The test now
  selects through `isTestSafePart()` (picking the arm actuator and the head servo here) and
  snapshots the whole calibration file and restores it verbatim — verified byte-identical,
  so a run leaves zero drift. (Restoring via `upsert()` would have re-stamped
  `lastCalibratedAt` and looked like an operator recalibration.)
- `tests/unit/hardware-safety-limits.test.js` — 19 tests covering clamping, blocking,
  speed/duration caps, power-rail serialization, cooldown, deadlock-on-throw and rail
  independence, plus coverage for `isTestSafePart`.
- **Hardware tests no longer leave debris in live show data.** The continuous-servo suite
  creates a *real* part in the running node's `parts.json`, and its cleanup asserted a 200 —
  so any failure threw out of the `after` hook and left a phantom servo behind, pointing at a
  PCA9685 channel and indistinguishable from real hardware. Cleanup now always runs, never
  throws, and prints a loud notice naming the part to delete if it could not. Existing damage
  from a historical run was repaired: character-3 part 1's description had been overwritten
  with "Test updated via comprehensive tests" and its config carried a stray `testFlag`.
  ⚠️ **The same damage on character 1 part 1 ("Wiper Motor") is NOT repaired** — that node is
  offline and its hardware unverified, so the correct description cannot be written without
  guessing. See Known issues.
- `tests/unit/scene-step-resilience.test.js` — hardware step failures do not abort a scene
  while control-flow failures still do.
- `tests/unit/pose-engine-targets.test.js` — both `duration`/`durationMs` and `state`/`action`
  spellings are honoured; fails if a future duration read honours only one.
- `tests/unit/system-admin-guard.test.js` — the admin guard rejects remote no-`Origin`
  callers, allows loopback, and still accepts same-origin browser requests.
- `tests/basic.test.js` reads the template option from the live template instead of hardcoding
  a preset name that a safety revision legitimately renamed.

### Known issues (NOT fixed by this release)
- **Orlok part 2 (Left Arm) is dead.** PWM verified present on GPIO 13 with the same toggle
  pattern as the working GPIO 12, but zero motion at 50% and 95%. Fault is downstream —
  MDD10A channel, harness, motor power or the actuator.
- **Orlok part 3 (Bow) is quarantined, not fixed.** `parts.json` declares
  `rpwmPin:19, lpwmPin:21` while the part description says the opposite, and
  `linear_actuator_control_v2.py` drives `rpwmPin` for "extend" — so "extend" may physically
  retract a part already at its mechanical minimum. A direction-string guard cannot help
  when the string and the physical effect disagree, so it is blocked via `blockAllMotion`
  until a human traces the wires.
- **The ch4/ch5 fuse issue is mitigated in software only — the root cause is electrical.**
  Part 4 (RDS51150SG) needs 9–12.6 V with a 7.4–8.3 A stall; part 5 (DS3240MG) needs
  4.8–7.4 V. On one shared rail those voltage domains are mutually exclusive: either part 5
  is over-volted or part 4 is starved into stalling. The real fix is separate rails and
  fuses, or a per-servo regulator.
- **Orlok part 4's 45–135 bounds are test residue, not a calibration** — it needs a genuine
  supervised calibration pass. It is also a 270° servo driven through a 0–180 mapping
  (`pca9685_set_angle` maps 0–180 → 500–2400 µs) while its profile declares `usMin/usMax`
  500–2500 that `gotoAngle()` never reads.
- **The Python wrappers bypass the safety layer entirely** — e.g.
  `python3 servo_cli.py move_to_pca 4 …` skips every limit, including `blockAllMotion`.
  Needs a guard at the wrapper boundary.
- **Orlok part 4 (Elbow) accepted six commanded moves totalling ~95° with ZERO acoustic
  signature**, while the much smaller jaw servo and the arm actuator were plainly audible on
  the same microphone. That strongly suggests the ch4/ch5 rail is unpowered (fuse already
  blown), the servo is disconnected, or it is dead. **This is the single most important thing
  for the operator to check with a multimeter** — it also gates establishing part 5's bounds.
- **Orlok part 8 (Hand of Azura) light is unproven** — GPIO 16 verified toggling, but no
  optical change was detectable (the lamp is likely outside the camera's field of view).
- **Agent-path jaw opening is shallow** — it moves correctly and stays inside its calibrated
  window, but tops out around 77–79° against a 131° ceiling because agent audio RMS is low
  relative to the character's configured jaw `sensitivity: 1`. That is a tuning value, not a
  code defect; it needs a pass with the jaw physically watched.
- **Changing a microphone device now requires restarting the conversation session** — the
  continuous capture stream binds one device for the life of the session. (The old per-tick
  loop re-resolved the device every tick, which is part of what made it so expensive.)
- **Placeholder calibration profiles are a latent bug outside the jaw path.** The store stamps
  every uncalibrated absolute-servo with a full-span 0–180 `autoGenerated` profile. v9.0.0
  stops those outranking hand-set markers *in the jaw path only*; any other consumer that
  reads `bounds` without checking `autoGenerated` (head animation, the hardware service's
  angle clamps, `safetyLimits`) has the same latent problem. Worth an audit.
- **Character 1 (PumpkinHead) part 1 "Wiper Motor" has a corrupted description** — it reads
  "Test updated via comprehensive tests" from a historical test run, the same damage class
  repaired on character 3 part 1. Not fixed here because that node is offline and its hardware
  unverified; the description must not be guessed at.
- **Orlok scene 106 "Full Servo Test - All 4 Servos" references a part 11 that does not
  exist** in `data/character-3/parts.json` (this character's four servos are 4, 5, 10 and 15).
  Left as show data rather than guessed at. It no longer aborts the scene, because hardware
  steps are non-fatal as of this release.
- **Two pre-existing `test:system` failures in `parts-api`** (including "should dispatch servo
  parts without testResult wrapper"). Confirmed pre-existing this session — they fail
  identically with the v9.0.0 changes stashed.

Full detail and per-node status: `docs/troubleshooting/KNOWN-BUGS.md`.

## [8.5.1-ai] - 2026-08-16 — Halloween AI voices: judge-tested personas, new character, fleet tuning

All ElevenLabs-side configuration plus standalone tooling; no application code changed.
Full record: `docs/development/HALLOWEEN-TUNING-REPORT.md`.

### Added
- **Renfield** — sixth character (the master's mad British solicitor): agent, five KB
  docs, `data/character-6/` (schema+pact valid), lurk scenes, G&S law-school songs.
  Judge battery: **25/25 delight — the fleet's only perfect score.**
- **Judge panel** (`scripts/halloween-judges/`) — five simulated visitor personas,
  625-conversation evaluation + validation batteries; criteria data-recalibrated.
- **Yard Theater** (`scripts/yard-theater/`) — Dusk Ceremony, Thomas's whisper;
  Halloween cron schedule installed and committed.
- **Night Memory** (`scripts/night-memory/`) — nightly transcript harvest into a
  fleet-wide Yard Registry KB doc: characters remember returning guests.
- 1462 war canon braided across Dragomir (stories/secret/gold box), Groundbreaker
  (rock war/oath shout), Mina (The Waiting/Romanian songs); Renfield holds the paperwork.

### Changed
- Fleet LLM → gpt-oss-120b, reasoning off (3,054ms → ~160ms first token); all agents
  on eleven_v3_conversational + expressive mode; ASR keyword boosting; crowd VAD;
  in-character soft-timeout fillers; Night Protocol + Beckoning fleet-wide.
- Reply length recalibrated from data (~40-50 words/turn beats terse or verbose);
  Orlok delight 57%→80%; kid mode + scare-escalation added to Orlok.
- Local TTS voice drift fixed (character-4, character-6 synced to agent voices).

### Known
- Fleet audio unverified by ear: this node's mic chain is disconnected (webcam absent,
  empty mic jack); speakers report success but remain acoustically unconfirmed.

## [8.5.0] - 2026-07-17 — Fleet Command Center (orchestration overhaul)

A ground-up modernization of the orchestration subsystem into a single-pane **Fleet
Command Center** to monitor and run the entire animatronic network from one place. No new
frameworks, no new npm dependencies, HTTPS-only inter-node, all API contracts preserved
(additive only). Investigated with a fan-out audit (20 defects, 13 modernization gaps).

### Fixed
- **Remote webcams now stream** (the headline bug). The orchestration webcam proxy
  hardcoded `Content-Type: multipart/x-mixed-replace; boundary=frame` while mjpg-streamer
  emits `boundary=boundarydonotcross`, so the browser could never segment a frame and
  every remote feed showed "Webcam unavailable". The proxy now forwards the upstream
  Content-Type verbatim (`routes/api/orchestrationRoutes.js`), mirroring
  `controllers/webcamController.js`. Verified painting live 640×480 frames in-browser.
- **Webcam stream no longer dies after 30s** — the streaming request set `timeout:30000`;
  axios' timer isn't cleared for an endless MJPEG body and aborted healthy feeds. Now
  `timeout:0`, with client-disconnect cleanup via `req.on('close')`.
- **Broadcast/status success is meaningful** — `broadcastToAnimatronics/Goblins` and
  `getAllStatus` returned a hardcoded `success:true` even on total failure. They now
  return `{success, total, successful, failed, results}` (status adds `online/offline`).
- **Ask-AI works from the HTTPS page** — the old UI used a mixed-content `ws://<ip>:8795`
  (silently blocked). The new UI routes Ask-AI through the existing REST proxy.
- **Goblin cards** read `goblin.id` (were reading the non-existent `goblin.goblinId`).
- **30s full-innerHTML poll** that wiped operator input and re-pulled every webcam is gone
  — cards now patch incrementally; webcam `<img>` and focused inputs are never destroyed.

### Added
- **Fleet Command Center UI** (`views/orchestration/index.ejs`, rebuilt) — sticky command
  bar (fleet-health rollup pill, six superpower masters, master-volume slider, Start/Stop
  loops, **EMERGENCY STOP**, Say-to-all, node-subset targeting), a live **node wall** of
  per-node cockpit cards (streaming webcam, source/trust chip, CPU/RSS/uptime/latency
  health line, Say/Ask-AI, audio play/loop/stop, Auto-AI), a click-to-expand webcam modal,
  a goblin row, a rolling command log, and a **Discovery panel** (mDNS state + persistent
  pin-a-node form). Bootstrap 5 + one inline controller, no page reloads.
- **New endpoints** (`routes/api/orchestrationRoutes.js`): `GET /fleet-health` (aggregated
  per-node version/CPU/RSS/uptime/servo-latency), `GET /animatronic/:id/status`,
  `POST /superpower/:feature` (lurk|jaw|head|motion|mute|idle, fleet or subset),
  `POST /stop-all-queue-loops`, `POST /emergency-stop`, `PUT /volume` — all with
  `MB_TEST_MODE` short-circuits for offline testability.
- **Service gateway + hardening** (`services/orchestrationService.js`): a single
  `httpNode()` inter-node call helper with an abortable timeout; `getControllableAnimatronics()`
  with IPv4/hostname validation (closes SSH command-injection via spoofed discovery),
  optional `MB_NODE_TOKEN_ENFORCE` trust gating, and node-subset targeting; IP validation
  on all SSH ops; `SSHPASS` env now passed to `deployCode`; a startup security warning when
  the committed fallback SSH password is in use.
- **Manual node pins persist** to `data/manual-nodes.json` (write-on-change, gitignored)
  and survive restarts; discovered/manual nodes default `characterId` to their numeric id.

### Security
- ⚠️ The committed fallback SSH password (`services/orchestrationService.js`) is a known
  leaked credential. It is retained only so the fleet keeps working; **rotate it and set
  `MONSTERBOX_SSH_PASSWORD` in each node's service environment** — a startup warning now
  flags this. Spoofed-discovery command injection is closed via host validation.

### Tests
- `tests/system/orchestration.test.js` rewritten (**41 assertions**): status counts, node
  registry, manual pins, fleet-health, per-node status, broadcast summaries, all six
  superpowers, transport, emergency-stop, volume, Auto-AI, per-node validation.
- `tests/browser/orchestration.spec.js` rewritten (**13 tests**) for the new UI incl. a
  zero-console-error assertion. All-pages health sweep green (24/24). Gate green.

### Docs
- New `docs/development/ORCHESTRATION.md` (architecture, endpoints, UI, security, testing).

## [8.4.3] - 2026-07-12 — Fleet discovery matrix

### Added
- **`npm run check:discovery`** (`scripts/check-discovery.mjs`) — queries
  `/api/orchestration/nodes` on every node in `config/animatronics.json` and prints a
  who-sees-whom matrix (✓ online / · not discovered / — self / ? unreachable). Diagnoses
  in one command whether a node is down, has avahi stopped, or is up-but-invisible
  (multicast-blocked / wrong subnet). No dependency (built-in `https`); reads the roster
  dynamically (character-independent). Referenced from the validation checklist.

Completes the discovery tooling (8.4.1 feature → 8.4.2 fleet deploy → 8.4.3 fleet
diagnostics). No app-runtime change; gate green.

## [8.4.2] - 2026-07-12 — Fleet deploy + discovery bring-up

Tooling to push the codebase to every animatronic at once and light up mDNS discovery
across the fleet in one command.

### Added
- **`npm run deploy:all`** (`scripts/deploy-all.sh`) — deploys the current codebase to
  **every** node listed in `config/animatronics.json` (character-independent: add a 6th
  character and it deploys too, no script edit). Runs per-node deploys in parallel and
  prints a ✓/✗ summary. SSH credentials come from `MONSTERBOX_SSH_PASSWORD`/`SSH_PASS`
  (never hardcoded); `--dry-run` previews without restarting anything.
- **mDNS bring-up in the deploy path** — `scripts/deploy-to-animatronic.sh` now ensures
  `avahi-daemon` is installed and writes `/etc/avahi/services/monsterbox.service` with
  `sudo` on each node (the monsterbox service runs unprivileged and can't write it
  itself), so discovery is live immediately after deploy.
- **`scripts/advertise-node.mjs`** gained `MB_ADVERTISE_ID` / `MB_ADVERTISE_NAME`
  overrides so a fleet deploy advertises a deterministic identity regardless of
  in-flight `app-config.json` state.
- **`docs/setup/NODE-DISCOVERY-VALIDATION.md`** — a 15-minute on-hardware checklist to
  confirm advertisement, the live registry, dynamic offline/online + DHCP-change
  behavior, and orchestration-over-discovery, with fixes for multicast-blocked networks.

No app-runtime behavior changed; this release is deploy tooling + docs on top of the
8.4.1 discovery feature. Gate green.

## [8.4.1] - 2026-07-11 — Zero-config node discovery (mDNS)

Removes the biggest single-operator wall: hand-typed node IPs. A new node just gets
named at setup and picked up by DHCP; every other animatronic discovers it over mDNS and
shows it come online, with no `config/animatronics.json` edits on any peer.

### Added
- **`services/nodeDiscoveryService.js`** — advertises this node as `_monsterbox._tcp` (via
  the system `avahi` daemon, driven through `child_process` — **no new npm dependency**)
  and browses for peers into a live in-memory registry (mirrors the Goblin heartbeat
  registry: `status`/`lastSeen`/staleness). mDNS is discovery only; the control path stays
  HTTPS.
- **Orchestration overlay** — `orchestrationService.getAnimatronics()` overlays each config
  entry's `ip` with the live discovered address when the node is online. When nothing is
  discovered (non-RPi host, mDNS-blocked network) it returns the static config **unchanged**,
  so existing deployments behave exactly as before — strictly non-regressive.
- **API:** `GET /api/orchestration/nodes` (live merged registry with source/status/trust),
  `POST /api/orchestration/nodes/manual` and `DELETE /api/orchestration/nodes/manual/:id`
  (the manual-IP fallback for networks that block multicast).
- **`npm run advertise-node`** (`scripts/advertise-node.mjs`) — write the avahi service file
  at install/setup time or after renaming a node. The running server also advertises on
  startup.
- **Optional trust token** (`MB_NODE_TOKEN`) — when set, only peers advertising a matching
  token hash are trusted; off by default (non-breaking). Endpoint-level enforcement is a
  documented follow-up.
- 16 unit tests (`tests/unit/node-discovery.test.js`) covering the browse parser, registry
  merge/overlay, non-regressive fallback, staleness, manual pins, and token filtering —
  driven from captured `avahi-browse` fixtures (character-independent, RFC-5737 IPs).
- Design: [docs/development/NODE-DISCOVERY.md](docs/development/NODE-DISCOVERY.md).

On-hardware mDNS behavior (multicast over WiFi, cross-node visibility) should be validated
on the real RPi network; the parser/registry/overlay/fallback logic is unit-tested in a
hardware-less container (unit 184/0). No framework/DB/transport changes; the mDNS path adds
no persistent socket to the Node process.

## [8.4.0] - 2026-07-11 — Gold Release (stability, security, UX)

Consolidates the 8.3.x stability line into a gold release. No framework, database,
transport, or public-API changes; no new runtime dependencies. Everything below was
verified in a hardware-less container — unit **168/0**, system **339 passing** (the one
failure needs a real microphone), jaw **52/0** + head **21/0**, all-pages browser health
**24/24**, `npm audit` **0 vulnerabilities**, pre-deploy gate green.

### Highlights
- **Whole-application stability audit** — 14 subsystems, adversarially verified: 58
  confirmed defects, **all fixed** bar one intentionally-unchanged sync-write. Includes a
  batch of security fixes (path traversal, OS-command injection, DoS), crash/boot
  hardening, RPi-SD write reduction, and character-independence corrections. Full
  per-finding table: [docs/development/STABILITY-AUDIT-2026-07.md](docs/development/STABILITY-AUDIT-2026-07.md).
- **Servo control restored (#59)** — a committed null byte in `servo_cli.py` had been
  failing every PCA9685 servo move since v7.9.6; removed.
- **Complete mouseover/help coverage** — every interactive control (buttons, selects,
  link-buttons, checkboxes/ranges — including runtime-generated ones) now has a native
  `title` tooltip, enforced by a reusable `scripts/audit-tooltips.mjs` checker.
- **All-pages health test** — `tests/browser/all-pages-health.spec.js` visits all 24
  pages, opens every modal, and asserts zero JS/console/network/server errors.
- **Dependency security: 9 advisories → 0** — non-breaking `npm audit fix` on the root
  project plus a new `goblin/package-lock.json` pinning the Goblin subsystem's express
  tree to patched versions.
- **Data-integrity races fully closed (#39/#47)** — a new `updateJsonUnderLock` helper
  serializes the cross-writer read-modify-writes (webcam `parts.json`, jaw/head
  `super-powers.json`).
- **Repo cleanup** — removed stale `.bak` files and superseded session-handoff prompt
  docs; refreshed README, CLAUDE.md, and developer docs for the release.

The detailed, per-commit history of this work is preserved in the [8.3.1] section below.

## [8.3.1] - 2026-07-11 — Stability Audit (bug-fix pass)

A 14-subsystem, adversarially-verified audit of the whole application produced 58
confirmed defects (2 critical, 14 high, 21 medium, 21 low). 53 fully fixed, 2
corruption-fixed with a low-value lost-update serialization deferred, 2 deferred, 1
intentionally unchanged. No new dependencies, no framework/DB/transport changes, no API
contract changes. Unit 162/0, system 339/1 throughout (the one failure needs a real mic).
Full detail: [docs/development/STABILITY-AUDIT-2026-07.md](docs/development/STABILITY-AUDIT-2026-07.md).

### Security
- Path traversal (arbitrary file read/delete/serve) closed on the character-image
  endpoints and hardened centrally in `characterImageService`.
- Unauthenticated **OS command injection** via `journalctl --since`, plus `ssh-keygen`/
  `ssh-copy-id` argument injection, fixed by switching to `execFile` (argv, no shell).
- `/api/play-audio` path-traversal + unbounded-read **OOM DoS** closed by confining
  `getAudioFilePath` to the audio directory.
- Destructive `/api/system` endpoints (reboot/shutdown/restart/optimize) guarded:
  optional `MB_ADMIN_TOKEN`, CSRF rejection of cross-origin browser requests by default.
- Always-on test ports (3100/3200) bound to loopback (were `0.0.0.0`, re-exposing the
  whole app over plaintext HTTP to the LAN on HTTPS production nodes).
- `GET /__kill` gated to test mode. SSH creds moved off the process table (`sshpass -e`)
  and into `MONSTERBOX_SSH_PASSWORD` (rotate the committed value).

### Crashes / broken features
- Server no longer dies at boot when the ElevenLabs key is unconfigured (lazy config).
- Audio-loop children get an `error` handler (async spawn failure no longer crashes).
- Goblin video + playlist deployment now actually work (un-awaited `getGoblin()`);
  deployment copies from the real `goblin/` dir and a correct systemd `ExecStart`.

### RPi stability
- Bounded the movement-telemetry file; halved-and-serialized scene-analytics writes;
  250ms floor on queue lifecycle loops; in-flight guard on the lurk motion watcher;
  throttled the perf monitor; added timeouts to Goblin `fetch` and one-shot AI playback;
  webcam capture reuses one /tmp file.

### Data integrity
- New `services/atomicStore.js` (temp-file+rename writes + promise-chain mutex). Routed
  scenes, poses, super-powers, parts, app-config and calibration writes through it;
  serialized pose/scene/calibration read-modify-write to stop duplicate IDs / lost updates.

### Correctness / character-independence / leaks
- **Character-scoped the calibration & actuator-position stores (#5).** Part IDs are not
  globally unique, so profiles keyed by bare partId let one character's calibration
  overwrite another's servo bounds (a mechanical-damage path). Entries are now keyed by
  `${characterId}:${partId}` with a legacy bare-key read fallback (non-regressive) and a
  selected-character default; proven by `tests/unit/calibration-character-scope.test.js`.
- Jaw config, `/api/parts`, and scene CRUD (#44) now honor the requested character;
  concurrent scene-step failures are surfaced instead of reported as success; armed-mode
  timeout waits for the running scene to settle; idle-loop transitions are cancellable;
  STT/WS session leaks and a never-settling `askAgentQuestion` fixed; `gpio_read.py`
  degrades instead of crashing; stuck dashboard play-button spinner fixed; several
  correctness bugs (rotateContinuous duration, telemetry `record()` args, memory-monitor
  cooldown, servo priority, ESM `__dirname`) fixed.

### UX — complete mouseover/help coverage + page-error sweep
- **Every interactive control now has a native `title` tooltip.** A two-part pass
  brought every `<button>`, `<select>`, link-button, and interactive `<input>`
  (checkbox/range/radio) to full coverage — including the many controls emitted at
  runtime from inline-script string literals (scene-editor/studio step fields,
  orchestration animatronic cards, scenes list/queue/stories, audio device tests,
  models, system presets/SSH, unified-calibration presets/PCA test).
- **`scripts/audit-tooltips.mjs`** — a reusable checker that parses each view (HTML
  *and* JS-emitted tags) and flags any control whose opening tag lacks a `title`, so
  the coverage guarantee can be re-verified. Current status: 0 gaps.
- **`tests/browser/all-pages-health.spec.js`** — visits all 24 pages, opens every
  Bootstrap modal, and asserts zero uncaught JS errors, console errors, 4xx/5xx
  responses, or server-side errors per page. Caught and fixed a broken dashboard
  avatar (404) and a shared-layout script regression along the way.

### Follow-up fixes (2026-07-11)
- **Null byte in `servo_cli.py` broke ALL PCA9685 servo moves (#59).** A stray `\x00`
  on line 90 (the `u` in the `(1500us)` comment) made Python refuse to compile the
  whole file, so every `servo_cli.py move_to_pca …` — the standard-servo positioning
  path — had failed with `SyntaxError: source code string cannot contain null bytes`
  since v7.9.6. Restored the byte; all 40 Python wrappers now `py_compile` clean, and a
  repo-wide scan confirmed no other source file carries null/stray control bytes.
- **Fully closed the #39/#47 cross-writer JSON races.** Both were already crash-safe
  (atomic writes); a new `updateJsonUnderLock` helper now serializes the read-modify-write
  so simultaneous writers can't lose an update — webcam `setControls` (parts.json) and
  the jaw↔head config writers (super-powers.json).
- **Dependency security: 9 advisories → 0.** `npm audit fix` (no `--force`, no breaking
  changes — every fix landed inside existing `^` ranges, so `package.json` is untouched)
  patched multer, ws, axios, form-data (high) and qs, express, body-parser,
  follow-redirects, js-yaml (moderate). Verified non-regressive: unit 168/0, system 339
  passing, jaw 52/0 + head 21/0 (char 3), all-pages browser health 24/24, `npm audit`
  now reports **0 vulnerabilities**.

See [docs/development/STABILITY-AUDIT-2026-07.md](docs/development/STABILITY-AUDIT-2026-07.md)
for the full per-finding table and status.

## [8.3.0] - 2026-04-19 — Stabilization Release Mark

Minor-version bump that marks the stabilization pass (v8.1.8 → v8.2.3) as a coherent release. Structural guarantees against character-leakage and dependency-cascade failures are now live on `origin/main`.

- **Gate enforced everywhere.** `npm run gate` runs in `.git/hooks/pre-push` on every push from every checkout; same gate runs in `.github/workflows/ci.yml` before the existing unit/system/browser jobs. 30 s on RPi4B.
- **Orlok verified 100%.** Service active, `Schema validation passed for 5 character(s)` at startup, `GET /api/parts` returns Orlok's 12 parts, `npm run gate` green end-to-end.
- **Deploy to other nodes:** `bash scripts/deploy-to-animatronic.sh <id> <ip>`. Mina (.140) and Sir Dragomir (.130) are SSH-reachable. PumpkinHead (.150) and Groundbreaker (.200) were offline at release time.
- **Docs:** `CLAUDE.md`, `README.md`, `docs/development/STABILIZATION-RESULTS.md` all reflect the resolver / gate / pact vocabulary. `docs/development/STABILIZATION-PLAN.md` and `docs/development/STABILIZATION-AUDIT.md` preserved for provenance.
- **Memory:** new `stabilization.md` topic file documents the baseline; `MEMORY.md` index updated; `known-bugs.md` moves three-patterns + data shape divergence + no-detector issues into "Previously Fixed"; `testing.md` gains the gate and ratchet commands.

See the [8.2.3] section below for the full per-pillar breakdown.

---

## [8.2.3] - 2026-04-19 — Stabilization Pass (Pillars 1–5 + Claude Code primitives)

Structural fix for the class of bug where work on one character breaks another. Five pillars, each a separate commit, plus `.claude/` primitives. No new frameworks, no new dependencies, no transport or DB changes. Total added tests: 56 (pact suite). Gate wall-clock: ~30 s on RPi4B.

### Pillar 1 — Schemas (8.1.8)
- 7 JSON Schema files in `config/schemas/` covering `parts.json`, `poses.json`, `scenes.json`, `super-powers.json`, `ai-config/tts-config.json`, `ai-config/stt-config.json`, and the top-level `characters.json`.
- Hand-written validator at `services/schemaValidator.js` (no `ajv` dep).
- `npm run validate:schemas`.
- Server startup records per-subsystem health on `app.locals.subsystemHealth` without crashing on failure.

### Pillar 2 — Canonical character resolver (8.1.9)
- `services/characterContext.js` exports `resolveCharacter(req)`, `resolveCharacterSync(req)`, and `getCharacterById(id)`. Precedence: `req.query.characterId` > `req.params.characterId` > `req.app.locals.config.selectedCharacter` > `readConfig()` fallback.
- 13 route/controller files migrated: `routes/api/movement.js`, `routes/setup/calibration.js`, `routes/aiSettingsRoutes.js`, `routes/scenes/api.js`, `controllers/charactersController.js` (read sites), `controllers/posesController.js`, `routes/api/sceneEditorApi.js`, `routes/conversation.js`.
- `eslint-rules/no-direct-character-resolution.allowlist.json` — 20-file baseline of allowed direct reads (service boundaries + pending migrations).
- `scripts/ensure-resolver-usage.mjs` + `npm run audit:resolver`.

### Pillar 3 — Character pact suite (8.2.0)
- `tests/pact/character-contract.test.mjs` — 11 assertions iterated over every entry in `data/characters.json` (55 total for 5 characters; 1 skipped for char-5's missing `super-powers.json`).
- `scripts/pact-runner.mjs` filters by `--char <id>`.
- `npm run test:pact` and `npm run test:pact:character`.

### Pillar 4 — Pre-deploy gate (8.2.1)
- `scripts/gate.mjs` runs `validate:schemas` → `audit:resolver` → `audit:independence` → `test:smoke` → `test:pact` (fail-fast, 30 s on RPi4B).
- `npm run gate`.
- `scripts/git-hooks/pre-push` + `scripts/install-git-hooks.sh` (installed by `install.sh`).
- `.github/workflows/ci.yml` runs the gate before existing unit / system / browser jobs.
- `MB_SKIP_GATE=1` opt-out for emergency pushes (CI still runs the gate).

### Pillar 5 — Character-independence auditor (8.2.2)
- `scripts/audit-character-independence.mjs` greps `.js` / `.mjs` / `.ejs` for bias patterns. Modes: default, `--json`, `--list-allowlisted`, `--stale-allowlist`.
- `tests/baseline/character-independence-allowlist.json` — 72-entry baseline (Phase-0 audit underreported; all surfaced violations are allowlisted per plan). Ratchet only tightens.
- `tests/system/audit-ratchet.test.mjs` + `npm run audit:independence`.

### Phase 6 — Claude Code primitives (8.2.3)
- `.claude/agents/character-auditor.md` — read-only subagent that runs the four audit commands and returns a structured report.
- `.claude/skills/add-part/SKILL.md` — scaffold new `parts.json` entry, schema-validated, pact-verified.
- `.claude/skills/add-character/SKILL.md` — bootstrap `data/character-<N>/` with schema-valid minimal files, register in `characters.json` and `animatronics.json`.
- `.claude/skills/pre-deploy-gate/SKILL.md` — user-invoked only (`disable-model-invocation: true`). Parses `npm run gate` output and classifies failures with suggested fixes.
- `.gitignore` updated to track `.claude/agents/` and `.claude/skills/`.

### Docs
- `docs/development/STABILIZATION-AUDIT.md` — Phase-0 baseline synthesis.
- `docs/development/STABILIZATION-RESULTS.md` — commits, test-count delta, allowlist sizes, gate runtime.
- `CLAUDE.md` — three-patterns paragraph replaced with single-resolver policy; Pre-Deploy Gate and Character Auditor sections added.
- `README.md` — `npm run gate` and ratchet commands added; "Testing philosophy" subsection.

---

## [8.1.7] - 2026-04-19 — Stop Cross-Character Jaw Calibration Bleed

v8.1.6's new `readJawConfig()` overlay merged the canonical `calibration_profiles.json` bounds into the flat config returned to the UI. But `calibration_profiles.json` is keyed globally by partId (not per-character), and `writeJawConfig()`'s `tuningKeys` whitelist happily persisted `minAngle` / `maxAngle` back to `super-powers.json`. Result: opening or saving jaw-animation for Character A on Node B (where Node B's profile store has different bounds for the same partId) stamped Node B's bounds into A's `super-powers.json`. Observed on this Orlok node: `data/character-1/super-powers.json` (servoPartId "10") got overwritten from 63/131 to Orlok's 102/143.

### Fixed — `services/jawAnimationSuperPowerService.js`
- `writeJawConfig()` no longer persists `minAngle` / `maxAngle`. Calibration store remains source of truth; `readJawConfig()` overlay still drives the UI display; runtime `loadCalibrationGuardrails()` still reads from the profile store. The stripped keys just stop the overlay→write round-trip from stamping one character's bounds onto another.

### Reverted
- `data/character-1/super-powers.json` — restored to HEAD (63/131). PumpkinHead (.150) is offline; its local mirror was already legacy template data pointing at a non-existent partId "10", not authoritative.

### Tests
- 14 jaw unit + 52 jaw system + 41 calibration unit + 22 parts system + 167 smoke all pass on Orlok. No regressions.

---

## [8.1.6] - 2026-04-18 — Jaw Animation Calibration Reads Profile Store

The `/setup/calibration` page writes to `data/calibration_profiles.json` (absolute-servo `bounds.minAngle` / `bounds.maxAngle`), but the jaw-animation service was still reading from the legacy `part.markers[]` array in `parts.json`. Result: parts created or recalibrated after the profile-store rollout (e.g. Sir Dragomir's Jaw Servo) appeared uncalibrated to jaw-animation, even with valid bounds in the store. Saving a jaw-animation config returned "Selected servo must be calibrated before use."

### Fixed — `services/jawAnimationSuperPowerService.js`
- New `getCalibrationForPart(part)` — prefers `calibration_profiles.json` bounds for absolute-servo parts; falls back to legacy `part.markers` for backward compatibility with parts still on the old system.
- `getAvailableServos()` now resolves calibration async-per-servo using the new helper.
- `loadCalibrationGuardrails()` reads through the same helper, so the runtime jaw envelope respects bounds set by the calibration page.
- `readJawConfig()` overlays current profile bounds onto the flat config returned to the UI, keeping the display in sync with the canonical source.

### Fixed — `routes/setup/jaw-animation.js`
- `/adjust-calibration` route writes to the calibration store (via new `adjustPartCalibration()` helper) instead of mutating `part.markers`. Previously 400'd on parts without a markers array.

### Tests
- All 52 jaw-animation system tests pass.
- Parts + calibration unit/system suites pass (22 + 41).
- Full system suite: 339 passing, 12 pending (hardware-gated). No regressions.

### Deployed to
- Orlok (192.168.8.120), Sir Dragomir (192.168.8.130), Mina (192.168.8.140) all on v8.1.6.

---

## [8.1.2] - 2026-04-14 — Test Coverage Pass

Audit + gap-fill for the Phase 3/4 UX work. Not a coverage-number push — a focused pass that pins down the behaviors added or changed in v8.1.0 / v8.1.1 so a future refactor can't silently unwind them.

### Added — `tests/system/ux-redesign.test.js` (28 tests)

- **Design system CSS served** — `/css/tokens.css`, `/css/components.css`, `/css/mb-page-chrome.css`, `/css/animation.css`, `/css/studio.css`, `/css/dashboard.css` all return 200 and contain their signature selectors. `tokens.css` defines all three curated themes. `mb-page-chrome.css` actually retints Bootstrap cards and buttons via the cluster selector.
- **`master.ejs` cluster derivation** — requests to `/setup`, `/setup/style-guide`, `/poses/editor`, `/audio-library`, `/video-library`, `/orchestration`, `/goblin-management`, `/ai-settings` all produce `<main>` with the matching `mb-cluster-*` class. Dashboard `/` correctly has no cluster class. `/scenes` (studio) skips `<main>` but loads `studio.css`.
- **v8.1.1 script extractions** — `/js/dashboard.js` and `/js/poses-editor.js` serve, contain their expected IIFE anchors, and are referenced from their respective views. Pose editor view embeds the bootstrap JSON block; dashboard view no longer carries the inline FSM.
- **Theme picker reduction** — `/setup/system` exposes only `haunted-console`, `cold-crypt`, `bright-ops`. Retired Bootswatch names (`darkly`, `cyborg`, `slate`, `cerulean`, `flatly`, `vapor`, `superhero`, `quartz`) are absent from the `THEMES` array literal. Fallback logic for legacy saved themes is present.
- **Style guide route** — `/setup/style-guide` renders all 9 component sections and includes the panic-button demo.
- **Stop-all plumbing** — `/api/audio-loop/stop-all` and the character audio stop endpoint respond (no 500), covering the paths the panic button fires.

### Audit

- Ran full unit + system: 167 + 311 → **478 → 506 passing**. Zero failures. 30+12 pending (all hardware/ElevenLabs-gated, as designed).
- Browser E2E remains unavailable on the dev RPi because the production service holds port 3000 — known constraint.
- Flaky tests catalogued in MEMORY.md (VU meter, jaw save, calibration timeout) are all browser-tier and couldn't be exercised in this pass.

---

## [8.1.1] - 2026-04-14 — UX Redesign Backlog Cleanup

Follow-up to v8.1.0. Clears the deferred items from the Phase 4 backlog so the redesign stands on a clean foundation before Halloween.

### Extracted inline scripts
- **`public/js/dashboard.js`** (2290 LOC) — combined lift of three inline `<script>` blocks from `views/conversation/index.ejs`: the main dashboard FSM (~1850 LOC), browser audio bridge (~286 LOC), and Phase 3 Operator Command Bar wiring (~136 LOC). Loaded once with `defer`. `views/conversation/index.ejs` shrinks from 2679 → 396 LOC.
- **`public/js/poses-editor.js`** (616 LOC) — extracted from `views/poses/editor.ejs`. The two EJS-interpolated values (`editPoseId`, `currentCharacter`) now pass through a `<script id="mbPoseEditorBoot" type="application/json">` bootstrap block instead of templated JS. View shrinks from 738 → 127 LOC.

### Retired Bootswatch theme picker
- `views/setup/system.ejs` now only surfaces the three curated themes — **Haunted Console**, **Cold Crypt**, **Bright Ops**. The 16 Bootswatch theme entries were removed from the picker UI.
- Bootswatch vendor files remain on disk so any user sitting on a legacy theme (`darkly`, `cyborg`, etc.) still renders; the picker falls back to Haunted Console when the saved theme isn't in the curated list.
- Legacy aliases (`dark`, `default-dark`, `light`, `default-light`) still resolve correctly.

### Tests
- Full non-hardware suite green: 167 smoke + 311 system + unit = **478 passing**.
- Browser E2E not run (production service holds the port on this RPi — known constraint).

---

## [8.1.0] - 2026-04-14 — Haunted Console UX Redesign

A four-phase, end-to-end redesign bringing MonsterBox under a single design system styled for Halloween-night live operation. Runs on desktop browser or mobile phone, preserves every existing feature, keeps all JS hooks and API contracts intact.

### Phase 1 — Audit (`f8f677db`)
- Full catalog of 36 views, 12 CSS files (6,240 LOC), 19 client-JS files (~13k LOC).
- Gap report: three conflicting `:root` token blocks, 30+ overlapping button variants, 750+ LOC inline scripts, missing empty/loading/z-index/spacing scales.
- `docs/UX_REDESIGN_PLAN.md` (master plan, 4 phases, progress log).
- `docs/UX_AUDIT_PHASE1.md` (inventory + cluster assignments + draft palette).

### Phase 2 — Design Tokens & Components (`b7f07965`)
- `public/css/tokens.css` — single source of truth. Colors, typography (Creepster / VT323 / Press Start 2P / system-sans), 4px spacing scale, radii, shadows, motion, z-index. Three curated themes swap atomically via `data-mb-theme`:
  - **haunted-console** (default — Halloween green-on-black, poison-green `#39ff6a`)
  - **cold-crypt** (cyan/violet, dark)
  - **bright-ops** (light mode for daylight setup)
- `public/css/components.css` — full `.mb-*` component library: buttons (primary / secondary / ghost / danger / ai / link / panic + sizes + icon + glow), inputs, selects, textareas, switches, ranges, panels (+ accent variants), cards, tabs, badges, chips, status dots, tables, modals, tooltips, toasts, alerts, empty states, spinners, skeletons, meters, scanlines. Mobile-first, phone-width responsive.
- `/setup/style-guide` — dev-only reference page rendering every variant side-by-side.
- `prefers-reduced-motion` respected throughout.

### Phase 3 — Operator Command Bar + Dashboard (`d2f183ca`)
- Sticky top Operator Command Bar replaces the old Lurk bar.
- Character avatar + name, huge Lurk toggle, status badges that light up when each subsystem activates, scene transport, and a **STOP EVERYTHING** panic button (double-Escape shortcut, full-screen flash on trigger, stops scenes + disables Lurk/jaw/head/parrot/idle/motion/AI + mutes + kills audio + best-effort orchestration stop).
- Hero (webcam + chat) and Superpowers strip rebuilt on `.mb-*` components.
- Accordion panels re-skinned via scoped overrides — drag-reorder, panel-sortable.js, and ~2000 LOC inline FSM script untouched.
- Responsive: command bar wraps at <720 px, hero stacks at <960 px, chat compacts at <480 px.

### Phase 4a — Animation cluster (`ae8055b0`)
- `public/css/animation.css` — shared cluster styles.
- `public/css/studio.css` — 308 LOC extracted verbatim from `studio.ejs`, retinted to tokens.
- Views restyled: `poses/index.ejs`, `scenes/scenes.ejs`, `poses/editor.ejs`, `scenes/scene-editor.ejs`, `scenes/studio.ejs`.

### Phase 4b — Page Chrome + Setup cluster (`0db83444`)
- `public/css/mb-page-chrome.css` — generic `[class*="mb-cluster-"]` Bootstrap neutralizers + shared layout helpers.
- `master.ejs` derives cluster class from the route's `page` var and applies it to `<main>` — one place, every remaining cluster.
- `views/setup/index.ejs` — rebuilt with 10 interactive cards (up from 5).

### Phase 4c+d — Library, System, Onboarding (`1cc57465`)
- `audio-library`, `video-library`, `orchestration`, `goblin-management`, `ai-settings` (+ stt + tts): page-header upgrades + chrome-driven retint.
- `first-run/index.ejs` — rebuilt "Welcome to the Crypt" landing with neon portraits.
- `error.ejs` — rebuilt as `.mb-panel mb-panel-accent-danger` + `.mb-empty`.

### Safety
- Zero new server endpoints. Zero new npm dependencies.
- Every JS-targeted ID, class hook, drag-drop, SortableJS binding, and data-* attribute preserved.
- 167 smoke tests pass after each phase. Every touched EJS view compiles clean.
- Bootswatch themes and legacy CSS files remain in place — tokens live on top.

### Known follow-ups
- Extract 2000+ LOC inline dashboard script to `/public/js/dashboard.js`.
- Extract 750 LOC inline pose-editor script to `/public/js/poses-editor.js`.
- Deep-dive restyle pass on `setup/calibration.ejs` PCA9685 board visualization.
- Retire Bootswatch theme picker in favor of the 3 curated themes once stable.

---

## [8.0.1] - 2026-04-11 — Body Map Manual Controls, System Page Fixes

### Interactive Body Map for Manual Controls
- **SVG character silhouette** replaces drag-and-drop canvas — parts auto-map to body regions (head, arms, hands, torso, waist, legs) by analyzing part names
- **Visual part indicators** — servo joints (blue dots), actuators (amber diamonds), motors (green), lights (pulsing gold), all rendered as SVG elements on the body
- **Peripheral device bar** — speakers, microphones, webcams, and motion sensors displayed as clickable badges below the silhouette
- **Contextual hardware controls** — click a body region to see its parts, click a part to get type-specific controls: position slider + goto buttons for servos/actuators, forward/reverse/stop for motors, toggle for lights
- **Quick action buttons** — poses and sounds as one-click pill buttons below the control panel
- **Halloween aesthetic** — eerie breathing animation on the silhouette, orange glow on hover/selection, pulsing LED indicators, dark spooky theme integration
- **Zero configuration** — no manual layout setup required, parts auto-arrange by name intelligence
- **New CSS** — `public/css/body-map.css` with SVG styles, animations, responsive layout

### System Page Fixes
- **Fixed Resources & Movement tabs showing no data** — all 6 `apiGet` callbacks had wrong signature (missing `err` parameter), silently receiving `null` instead of API data
- **Moved Live Performance gauges above Theme Gallery** in the Overview tab for better visibility
- **Fixed batchMoveServos motion_sensor error** — idle loop was trying `moveToAngle` on non-servo parts; added type filter to only process servo-compatible parts

## [8.0.0] - 2026-03-29 — Mina 100%, Sir Dragomir Online, Orchestration Fixes, Multi-Node Deployment

### Sir Dragomir Deployed (Fresh Install)
- **Fresh v8.0.0 deployment** on 192.168.8.130 — old repo deleted, clean install
- **All 6 parts configured** — 3 PCA9685 servos (head continuous ch0, jaw ch1, magic box ch3), webcam, mic, speaker
- **Head servo is continuous rotation (360°)** — cannot hold angular position, uses speed/direction commands only. Not assigned to head tracking or poses
- **TTS voice** — "Harry - Fierce Warrior" (`SOYHLrjzK2X1ezoPC6cr`)
- **Jaw animation configured** — Part 2 (ch1), sensitivity 1.5, smoothing 0.4, quantization 18
- **4 poses created** — Neutral, Mouth Open, Magic Box Open, All Center (standard servos only)
- **New servo model** — `servo_miuzei_25kg_continuous` added to servo_models.json with continuous rotation gotchas documented
- **467 tests passing** on the Knight (156 unit + 311 system)

### Mina Fully Operational
- **All 10 hardware parts verified** — 3 PCA9685 servos (jaw/neck/eye), PCA9685 laser, MDD10A coffin door actuator, GPIO light, PIR sensor, USB speaker, webcam, microphone
- **Fixed calibration profiles** — Profiles synced from Orlok via git had wrong capability types (servos marked as openloop-linear and vice versa). Wrote correct profiles for all 10 Mina parts
- **Distinct TTS voice** — Mina now uses "The Siren's Voicemail" voice, not Orlok's "Count Orlok, Nosferatu"
- **Head tracking configured** — Neck servo (part 2) as pan servo, Mina Cam (part 7) as webcam source
- **8 poses created** — Neutral, Glance Left/Right, Mouth Open/Closed, Look Up, Menacing, All Center
- **Scene execution verified** — "Coffin Awakening" runs all 5 steps: coffin door, TTS with jaw sync, servo positioning

### Per-Character Default TTS Voices
- **Each character gets a unique fallback voice** — Previously all characters fell back to Orlok's voice when voice_id was missing from tts-config.json. Now PumpkinHead, Mina, Orlok, Sir Dragomir, and Groundbreaker each have distinct default voices

### Linear Actuator Direction Inversion
- **invertDirection support** — Per-part flag for actuators wired with reversed polarity. Mina's coffin door has opposite wiring from Orlok's; this flag swaps extend/retract at the hardware service layer without rewiring

### Orchestration Webcam Fix
- **Fixed webcam proxy URL construction** — The webcam-stream-url endpoint returns a full URL but the orchestration proxy prepended the animatronic IP again, creating a malformed double-URL. Now extracts the pathname correctly

### Orchestration HTTPS Fix (Critical)
- **Fixed inter-node communication** — All orchestration HTTP calls now use HTTPS with self-signed certificate support, matching the HTTPS-only configuration of all MonsterBox nodes. Previously, every orchestration call to remote animatronics silently failed because the service used `http://` while nodes only serve HTTPS on port 3000.
- **Verified working** — Orlok and Mina both report ONLINE via orchestration status; health checks, broadcasts, and per-animatronic commands all functional.

### Test Fixes
- **Audio setup test** — Returns 200 with success:false when pactl not installed (was 500)
- **Jaw TTS test** — Removed hardcoded char_id=3, increased timeout for real TTS calls
- **Jaw guardrails test** — Handles uncalibrated servos with null angle bounds
- **Character independence** — All jaw animation tests now use selected character from config

### Orchestration System Tests (New)
- **26 new system tests** in `tests/system/orchestration.test.js` covering:
  - Status and health-check endpoints
  - Broadcast commands (animatronics, goblins, all)
  - Say-all with test-mode response validation
  - Random poses enable/disable
  - Queue loop start
  - Auto AI CRUD (start, stop, status, stop-all)
  - Per-animatronic validation (say, ask-ai, play-audio, webcam-url, audio-files)
  - Orchestration page rendering
- **14 browser tests rewritten** to match actual orchestration UI elements (command log, status panels, broadcast controls, system commands)

### Multi-Node Deployment
- Code pushed to origin and deployed to Mina (192.168.8.140) — both nodes on same git revision
- Added `test:system:orchestration` npm script for targeted test runs

## [7.9.6] - 2026-03-27 — Hardware Verification, Movement Fixes & Listen In Audio

### Idle Loop Movement Fix (Critical)
- **Fixed undefined servo angles** — Transition engine expected `part.value` (movement system format) but idle loop passes pose parts with `part.target.angleDeg`. All batch PCA9685 commands were sending `channel:undefined`, producing zero movement. Now resolves angles from either format.
- **Idle loop verified working** — Webcam before/after screenshots confirm head, elbow, and forearm physically moving between idle poses during Lurk Mode

### Listen In Audio Fix (Browser Audio Bridge)
- **Fixed static/noise** — `pw-record` emitted arbitrary-sized stdout chunks causing AudioContext scheduling gaps. Server now buffers into fixed 200ms chunks (19200 bytes at 48kHz)
- **Switched to 48kHz** — Browser AudioContext runs natively at 48kHz; capturing at 16kHz caused resampling artifacts at every chunk boundary. Now captures and plays at matching 48kHz
- **PCM16 chunk alignment** — Added leftover byte buffer for odd-byte chunks that split 16-bit samples across SSE messages
- **300ms jitter buffer** — Absorbs network timing variance for gap-free playback

### Click-to-Track Direct Servo Control
- **Head moves on click** — Clicking webcam now directly calculates and commands the head servo angle based on click position, regardless of whether OpenCV tracking is running

### Motion Sensor Dashboard Toggle
- **New Motion toggle** in superpowers strip — enables/disables PIR sensor polling independently of Lurk Mode
- **New endpoints** `GET/POST /conversation/api/motion-sensor` for standalone sensor control
- **Auto-disables** when character has no motion sensor part

### Jaw Animation Tuning (Orlok)
- **Smoother jaw** — quantizationLevels 10→18, sensitivity 1→1.5, smoothing 0.6→0.4, attack 50→30ms, release 150→100ms

### Hardware Verification (All 12 Parts)
- All 4 PCA9685 servos (jaw, elbow, forearm, head) — verified via calibration goto + webcam screenshots
- All 3 linear actuators (right arm, left arm, bow) — verified via calibration nudge + position tracking
- Light relay (GPIO 16) — toggle on/off verified
- Motion sensor (GPIO 17 PIR) — enable/detect/disable verified
- Speaker — TTS playback verified
- Webcam — MJPG snapshot verified
- 4 poses executed and visually confirmed via webcam

### Character Documentation Cleanup
- Removed `docs/character_spinster.md` — character 8 does not exist
- Fixed Groundbreaker ID from 7 to 5 across all docs
- Updated Orlok servo models and calibration values
- Removed hardcoded version strings from deployment and session docs

### Test Verification
- **All 460+ tests passing** — 167 unit, 293 system, 58 browser E2E (0 failures)

---

## [7.9.5] - 2026-03-27 — Pose Execution Performance & Browser Audio

### Pose Execution Performance Fix
- **Batch PCA9685 servo commands** — New `batch_pca` command in servo_cli.py sends all servo angles in a single Python subprocess call (~500ms for 3 servos instead of ~1350ms for 3 separate spawns)
- **Fire-and-forget pose execution** — Dashboard pose buttons return instantly with `async: true` flag; hardware executes in background. No more multi-second spinner waits
- **Transition engine uses batch** — `transitionServos()` now sends one batch command instead of spawning a Python process per 20ms tick (was 300 processes per 2-second transition)
- **Pose engine batches servos** — `executePose()` separates servo parts for batch I2C and runs non-servo parts concurrently

### Browser Speaker for TTS
- **"Say This" plays in browser** — When Browser Spk is enabled, TTS audio is returned as base64 and played through the browser's Audio API alongside the character speaker

### Files Changed
- `python_wrappers/servo_cli.py` — New `batch_pca` command for multi-servo poses
- `services/hardwareService/index.js` — New `batchMoveServos()` function
- `services/poses/poseEngine.js` — Batch servo execution path
- `services/movement/transitionEngine.js` — Batch-first with per-tick fallback
- `controllers/posesController.js` — Fire-and-forget async execution mode
- `views/conversation/index.ejs` — Async pose play, browser TTS audio, base64 player
- `public/js/manual-controls.js` — Async pose execution
- `routes/conversation.js` — Browser playback flag for /api/say

---

## [7.9.0] - 2026-03-27 — Dashboard UX Overhaul, Head Tracking Fixes & Movement Telemetry

### Dashboard UX Overhaul
- **Removed Translate feature** — Translate toggle, endpoint, and all client code removed from codebase
- **Unified chat input** — "Speak to character" and "Make Character Say" merged into a single input with mode toggle button (Ask AI / Say This), with dynamic placeholder text
- **Consolidated audio controls** — Removed duplicate mute toggle between chat panel and superpowers strip; single mute control in superpowers strip, Browser Spk/Mic kept in chat for AI-specific audio routing
- **Draggable dashboard panels** — Accordion panels (Scenes, Poses, Manual Controls, Console, Audio Bridge) now have drag handles and can be reordered; order persists via localStorage

### Lurk Mode Real-Time Activity Badges
- **Green hardware indicators** — Lurk badges glow green when feature is actively using hardware (jaw moving, head tracking target, idle transitioning, motion detected, AI speaking)
- **New endpoint** `GET /conversation/api/lurk-mode/activity-status` returns real-time activity state for all features
- **1-second polling** when lurk is active; badges return to purple (enabled-but-idle) when hardware stops

### Head Tracking Fixes
- **Fixed detection mode default** — Python motion tracking script was defaulting to `motion` instead of `person` detection mode
- **Scanning sweep** — When no target detected for 3+ seconds, head servo slowly pans left-to-right across its range, searching for targets
- **Click-to-track visual feedback** — Clicking webcam shows green crosshair bounding box at click point; box disappears when 30-second countdown ends
- **Webcam cursor** changed to crosshair for click-to-track affordance

### Movement System Telemetry Connected
- **Telemetry auto-flush initialized** — `movementTelemetry.startAutoFlush()` now called at server startup (was never initialized, causing empty Movement tab on System page)
- **Transition engine wired to hardware** — `transitionServos()` was computing angles but passing `null` for `onStep`, so no servo commands were dispatched; now lazy-loads hardware service and sends actual `moveToAngle` commands
- **Telemetry recorded** — Cycle time, servo latency, and commands/sec now recorded during transitions

### Tooltips Across All Pages
- **Audio Library** — Speaker select, stop, search, filters, upload, and all dynamic table row buttons (play, favorite, loop, edit, download, delete)
- **AI Settings** — Test connection, speaker select, audio controls, chat input, TTS/STT config links
- **Video Library** — Upload, bulk select, deploy, fullscreen, search, filters, sort, manage goblins, bulk actions
- **Navigation bar** — All nav links, setup/activities dropdowns, character switcher, help
- **Calibration** — Tab navigation, action buttons
- **Pose Editor** — Save button
- **Characters** — Create, test agent, save, send test message buttons
- **Dashboard** — Speaker select, AI toggle, mode toggle, browser audio controls

### Bug Fixes
- **poseRepository.js path fix** — `getPosesFilePath()` now accepts `characterId` parameter and reads from correct `data/character-{id}/poses.json` instead of always using selected character's dataPath
- **Pose controller fix** — `getTemplates()` and `createFromTemplate()` now pass `characterId` to repository

### Files Changed
- `routes/conversation.js` — Removed translate endpoint, added activity-status endpoint, added idle loop import
- `views/conversation/index.ejs` — Unified input, panel drag-sort, activity polling, target box, tooltip additions
- `controllers/motionTrackingController.js` — Detection mode fix, scanning sweep, target tracking state
- `services/movement/transitionEngine.js` — Hardware dispatch + telemetry recording
- `services/elevenLabsWebSocketService.js` — Added `getActiveSessions()` for AI activity detection
- `server.js` — Movement telemetry auto-flush initialization
- `public/css/lurk-mode.css` — Green active badge animation
- `public/js/audio-library.js` — Dynamic row tooltips
- 8 view files — Tooltip additions across all pages
- `controllers/posesController.js`, `services/poses/poseRepository.js` — Pose path bug fix
- 3 test files — Translate references removed

---

## [7.8.0] - 2026-03-27 — Lurk Mode Motion Sensor & Actuator Position Persistence

### Install Script & Dependency Cleanup
- **Removed unused dependencies** — `puppeteer` (~400MB with Chromium) and `claude` removed from package.json; neither was imported anywhere in the codebase
- **Moved puppeteer to devDependencies** then removed entirely — E2E tests use Playwright, not Puppeteer
- **install.sh modernized for fresh RPi4B deployment:**
  - Bookworm boot config path detection (`/boot/firmware/config.txt` vs `/boot/config.txt`)
  - Added missing Python packages: `python3-lgpio`, `python3-smbus2` (required by hardware wrappers)
  - Idempotent `/etc/modules` entries (no duplicates on re-run)
  - Auto-generates self-signed SSL certificates (HTTPS required for browser microphone access)
  - Runs `npm ci` automatically during install
  - Creates `monsterbox.service` systemd unit with security hardening
  - Scaffolds new character data files (parts.json, poses.json, scenes.json, super-powers.json)
  - Consistent step numbering and working directory management
  - Explicit `--input-type=commonjs` for inline Node.js script (ESM-safe)

### Linear Actuator Position Persistence & Bounds Enforcement
- **Persistent position tracking** — Actuator positions now survive server restarts via `data/actuator-positions.json` (atomic writes for SD card safety)
- **Crash recovery** — If the server crashes mid-move, the position is marked "unknown" on next startup; homing is recommended before further use
- **Bounds enforced everywhere** — Calibration min/max (minP/maxP) now enforced in: calibration nudge, scene executor (raw direction steps), and pose engine (distance-based moves)
- **Scene executor bounds clamping** — Raw `extend`/`retract` scene steps are now duration-clamped so the actuator cannot exceed calibrated limits
- **Pose engine bounds awareness** — `prepareActuatorCommand()` now loads calibration profiles and clamps movement to safe range
- **Position survives adapter cache flush** — Changing invert, deleting profile, or learning motion model no longer resets position to 0.5
- **Emergency stop marks position unknown** — `POST /calibration/:partId/stop` properly flags open-loop position as uncertain
- **Homing sets high-confidence position** — `POST /calibration/:partId/home` persists `confidence: 'homed'` state
- **Graceful shutdown persists all positions** — Shutdown handler saves `cleanShutdown: true` before PID release
- **Position API enhanced** — `GET /calibration/:partId/position` now returns `positionKnown` and `confidence` for open-loop parts

### Lurk Mode Motion Sensor Integration
- **Motion sensor (PIR) monitoring** — While Lurk mode is active, the character's motion sensor is polled every second. Movement resets the inactivity timer, keeping the animatronic alive.
- **Inactivity timeout** — After 5 minutes of no motion or activity (speech, chat), Lurk mode enters a "sleep" state: superpowers (jaw, head tracking, idle, AI) are disabled, but the motion sensor keeps watching.
- **Wake on motion** — When the PIR detects movement while sleeping, Lurk mode fully re-activates all superpowers, as if first toggled on. The animatronic springs back to life.
- **Activity tracking** — Speech (Make Character Say) and chat messages reset the inactivity timer without requiring physical motion.
- **Graceful degradation** — Characters without a motion sensor skip the watcher (no errors). Characters missing a jaw servo, head servo, or webcam get those badges grayed out in the UI.

### Dashboard UI Improvements
- **Motion badge** — New "Motion" badge in the Lurk bar shows motion sensor status
- **Capability detection** — Badges for unavailable features (jaw, head, motion) are grayed out with strikethrough for characters that lack the required hardware
- **Sleep state UI** — Lurk bar dims with a slow breathing animation when sleeping, status shows "Sleeping — Waiting for motion..."
- **Larger fonts** — Lurk bar label, badges, and status text increased for readability

### New API Endpoints
- `GET /conversation/api/lurk-mode/capabilities` — Returns which lurk features the current character supports
- `GET /conversation/api/lurk-mode/motion-status` — Motion watcher state (for dashboard polling)
- `POST /conversation/api/lurk-mode/activity` — Notify the watcher that speech/chat occurred (resets timer)

### Files Changed
- `services/lurkMotionWatcherService.js` — New service: PIR polling, inactivity timeout, sleep/wake callbacks
- `routes/conversation.js` — Refactored lurk mode into helpers, integrated motion watcher, added 3 new endpoints
- `views/conversation/index.ejs` — Motion badge, capability detection, sleep/wake polling, activity notifications
- `public/css/lurk-mode.css` — Sleep animation, unavailable badge style, larger fonts

### Dependency Updates
- `music-metadata` 11.9.0 → 11.12.3
- `file-type` 21.0.0 → 21.3.2
- `multer` 2.1.0 → 2.1.1
- `picomatch` 2.3.1 → 2.3.2
- `brace-expansion` security fix
- `path-to-regexp`, `serialize-javascript` — npm audit fixes (0 vulnerabilities)

---

## [7.7.0] - 2026-03-23 — Movement System & Resource Management

### Lifelike Movement System
- 50Hz smooth servo transitions with velocity-based easing
- Priority-based servo claims (Scene > Head > Jaw > Idle > Micro)
- Idle loop service with weighted random pose selection
- Movement telemetry with 30-day rolling history

### Resource Management
- PID lock prevents dual-instance GPIO conflicts
- Process priority elevation, memory monitor, startup health checks
- Graceful ordered shutdown sequence

---

## [7.5.0] - 2026-03-22 — Scene Audio Blocking Fix

### Scene Audio Playback Fix
- **TTS/AskAI steps now block until audio finishes** — `executeSayThisStep` and `executeAskAIStep` were using `playBufferOnCharacterSpeaker()` which writes to a persistent mpg123 stream and returns immediately after the write, letting the next scene step start before audio finished. Switched to `playAIOnCharacterSpeaker()` which spawns a one-shot player process and awaits its exit.
- **Concurrent flag works correctly** — when "play with next step" is checked, audio fires in the background via the scene executor's fire-and-forget model; when unchecked, the scene now properly waits for audio to complete before advancing.
- Affects step types: `sayThis` (TTS), `askAI` (AI response + TTS)
- `audio` steps (file playback) were already correct — they use `speaker_cli.py` which blocks until done
- `playWithJawSync` path was already correct — jaw timeline blocks for the audio duration

### Files Changed
- `services/scenes/sceneExecutor.js` — switched non-jaw-sync TTS playback from streaming to one-shot player

---

## [7.5.0] - 2026-03-15 — ElevenLabs v3 TTS & Character Renames

### ElevenLabs v3 TTS Upgrade
- **Default TTS model upgraded** from `eleven_flash_v2_5` to `eleven_v3` (most expressive, supports audio tags)
- **Audio tags supported**: `[breathes heavily]`, `[whispers]`, `[hisses]`, `[slow]`, `[dramatically]`, `[exhales]` — used sparingly for dramatic animatronic speech
- **Pause mechanics via punctuation**: dashes (—) for reliable pauses, ellipses (...) for weight/hesitation, commas for breath
- **v3-aware voice_settings**: service layer conditionally omits `style` and `use_speaker_boost` params (not supported by v3)
- **TTS Settings UI**: `eleven_v3` shown as first option, info note when v3 selected about unsupported params
- **All per-character TTS configs** updated to `eleven_v3`, removed unsupported params
- **Agent template overhauled**: prompts now encourage audio tags and pause mechanics (previously forbidden)
- **Quick fallback responses** updated with dramatic punctuation and audio tags for all characters
- **LLM model list updated**: Claude Sonnet 4.6, Gemini 2.0 Flash

### Character Renames
- **Coffin Breaker → Mina** (Character 2) — renamed across entire codebase (47 files)
- **Skulltalker → Sir Dragomir** (Character 4) — renamed across entire codebase
- Updated: characters.json, animatronics.json, character service, test fixtures, client JS, all deployment/utility scripts, and all documentation
- **PumpkinHead agent ID fixed** — was incorrectly set to Groundbreaker's agent
- Part names updated: Speaker Sir Dragomir, Sir Dragomir Cam/Mic
- Hostnames: coffinbreaker → mina, skulltalker → sirdragomir
- Doc files renamed: character_coffin_breaker.md → character_mina.md, character_skulltalker.md → character_sir_dragomir.md

### Documentation
- All docs updated to reflect `eleven_v3` as default TTS model
- CLAUDE.md version reference made dynamic (removed stale hardcoded version)
- README, CHANGELOG, memory files updated for character renames and TTS upgrade

## [7.3.0] - 2026-03-15 — Audio Reliability Overhaul

### Audio Output Fixes
- **MP3/pw-play mismatch fixed** — `playAIOnCharacterSpeaker()` was piping MP3 data to `pw-play` which only accepts WAV/PCM. Now MP3 content routes exclusively through `mpg123`, and `pw-play` is only used for WAV/PCM audio. This was the root cause of TTS dying unpredictably.
- **Persistent stream no longer killed** — AI playback previously called `stopStream()` which killed the persistent `mpg123` stream, creating gaps in subsequent playback. Removed this — AI speech uses its own one-shot player instead.
- **Removed pre-playback audio stop** — `speaker_cli.py stop` was called before every AI playback, unnecessarily cutting off any in-progress audio.

### Audio Library Fix
- **Startup race condition fixed** — `loadLibrary()` and `getAudioFiles()` now await the init promise. Previously, requests arriving before the initial file rescan completed would see an empty library.

### Microphone Stability
- **Source resolution caching** — `captureChunkWav()` now caches the resolved PipeWire source ID for 60 seconds instead of shelling out to `wpctl status` on every 0.3s capture chunk. Reduces system overhead and eliminates intermittent resolution failures.

### Audio Loop Fix
- **EPIPE crash prevention** — Moved `pwplay.stdin` error handler registration before the `ffmpeg.stdout.pipe()` call, preventing crashes when audio devices disconnect during looped playback.

### Hardware Safety Documentation
- **12V bus fuse protection** — Documented that linear actuators and large 12V servos are wired into a 12V power bus protected by intentionally undersized 5V fuses (safety-first design). Updated in hardware docs, wiring guide, and calibration guide.

### Audio Library Redesign
- **Table-based file manager** — replaced grid of tiny unreadable cards with a clean sortable table showing all files immediately
- **Inline controls** — play/stop toggle, loop, favorite, edit, download, delete on every row
- **Now Playing indicator** — highlights active row, shows title in banner
- **Compact toolbar** — stats badges, search, category filter, sort dropdown in single row
- **ES5 IIFE rewrite** — client JS converted from ES6 class to proper ES5 IIFE pattern

### System Volume Control
- **Volume slider** in System > Settings tab — first accordion item, range 0-100%
- **API endpoints** — `GET/PUT /api/system/volume` using `wpctl set-volume @DEFAULT_AUDIO_SINK@`
- **Default 90%** — set on deployment

### Files Changed
- `services/serverPlaybackService.js` — Content-type-aware player selection, removed stream-killing before AI playback
- `services/audioLibraryService.js` — Init-await guard on `loadLibrary()` and `getAudioFiles()`
- `services/serverSTTListener.js` — Source resolution cache with 60s TTL
- `services/audioLoopService.js` — Error handler ordering fix for EPIPE prevention
- `docs/hardware/ORLOK_BTS7960_WIRING.md` — 12V bus fuse safety note
- `docs/hardware/index.md` — Power management section updated
- `docs/setup/LINEAR_ACTUATOR_CALIBRATION.md` — Fuse protection safety feature
- `views/audio-library/index.ejs` — Complete rewrite: table-based file manager
- `public/js/audio-library.js` — Complete rewrite: ES5 IIFE with table rendering
- `routes/api/systemRoutes.js` — Volume get/set endpoints
- `views/setup/system.ejs` — Volume slider in Settings tab
- `tests/browser/audio-library.spec.js` — 15 tests updated for table-based UI
- `tests/browser/actual-usage-testing.spec.js` — Updated audio library tests

### Testing
- **631 tests passing** (278 system + 85 unit + 268 browser), 0 failing

---

## [7.0.0] - 2026-03-05 — Major Release

MonsterBox 7.0 consolidates all v6.x features into a polished, production-ready platform. This release includes head tracking with face/hand detection, click-to-track, audio improvements, scene concurrency, and comprehensive documentation and test coverage.

### Head Tracking & Motion Detection
- **Head Tracking Setup Page** (`/setup/head-animation`) — full OpenCV-based motion tracking with servo mapping, live webcam overlay, hot-parameter tuning, and test sweep
- **Face & Hand Detection** — Haar cascade face detection and HSV skin-color hand detection modes, hot-switchable via stdin without restarting Python
- **Click-to-Track** — Click on webcam to manually set tracking target for 30 seconds with countdown overlay and auto-disable
- **Head Tracking Presets CRUD** — Save/load/delete custom tuning presets via API; built-in presets (Person, Noisy, Sensitive) protected from deletion
- **Dashboard Integration** — Status badge (Active/Searching/Off), toast notifications on toggle, 1-second status polling, enhanced status API with live tracking data

### Audio & Microphone
- **Faster VU Meter** — Reduced STT capture chunks from 2s to 0.3s, cached capture method for 5 minutes, 3x browser VU gain boost
- **Echo Suppression Everywhere** — Added mic suppression to `playBufferOnCharacterSpeaker()`, `playAIOnCharacterSpeaker()`, and `playWithJawSync()`; increased ConvAI tail buffer from 1500ms to 2500ms
- **Scene Concurrency** — Replaced pair-based concurrent grouping with fire-and-forget model; multiple consecutive concurrent steps now all fire in parallel

### Dashboard & UI
- **Bootstrap Tooltips** — Descriptive hover help on all Monster Features toggles (Jaw, Parrot, Translate, Head Tracking, Mute)

### Documentation
- **Audio & Microphone Setup** — New guide covering capture methods, VU meter, troubleshooting
- **Echo Suppression** — New guide explaining how suppression works and tuning tips
- **Scene Concurrency** — New guide explaining fire-and-forget model with examples

### Testing
- Comprehensive Playwright and system tests for all new v7.0 features
- Full test suite passing (system + unit + browser)

---

## [6.8.0] - 2026-03-01 — Comprehensive Bug Fix & Feature Update

### Microphone & VU Meter
- **Faster capture:** Reduced STT capture chunks from 2.0s to 0.3s for responsive VU meter and precise echo suppression timing
- **Capture method caching:** Cache working capture method (Python/ffmpeg/arecord/parec) for 5 minutes to avoid fallback chain overhead
- **VU meter boost:** 3x gain multiplier on browser-side VU meter for visible response to speech
- **Device validation:** Quick open/close test in `microphone_cli.py` before recording

### AI Echo Suppression
- **All playback paths:** Added mic suppression to `playBufferOnCharacterSpeaker()`, `playAIOnCharacterSpeaker()`, and `playWithJawSync()`
- **Increased tail buffer:** ConvAI tail buffer increased from 1500ms to 2500ms for room reverb tolerance
- **Duration estimation:** MP3 (~128kbps) and WAV (PCM16LE) buffer size used to estimate playback duration

### Scene Concurrent Execution
- **Fire-and-forget model:** Replaced pair-based concurrent grouping with true fire-and-forget — steps with `concurrent: true` fire off immediately without blocking
- **Multiple concurrent steps:** Multiple consecutive concurrent steps now all fire in parallel (not limited to pairs)
- **Backward compatible:** Old pair behavior is a subset of the new model

### Head Tracking Dashboard Integration
- **Status badge:** Active/Searching/Off badge next to Head Tracking toggle
- **Status polling:** 1-second polling when tracking is enabled
- **Toast notifications:** Success/error feedback on toggle with auto-revert on failure
- **Enhanced status API:** Now includes live tracking data (target position, FPS, pan angle)

### Face & Hand Detection
- **Detection modes:** motion, face, face+hands, all — configurable per character
- **Haar cascade face detection:** `cv2.CascadeClassifier` with `detectMultiScale(scaleFactor=1.1, minNeighbors=5)`
- **HSV skin-color hand detection:** Fallback hand detection using HSV color segmentation
- **Hot-update:** Detection mode can be changed via stdin without restarting Python process
- **Setup page dropdown:** Detection mode selector added to head-animation setup page

### Click-to-Track
- **Manual target selection:** Click on webcam to set a tracking target for 30 seconds
- **Countdown overlay:** Badge showing seconds remaining on webcam card
- **API endpoints:** Dashboard and setup page both support manual target via POST
- **Python integration:** `set_manual_target` stdin command prefers detection closest to click position

### Head Tracking Presets CRUD
- **Server-side presets:** Built-in (Person, Noisy, Sensitive) + custom presets stored in super-powers.json
- **API endpoints:** GET/POST/DELETE for preset management
- **Save current as preset:** Button to save current tuning parameters as named preset
- **Delete protection:** Built-in presets cannot be deleted

### Dashboard Tooltips
- **Bootstrap tooltips:** Added to all Monster Features toggles (Jaw, Parrot, Translate, Head Tracking, Mute)
- **Descriptive help text:** Each toggle explains its function on hover

### Documentation
- **Audio & Microphone Setup:** New guide covering capture methods, VU meter, troubleshooting
- **Echo Suppression:** New guide explaining how echo suppression works and tuning tips
- **Scene Concurrency:** New guide explaining fire-and-forget model with examples

---

## [6.8.0] - 2026-02-28 — Head Tracking Setup Page

### Head Animation Setup (`/setup/head-animation`)
- **New setup page** for configuring OpenCV-based motion tracking with servo head mapping
- **OpenCV motion detection** — background subtraction with configurable threshold, contour area filtering, and noise reduction kernel size
- **Servo mapping** — maps detected motion centroid to pan servo position with configurable center degree, range, deadzone, and smoothing
- **Positional and continuous servo support** — works with both absolute position servos and continuous rotation servos
- **Calibration guardrails** — respects servo Min/Max calibration markers to prevent over-rotation
- **Live webcam overlay** — real-time motion tracking visualization on webcam stream
- **Hot-parameter tuning** — adjust motion threshold, contour area, background learning rate, smoothing, and deadzone without restarting tracking
- **Test sweep** — sweep servo through full range to verify wiring and calibration
- **Config persistence** — saved per-character in `super-powers.json` `headTracking` section

### Service Layer Fixes
- **Character independence** — `getCharacterDataDir()` and `loadPartsSafe()` in head animation service always resolve per-character paths, never relying on global dataPath
- **Cleaned up debug emoji logs** in motion tracking controller

### API Endpoints
- `GET /setup/head-animation/api/head-tracking/:charId` — read config + available servos/webcams
- `POST /setup/head-animation/api/head-tracking/:charId` — save config
- `GET /setup/head-animation/api/head-tracking/:charId/status` — tracking status
- `POST /setup/head-animation/api/head-tracking/:charId/start` — start tracking
- `POST /setup/head-animation/api/head-tracking/:charId/stop` — stop tracking
- `POST /setup/head-animation/api/head-tracking/:charId/params` — hot-update parameters
- `GET /setup/head-animation/api/head-tracking/:charId/requirements` — check OpenCV/webcam availability
- `POST /setup/head-animation/api/head-tracking/:charId/test-sweep` — servo sweep test

### Key Files
- `views/setup/head-animation.ejs` — Setup page with two-column layout (config + webcam)
- `public/js/head-animation.js` — Client-side controls (ES5 IIFE, 653 lines)
- `routes/setup/head-animation.js` — API routes (9 endpoints)
- `services/headAnimationSuperPowerService.js` — Config persistence service
- `controllers/motionTrackingController.js` — Extended with webcam-specific tracking functions

### Testing
- 21 new system tests for head animation API and config persistence
- Navigation updated with Head Animation link under Setup

---

## [6.7.8] - 2026-02-28 — Browser Audio Bridge, Security Update & CI Fixes

### Browser Audio Bridge
- **Browser Audio Bridge** added to Dashboard, `/ai-settings/stt`, and `/setup/audio` pages — harmonized across all three
- **VU meter fixes** — resolved meters stuck at 60% on audio setup page
- **Triple-firing buttons fixed** on `/setup/audio` page
- **Save config and test input fixes** on `/setup/audio`

### Security
- **Multer 2.0.2 → 2.1.0** — fixes DoS vulnerabilities in file upload middleware

### Calibration
- **Webcam theme fix** — calibration webcam overlay now respects selected theme
- **IR mode error fix** — resolved error when toggling IR mode
- **Dynamic webcam controls** — live control adjustments on calibration page

### CI/CD
- **All CI workflows fixed** — server startup and MB_TEST_MODE configuration corrected
- **Remaining browser test failures resolved** — stable green CI pipelines

### Testing
- Comprehensive Playwright tests for `/setup/audio` page
- Browser test fixes for CI environment

---

## [6.7.7] - 2026-02-28 — MkDocs Overhaul & Calibration Enhancements

### MkDocs Documentation
- **Halloween dark theme** with slate scheme and custom CSS
- **Core docs rewritten** — index, install, usage, config, structure, FAQ, networking
- **Replaced fabricated content** — removed inaccurate API/auth/RBAC docs, replaced with accurate content
- **Character pages updated** — all parts listed from actual JSON data (Orlok, PumpkinHead, Mina, Sir Dragomir, Groundbreaker, Spinster)
- **Nav structure finalized** — 40+ docs in navigation, Help link added to MonsterBox navbar

### Calibration
- **Dynamic webcam controls** — live camera control adjustments
- **Night mode** for webcam overlay
- **Linear actuator position slider** improvements
- **Bounds fixes** for calibration markers

---

## [6.7.6] - 2026-02-28 — Consistency Audit, CI Fixes, MkDocs & Help Link

### Consistency Audit (v6.7.1–v6.7.3)
- **Removed deprecated HTTP conversation endpoints** — Three 410 "Gone" tombstone routes (`/conversation/test`, `/conversation`, `/conversation/play`) removed from `elevenLabsApiRoutes.js`. Deleted the test file (`conversation-route.test.js`) and utility script (`simulate-conv.js`) that only targeted these dead endpoints.
- **Removed orphaned character-audio config subsystem** — Deleted `characterAudioConfigService.js`, `microphoneService.js`, and `routes/setup/characterAudio.js`. These had zero consumers (no UI, no tests, no service-to-service imports). Canonical configs remain in `aiConfigStore` (STT/TTS) and `jawAnimationSuperPowerService` (jaw).
- **Documented character ID access patterns** — Added note to `CLAUDE.md` documenting three patterns for accessing the current character ID, with `req.app.locals.config.selectedCharacter` (Pattern B) as preferred for new routes.

### CI Fixes (v6.7.4–v6.7.6)
- **Added ffmpeg to all GitHub Actions workflows** — All four CI pipelines (`ci.yml`, `node.js.yml`, `ssh-deploy.yml`, `deep-functionality-tests.yml`) now install ffmpeg, fixing the Jaw Pre-Analysis Engine test failures (`spawn ffmpeg ENOENT`).
- **Fixed jaw animation test-tts assertion** — Changed `!== null` to `!= null` guard so the test handles both `null` and `undefined` timeline responses in CI.
- **Skip hardware-dependent browser tests in CI** — `relay-toggle.spec.js` and `webcam-capture.spec.js` now auto-skip when `MB_TEST_MODE` is set, since they require Orlok hardware (char_id=3) not available in CI.
- **All 5 GitHub Actions pipelines now pass green.**

### Documentation & Help (v6.7.7)
- **MkDocs nav expanded** — Added 40+ previously unlisted documentation files to the MkDocs navigation, including character sheets, setup guides, hardware docs, integration guides, API reference, development docs, troubleshooting, and release notes.
- **Help link in navigation** — Added a Help link (question-circle icon) to the MonsterBox navbar that opens the GitHub Pages documentation site.
- **Testing docs updated** — Refreshed test file structure, counts, and CI notes to reflect current state (v6.7.6).

---

## [6.7.0] - 2026-02-28 — Jaw Animation CRUD, Calibration Unification, Audio, and System Fixes

### Jaw Animation Multi-Config CRUD
- **Multiple named jaw configs per character** — Each character can now save, load, rename, and delete multiple jaw animation configurations. The active config selector appears at the top of the Jaw Animation setup page.
- **Auto-migration** — Existing single-config `super-powers.json` files are automatically migrated to the new `configs[]` array format on first read. The existing config becomes "Default".
- **Backward-compatible API** — The existing `GET /api/jaw-animation/:charId` and `POST /api/jaw-animation/:charId` endpoints continue to work unchanged. `readJawConfig()` returns a flat config for all consumers.
- **New CRUD endpoints:**
  - `GET /api/jaw-animation/:charId/configs` — list all configs
  - `POST /api/jaw-animation/:charId/configs` — create new config (with optional clone)
  - `PUT /api/jaw-animation/:charId/configs/:configId` — update config
  - `DELETE /api/jaw-animation/:charId/configs/:configId` — delete config (cannot delete active)
  - `POST /api/jaw-animation/:charId/configs/:configId/activate` — switch active config
  - `POST /api/jaw-animation/:charId/configs/:configId/rename` — rename config
- **UI controls** — Config selector dropdown, "Save As New", "Rename", and "Delete" buttons added to the jaw animation page.

---

## [6.7.0] - 2026-02-28 — Calibration Unification, Jaw Animation, Audio, and System Fixes

### Calibration Angle Unification
- **Absolute servos now use angle (0-180°)** instead of normalized 0-1 across the entire calibration system. The calibration page, API, profiles, sweep test, and scene executor all use angle for absolute servos. Other part types (linear actuators, continuous servos) retain normalized 0-1.
- **Calibration profiles migrated** — Absolute servo bounds now stored as `minAngle`/`maxAngle` (degrees) instead of `minP`/`maxP` (normalized). Backward-compatible: `p`-based API still accepted.
- **Calibration UI updated** — Absolute servo slider shows 0-180° with degree symbol. Position display shows angle degrees. Bounds display shows angle with ° suffix.
- **Scene executor updated** — Preset resolution (`__MIN__`, `__MAX__`) reads angle bounds for absolute servos.

### Jaw Animation Fixes
- **Dashboard/Chat jaw sync** — Fixed jaw animation not working in Dashboard/Chat by pre-warming the servo daemon when jaw config is read. Previously, daemon startup lag caused frames to fall back to slow hardwareService path (~580ms per command vs <1ms daemon).
- **Ask AI fallback now jaw-synced** — The TTS fallback path in Ask AI now uses `playWithJawSync()` when jaw animation is enabled (previously used plain audio playback with no jaw movement).
- **Daemon error logging** — `playWithJawSync()` now logs a warning when the daemon fails to start instead of silently swallowing the error.

### Audio Configuration Fix
- **Microphone test 500 fix** — The `POST /setup/audio/api/test-system` endpoint for microphone testing now includes device fallback logic (tries 'default' and 'pulse' if the selected device fails) and returns JSON `success: false` instead of HTTP 500 on errors.

### Scenes Page Fix
- **Character selection** — The Scenes page (Animation Studio) now correctly loads the currently selected character instead of defaulting to PumpkinHead. Fixed by passing `currentCharacter` and `config` to content templates in the `renderWithLayout` helper.

### Log Cleanup System
- **Automatic log cleanup** — New `scripts/log-cleanup.sh` with systemd timer runs daily to prevent logs from using more than 40% of disk space. Vacuums journald to 500MB, cleans rotated logs, test artifacts, and apt cache.
- **Journald limits** — Set `SystemMaxUse=2G` and `MaxRetentionSec=30day` via journald.conf.d drop-in.
- **Initial cleanup freed ~2GB** of journal logs.

### Files Changed
- `server/calibration/adapters/AbsoluteServoAdapter.js` — Rewritten: works in angle space, `gotoAngle()` primary method, backward-compat `gotoNormalized()`
- `server/calibration/router.js` — Type-aware API: absolute servos accept/return angle, others use normalized. New `isAbsoluteServo()`, `angleToP()`, `pToAngle()` helpers
- `views/setup/calibration.ejs` — Angle-based UI for absolute servos: 0-180° slider, degree display, sweep test with angle
- `data/calibration_profiles.json` — Migrated absolute servo bounds from `minP`/`maxP` to `minAngle`/`maxAngle`
- `services/scenes/sceneExecutor.js` — `resolvePresetToAngle()` reads angle bounds for absolute servos
- `services/jawAnimationSuperPowerService.js` — Pre-warms daemon on config read, improved daemon error logging
- `routes/conversation.js` — Ask AI fallback TTS uses jaw sync
- `routes/setup/audio.js` — Microphone test with fallback, no more HTTP 500
- `server.js` — `renderWithLayout` passes `currentCharacter` and `config` to content templates
- `scripts/log-cleanup.sh` — New log cleanup script with systemd timer
- `tests/unit/calibration-unified-api.test.js` — Added angle-based tests for absolute servos

---

## [6.7.0] - 2026-02-27 — Calibration Drift Fix for Open-Loop Parts

### Bug Fixes
- **Linear actuator calibration drift** — Fixed progressive positional drift during sweep tests and repeated movements for open-loop parts (linear actuators, continuous servos). Root cause: `settleMs` (mechanical damping delay) was incorrectly added to motor drive time, causing the motor to run longer than calculated on every movement. Now `settleMs` is applied as a post-movement delay after the motor stops.
- **Sweep test re-anchoring** — Sweep tests for open-loop parts now home to a physical endstop before each cycle, resetting the position tracker and eliminating accumulated drift across cycles.

### Calibration Improvements
- **Endpoint overdrive** — When moving to positions near physical endstops (0% or 100%), extra drive time is automatically added to guarantee the actuator contacts the mechanical stop. This resets accumulated open-loop tracking error.
- **Home operation** — New `POST /api/calibration/:partId/home` endpoint drives a part to a physical endstop with generous overdrive and resets position tracking. Used internally by sweep tests and available for manual drift correction.
- **Separated drive vs settle timing** — `OpenLoopLinearAdapter.calculateDriveTime()` now returns pure motor-on time. `settleMs` is waited separately after motor stops, preventing timing contamination across movement calculations.
- **Motion planner fix** — `planner.js planTimeAtSpeed()` now returns `driveMs` and `settleMs` separately instead of combining them into `durationMs`.

### Files Changed
- `server/calibration/adapters/OpenLoopLinearAdapter.js` — Separated settle from drive time, added `home()` method, endpoint overdrive
- `server/calibration/adapters/ContinuousServoAdapter.js` — Added `home()` method, endpoint overdrive, post-movement settle delay
- `server/calibration/router.js` — Added `POST /:partId/home` endpoint, updated default settleMs to 150ms
- `server/calibration/planner.js` — Separated settle time from drive duration in `planTimeAtSpeed()`
- `views/setup/calibration.ejs` — Sweep test now homes before each cycle for open-loop parts
- `data/calibration_profiles.json` — Updated settleMs from 120ms to 150ms
- `tests/unit/calibration-unified-api.test.js` — Increased timeout to accommodate settle delays

---

## [6.7.0] - 2026-02-20 — Dashboard Enhancements, Parrot Fix & RPi Presets

### Bug Fixes
- **STT text duplication** — Fixed duplicate mic transcripts in chat log caused by both `stt_committed` (Scribe v2 Realtime) and `user_transcript` (ConvAI agent) firing for the same speech. Added client-side deduplication with a 3-second rolling window.
- **Parrot mode not working** — Added `suppressMicForCharacter()` echo suppression to prevent the server mic from re-transcribing parrot TTS playback. Enhanced `parrotSay()` with console logging and detailed error display for diagnostics.

### Dashboard Changes
- **Removed STT/TTS Config buttons** from dashboard top bar (still accessible via AI Settings page)
- **Resizable webcam panel** — Webcam card-body now supports CSS `resize: both` for horizontal and vertical resizing
- **Live Console panel** — New terminal-styled panel below webcam showing real-time MonsterBox console output. Features: 3-second auto-polling, line count selector (50/100/200/500), Live toggle, manual refresh. Green-on-black theme using `--mb-terminal-bg`/`--mb-terminal-text` CSS variables. Inherits SortableJS drag/collapse. Dashboard now has 8 sortable panels (was 7).

### System Settings
- **Console output API** — New `GET /api/system/console` endpoint reads `/var/log/monsterbox.log` and `.err` directly (the actual console.log output, not just systemd lifecycle events from journalctl)
- **Log source selector** — System > Logs tab now has a "Log Source" dropdown: Journal (systemd), Console Output (stdout), Error Output (stderr). Service dropdown disables when viewing console output.
- **RPi performance presets** — Six presets for RPi 3B, 3B+, 4B, and 5 in System > Settings > Performance Presets. CPU governor applies immediately; boot config changes (gpu_mem, arm_freq, i2c_baudrate) are documented for manual `/boot/firmware/config.txt` editing. Presets: RPi 3B Performance, RPi 3B+ Performance, RPi 4B Performance (Lifelike), RPi 4B Balanced, RPi 5 Performance (Lifelike), RPi 5 Balanced.

### Files Changed
- `views/conversation/index.ejs` — Dashboard template (buttons removed, webcam resize, console panel, dedup, parrot diagnostics)
- `services/elevenLabsWebSocketService.js` — `suppressMicForCharacter()` method
- `routes/conversation.js` — Echo suppression call after parrot TTS playback
- `services/systemService.js` — `getConsoleOutput()`, `getPerformancePresets()`, `applyPerformancePreset()`
- `routes/api/systemRoutes.js` — `/console`, `/presets`, `/presets/apply` endpoints
- `views/setup/system.ejs` — Log source selector, performance presets UI
- `tests/browser/conversation-refactor.spec.js` — Panel count updated 7 → 8

---

## [6.6.0] - 2026-02-19 — UI Consistency & Theme Compliance (Ready for Testing Gold)

### UI Theme Consistency
- **Navigation bar** — Removed hardcoded `navbar-dark bg-dark`; now uses `bg-body-tertiary` which adapts to any Bootswatch theme (light or dark)
- **Footer** — Replaced `bg-dark text-light` with theme-aware `bg-body-tertiary text-body-secondary`
- **Dashboard** — Replaced hardcoded `#000`, `#111`, `#1a1a1a` backgrounds with `var(--bs-dark)` and `var(--bs-tertiary-bg)` CSS variables
- **AI Settings** — Removed `bg-success text-white` from chat header, `bg-dark text-light` from chat log, `bg-dark border-secondary` from VU meter; all now use theme-aware variables
- **Animation Studio** — Replaced 26 hardcoded hex step-type colors with CSS variable references (`var(--mb-step-servo)`, `var(--mb-step-motor)`, etc.) from the design system. Added `--mb-step-askAI` variable. Fixed hover/active backgrounds to use `var(--bs-secondary-bg)` and `color-mix()` instead of hardcoded rgba values
- **Pose Editor** — Replaced hardcoded type badge colors with CSS variable references; removed `text-light` class assuming dark background
- **Audio/Video Libraries** — Removed `table-dark` from list view tables; tables now inherit theme styling
- **Orchestration** — Changed `btn-outline-light` to `btn-outline-secondary` for theme compatibility
- **Goblin Management** — Removed `text-dark` hardcoded on warning card
- **Setup hub** — Changed `text-dark` icon and `btn-dark` button to `text-secondary`/`btn-secondary`
- **First Run** — Changed `btn-outline-light` to `btn-outline-secondary`
- **Canvas elements** — System gauges, performance charts, and jaw animation visualization now read colors from CSS variables via `getComputedStyle()` instead of using hardcoded hex values
- **Manual Controls** — Replaced hardcoded `#6f42c1` with `var(--mb-primary)`
- **Audio Player** — Replaced hardcoded rgba primary/success colors with `color-mix()` CSS variable expressions

### Design System Updates
- Added `--mb-step-askAI: #3d0f7a` CSS variable to `monsterbox4.css`
- Fixed `--mb-step-linear-actuator` value from `#0dcaf0` to `#e83e8c` to match actual usage

### Spacing & Layout
- Reduced `mb-4` margins to `mb-2`/`mb-3` across audio library, video library, goblin management, and orchestration pages to minimize vertical scrolling

---

## [6.3.0] - 2026-02-19 — Manual Controls Panel + Jaw Animation v2

### New Feature: Manual Controls Panel
- **Spatial control surface** on dashboard (`/`) — draggable tiles for parts, poses, and audio files
- **Three tile types**: hardware parts (servo/actuator/motor/light with colored borders), poses (purple, click to execute), sounds (teal, click to play)
- **Directional controls**: floating toolbar with type-specific controls (nudge/goto for servos, extend/retract for actuators, fwd/rev for motors, toggle for lights)
- **Edit Mode**: drag items to arrange spatial layout, "Add Items" drawer shows available items
- **Named layouts**: multiple arrangements per character (Default, Scare Mode, etc.) with create/rename/delete
- **Layout persistence**: saved per-character at `data/character-{id}/manual-controls-layout.json`
- **Fire-and-forget**: all hardware commands dispatched without blocking UI for live show responsiveness
- **Parts API compatibility**: handles both raw array and `{ success, parts }` wrapper response formats
- **Character independence**: all data loaded dynamically, canvas reloads on character switch

### Previous (6.1.5): Dashboard & Animation Studio Fixes + Jaw Animation v2

### Bug Fixes
- **Fixed Parts API response format** — `GET /api/parts` returned raw array instead of `{ success, parts }` wrapper, causing Dashboard hardware panel and Animation Studio part palette to show empty. Both now display correctly.
- **Fixed Dashboard panel drag-and-drop** — Bottom row panels (Monster Features, AI On, Live Audio, etc.) are now in a single sortable column, enabling full drag-to-reorder across all Dashboard panels.
- **Fixed Animation Studio jaw/head-tracking persistence** — Jaw animation and head tracking toggles in the Animation Studio now persist to the server instead of being local-only state. Jaw toggle saves to super-powers.json; head tracking sends start/stop commands.

### Dashboard Scenes Panel Enhancements
- **Scene reorder** — Drag scenes by grip handle to reorder; order persists to scenes.json via new `/scenes/api/reorder` endpoint.
- **Scene delete** — Delete button on each scene row with confirmation dialog.
- **Loop All** — "Loop All" button enqueues all scenes and starts queue in loop mode. "Stop" button to halt the loop.
- **Playing indicator** — Shows "Looping" badge when scene loop is active.

### New Feature: Pose Editor
- **Dedicated Pose Editor page** at `/poses/editor` — full-page interface for creating and editing poses.
- Shows all controllable hardware parts (servos, motors, linear actuators, lights) with type-specific controls: angle sliders for servos, direction/speed/duration for motors and actuators, on/off + brightness for lights.
- **Test individual parts** or **test full pose** (all parts simultaneously).
- **Optional audio** — attach a sound file or TTS text to a pose.
- **Edit existing poses** — click any pose in the saved list or use the edit button in Animation Studio's pose library.
- Added to Activities navigation dropdown alongside Animation Studio.

### Jaw Animation v2: Real-Time Audio-Synchronized Jaw Control

### Persistent Servo Daemon (Phase 1)
- **New `python_wrappers/jaw_servo_daemon.py`**: Long-running Python process initializes PCA9685 I2C bus once, reads JSON commands from stdin (<1ms per command vs ~580ms per Python spawn)
- **New `services/jawServoDaemon.js`**: Node.js daemon lifecycle manager with lazy-start, auto-restart on crash, graceful shutdown
- Daemon routes servo commands through fire-and-forget stdin writes instead of spawning new Python processes per frame
- Shutdown hook added to `server.js` graceful shutdown sequence
- Falls back to `hardwareService.controlPart()` if daemon is unavailable

### Pre-Analysis Engine (Phase 2)
- **`preAnalyzeAudio()`**: Complete audio analysis before playback — eliminates reactive frame-by-frame processing
- **Bandpass filter**: ffmpeg 500-2500Hz speech formant isolation (configurable via `useBandpassFilter`)
- **AGC**: Automatic gain control normalizes peak RMS to 0.8 — no manual sensitivity tuning per audio file
- **Quantization**: Discrete jaw positions (5-20 configurable levels, default 10) for natural animatronic movement
- **20ms frames**: Matches PCA9685 50Hz PWM rate (was 50ms)
- **`playWithJawSync()`**: Synchronized audio+jaw playback with drift-correcting setTimeout scheduling

### Scene Integration (Phase 3)
- `sayThis` scene steps auto-sync jaw during TTS playback when jaw is enabled
- `askAI` scene steps auto-sync jaw during AI response playback
- `audio` scene steps optionally sync jaw with pre-recorded audio files
- `jaw-animation` enable step pre-warms daemon for zero startup delay
- Dashboard `/api/say` endpoint uses `playWithJawSync()` when jaw is enabled
- All jaw integration is non-fatal — graceful fallback to audio-only on failure

### UI Improvements (Phase 4)
- **Presets**: Speech, Music, Custom radio buttons for quick configuration
- **Speech Filter toggle**: Enable/disable 500-2500Hz bandpass filter
- **AGC toggle**: Enable/disable automatic gain control
- **Quantization slider**: 5-20 discrete jaw positions with live value display
- **Timeline canvas**: Visualizes pre-analyzed jaw positions after TTS test
- All controls in ES5 IIFE pattern per project convention

### Testing (Phase 5)
- 14 new unit tests for pre-analysis engine (frames, AGC, silence gating, quantization, guardrails, bandpass toggle)
- Updated system tests for v2 config fields and timeline response
- 7 new browser tests for v2 UI controls (presets, filter, AGC, quantization, timeline canvas)
- **255 system/unit tests passing, 190 browser tests passing, 0 failing**

### New Config Fields (backward-compatible)
- `useBandpassFilter` (default: `true`) — 500-2500Hz speech filter
- `useAGC` (default: `true`) — automatic gain control
- `quantizationLevels` (default: `10`) — discrete jaw positions
- `preset` (default: `speech`) — tuning preset

### Bug Fixes
- Fixed `stop-monitoring` endpoint not cancelling active jaw drives (caused stale `isMonitoring` state)

---

## [6.1.2] - 2026-02-16 — Audio Stack Overhaul

### Critical Bug Fixes
- **Fixed `require()` crash in ES module** — `elevenLabsWebSocketService.js` used CommonJS `require('child_process')` inside an ES module, causing runtime crash when `_filterWavForSTT()` was called. Replaced with proper ES `import { spawn }` at top of file.
- **Fixed duplicate `moveSinkInput`** — `pipewireService.js` had a second definition (using `wpctl set-default` which sets the global default) shadowing the correct first definition (using `wpctl move`). Removed the incorrect duplicate.
- **Fixed PipeWire sink/source listing** — `parseWpctlSinks()` checked `line.includes('Audio') && line.includes('Sinks:')` but wpctl status puts these on separate lines, so the parser never found any sinks and always fell back to placeholder "Default Output"/"PulseAudio Output". Rewrote parser to correctly handle wpctl's tree-drawing format with `│├└─` characters and `*` default markers.

### Audio Configuration Standardization
- **Sample rate**: Standardized to 16000 Hz across `elevenLabsConfigService`, `elevenLabsSTTService` transcription preset, and `microphoneService` format default
- **VAD threshold**: Unified to 0.40 across `characterAudioConfigService`, `serverSTTListener` (was 0.03/0.5 in various places)
- **Microphone format**: Fixed default from `float32` to `pcm_s16le` in `microphoneService` to match actual capture pipeline
- **Playback volume**: Added `DEFAULT_VOLUME = 85` constant in `serverPlaybackService`, replaced all scattered 80/85/90 defaults
- **Speaker device field**: Canonicalized to `config.audioDeviceId` across all data files and services (was `device`, `deviceName`, `outputDevice` in various places)
- **STT format**: Fixed character-3 STT config from `mp3` to `wav`

### VU Meter Unification
- Replaced HTTP polling VU meter on STT page (`fetch('/setup/audio/api/audio-levels')` at 500ms interval spawning Python each time) with WebSocket-driven push (receives `audio_level` messages from existing WS connection)
- Auto-decay timer (800ms) matches Chat page behavior
- Color-coded bars: green (<40%), warning (40-70%), danger (>70%)

### Error Handling Improvements
- **TTS error extraction**: Fixed arraybuffer response parsing — ElevenLabs error details (e.g., "quota_exceeded: You have 1 credits remaining") were lost because `error.response.data.detail` returns undefined on a Buffer. Added `_extractError()` helper to decode Buffer error bodies.
- **Security fix**: Stopped dumping full axios error objects (which include API key in request headers) to console.error. Now only logs the extracted error message.
- **UI error surfacing**: TTS page now shows actual error messages ("quota_exceeded: ...") instead of generic "TTS generation failed (HTTP 401)"

### WebSocket Port Centralization
- Added `data-ws-port="8795"` attribute on `<body>` in `master.ejs`
- Updated 5 client files (`ai-settings.js`, `ai-settings-stt.js`, `websocket-chat.js`, `mic-panel.js`, `orchestration/index.ejs`) to read port from DOM attribute instead of hardcoding

### Data File Updates
- Normalized speaker `config.audioDeviceId` in `data/parts.json` and all `data/character-*/parts.json` files
- Updated `calibration.ejs` edit form to write canonical field names for speakers and microphones

## [6.1.1] - 2026-02-16 — Bootswatch Themes, PIR Sensor Fix, Calibration Refactor

### Bootswatch Theme Gallery
- Added 17 Bootswatch theme CSS files (Bootstrap 5.3.2 replacements) to `public/vendor/bootswatch/`
- Light themes: cerulean, cosmo, flatly, journal, litera, lux, minty, sandstone, united, yeti
- Dark themes: cyborg, darkly, quartz, slate, solar, superhero, vapor
- Visual theme gallery on System page with color swatches, dark/light badges, live preview
- Conditional CSS loading in `master.ejs` — Bootswatch themes replace default Bootstrap CSS
- Theme API (`POST /api/config/theme`) expanded to validate all 19 themes (2 default + 17 Bootswatch)
- Legacy `dark`/`light` values mapped to `default-dark`/`default-light` in both API and templates
- Custom `monsterbox4.css` dark overrides scoped to `html[data-mb-theme="default-dark"]` only

### PIR Motion Sensor Fix
- Fixed `/api/parts/:id/test` route path — was double-nested causing 404 errors
- Parts test endpoint now dispatches by part type using hardware service controllers
- `motion_sensor` parts call `HARDWARE_CONTROLLERS.motion_sensor.read()` and `.detectMotion()`
- Returns `testResult` object matching calibration UI expectations (`motionDetected`, `detections`)
- Parts API made character-aware (reads from `data/character-{id}/parts.json`)
- Servo, light, and linear actuator test dispatchers also added

### Calibration Panel Refactor
- Calibration UI (right panel, simple calibration card, sweep test button) hidden for non-movement parts
- Only shown for `servo`, `linear_actuator`, `motor`, `stepper`
- Center panel expands from `col-xl-6` to `col-xl-9` when calibration is hidden
- Non-movement parts (webcam, microphone, speaker, light, LED, motion_sensor, head_tracking) show controls only

### Testing
- Added system tests for parts API type-aware dispatch (motion sensor read/detect, theme validation)
- Added browser tests for calibration panel visibility based on part type
- **386+ passing** (160 system + 226 unit), 174 browser, 2 pre-existing failures

## [6.1.0] - 2026-02-16 — Animation Studio

### Animation Studio
- **Unified three-panel interface** at `/scenes` replaces separate Scenes list, Scene Editor, and Poses pages
- Left panel: Scene Library (searchable), Pose Library (grouped by category), Queue (full playback controls)
- Center panel: Timeline editor with color-coded step blocks, inline edit forms, SortableJS drag-reorder
- Right panel: Webcam live preview, Part Palette (grouped by type), Action palette for quick step adds
- Toolbar: New Scene, New Pose, Save (Ctrl+S), Play, Stop, Jaw Animation toggle, Head Tracking toggle, Emergency Stop
- Drag-and-drop: palette to timeline, scenes to queue, poses to timeline as steps
- Queue controls: Play, Loop, Pause, Resume, Skip, Clear, Save as Story
- 14 step types with type-specific inline edit forms and color-coded blocks

### New Scene Step Types
- **jaw-animation**: Enable/disable jaw animation sync during scene playback (non-fatal if unconfigured)
- **head-tracking**: Start/stop webcam-based head tracking during scenes (non-fatal if hardware unavailable)
- Both integrated into `sceneExecutor.js` with graceful degradation

### Route Consolidation
- `/scenes` now renders Animation Studio (`views/scenes/studio.ejs`) with full-width layout
- `/setup/poses` redirects to `/scenes` (API endpoints preserved)
- `/poses` HTML requests redirect to `/scenes` (JSON API preserved)
- `/scenes/edit/:id` redirects to `/scenes?edit=id`
- Navigation updated: single "Animation Studio" entry under Activities (replaces Poses + Scenes)

### Testing
- Added 10 new system tests for jaw-animation and head-tracking step types
- Updated 18 browser tests for Animation Studio UI (three-panel layout, toolbar, toggles, redirects, APIs)
- Updated basic test for poses redirect (302 instead of 200)
- **174 passing** (browser + system + unit), 7 skipped, 2 pre-existing failures

## [6.0.0] - 2026-02-14 — Character Independence & Dynamic Versioning

### Character Independence
- Removed all hardcoded character names (Orlok, PumpkinHead, Sir Dragomir, Mina) from services, controllers, routes
- Removed all numeric ID defaults (`|| 1`, `|| 3`, `|| 4`) — missing characterId now returns 400 errors
- Generalized ElevenLabs agent template (removed Orlok-specific template)
- Removed character-name comments from quick response agent ID keys
- Cleaned up character-specific comments in STT, jaw animation, and filter presets

### Dynamic Versioning
- All version displays now sourced from `package.json` (single source of truth)
- Server health endpoint uses `pkg.version` instead of hardcoded string
- EJS templates use `res.locals.appVersion` middleware for dynamic version in titles, footers, and navigation
- Server startup log includes dynamic version
- Removed hardcoded "5.5" from all JS services, routes, public scripts, shell scripts, and install tooling

### AI Service Audit
- Audited TTS, STT, and AI implementations for duplication
- Confirmed single canonical TTS service (`elevenLabsTTSService.js`)
- Confirmed three distinct STT approaches (batch, polling, WebSocket) — no consolidation needed
- No duplicate AI service code found

### Documentation
- Updated README.md with v6.0.0 release notes
- Updated CHANGELOG.md with v6.0.0 entry
- Created `docs/v6-phase1-checklist.md`, `docs/v6-phase2-ai-audit.md`, `docs/v6-deferred.md`

### Test Results
- 140 passing, 1 failing (pre-existing jaw-animation hardware timeout), 7 skipped

## [5.5.2] - 2026-02-12 — Jaw Animation Sync Fix

### Jaw Animation
- **ChatterPi-inspired sync fix**: Restructured `driveJawFromAudioBuffer()` to compute angle synchronously in each audio frame — eliminates async gap that caused polling to read stale/zero angles
- Preload config, parts, and guardrails once before frame loop (no per-frame async lookups)
- Fire-and-forget servo commands (non-blocking, like ChatterPi's `self.jaw.angle = jawTarget`)
- Attack/release envelope ramp limiting in `calculateJawAngle()` for natural jaw motion
- Tuned default parameters: sensitivity=4, smoothing=0.2, attackTime=30, releaseTime=80
- Fixed double-nested `super-powers.json` bug (`jawAnimation.jawAnimation.{...}` → `jawAnimation.{...}`)
- Added `simulateJawDrive()` for test mode operation without hardware
- Improved audio level meter scaling (audio: ×400, jaw: sqrt curve)
- Added cache-busting to client JS (`?v=<%= Date.now() %>`)

### Documentation
- Added Jaw Animation section to README with algorithm description, config table, and API examples
- Updated CHANGELOG with v5.5.2 release notes

## [5.5.1] - 2026-02-07 — Gold Release

### ElevenLabs AI Overhaul
- Upgraded TTS default to `eleven_flash_v2_5` (~75ms latency) across all services
- Upgraded STT default to `scribe_v2` for batch transcription
- Created `scribe_v2_realtime` WebSocket STT service (~150ms streaming latency)
- Implemented per-character TTS config via `getTTSConfigForCharacter(characterId)` in `aiConfigStore.js`
- Each character stores voice/model settings in `data/character-{N}/ai-config/tts-config.json`
- Replaced HTTP loopback calls with direct `elevenLabsTTSService` + `serverPlaybackService` calls
- Scene "Ask AI" steps now use real ElevenLabs Conversational AI agents
- Removed all legacy model aliases (`scribe_v1`, `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1`)

### Dashboard Consolidation
- `/conversation` route now redirects to `/` — conversation IS the dashboard
- Jaw Animation moved to dedicated page at `/setup/jaw-animation`
- Simplified navigation: Dashboard, Live, Setup subpages

### Test Fixes
- Fixed `conversation.spec.js` to navigate to `/` instead of `/conversation`
- Fixed `conversation-refactor.spec.js` to expect "Dashboard" heading
- Fixed `jaw-animation.spec.js` to enable jaw toggle before slider interaction tests
- Fixed `setup-parts.spec.js` to check DOM-attached elements instead of visibility
- Fixed `test-hardware-fix.js` broken import path

### Documentation
- Complete README rewrite with gold release notes and test results table
- Created CHANGELOG.md (this file)
- Rewrote all AI/ElevenLabs documentation (5 doc files)
- Updated test documentation (3 files)
- Removed legacy model options from TTS UI dropdown
- Removed legacy STT compatibility code from `elevenLabsSTTService.js`
- Archived outdated STT format report
- Updated all version references from 5.0/5.2 → 5.5
- Updated SESSION_PROMPT.md with current architecture
- Archived stale v5.4.0 QUICK_START_NEXT_AGENT.md

### Test Results (257 total)
- **Mocha**: 148 passing, 34 pending, 6 failing (jaw calibration — hardware-environment-dependent)
- **Playwright**: 109 passing, 7 skipped (deprecated), 0 failing
- Stepper motors verified via real GPIO (lgpio backend)
- All ElevenLabs service tests passing
- All scene execution tests passing

## [5.5.0] - 2025-12-15

### Major Features
- Models system: reusable default configurations per part type
- Calibration UI redesign with Model/Overrides tab
- ContinuousServoAdapter for head-on-swivel servos
- Comprehensive Playwright deep testing framework (8 test suites)
- Orchestration hardening with per-animatronic and global timeouts

### Hardware
- Linear actuator calibration with min/max positioning
- BTS7960 H-bridge motor driver support
- Power toggle integration for hardware safety
- Stepper motor support via Python CLI wrapper

### Goblin Video System
- MPV-based video playback for Pi 3B+/4B display units
- Queue management with loop modes
- REST API for remote control and immediate playback
- Playlist CRUD and distribution (Facehugger deployment)
- MonsterBox Step integration for video triggers

### Infrastructure
- GitHub Actions CI/CD for automated testing
- Dedicated test port (3123) for CI isolation
- MB_TEST_MODE environment flag for safe testing
- PipeWire/WirePlumber audio system (replaced ALSA/PulseAudio)

## [5.4.0] - 2025-10-20

### Features
- Goblin system standardization
- Console blanker for kiosk display
- Video dropdown in Goblin management UI
- Multi-animatronic deployment tooling

## [5.3.0] - 2025-09-15

### Features
- Conversation mode with AI chat interface
- Webcam streaming via mjpg-streamer
- Scene orchestration engine
- Pose management system

## [5.2.0] - 2025-08-01

### Features
- Initial ElevenLabs TTS/STT integration
- Noisy environment STT presets
- Groundbreaker character setup
- Audio library management

## [5.0.0] - 2025-06-01

### Initial Release
- Single-node animatronic control system for Raspberry Pi 4B
- Express/EJS web application
- Hardware service layer for servos, motors, LEDs, sensors
- Character and parts CRUD
- Basic GPIO control via pigpio
