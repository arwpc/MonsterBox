# MonsterBox Stability Audit — July 2026

**Base version:** 8.3.0 → **8.3.1**
**Method:** A 14-subsystem, adversarially-verified audit of the whole application
(server, routes, services, controllers, Python wrappers, client JS). Each subsystem
was swept for a fixed set of defect classes (crashes, resource leaks, races,
RPi-stability, security, correctness, error-handling, character-independence, data
integrity, Python robustness); every candidate finding was then re-checked by an
independent skeptic before being accepted.

This complements the April 2026 [STABILIZATION-RESULTS](STABILIZATION-RESULTS.md) pass,
which built *structural guardrails* against character-leakage but explicitly deferred
general bug-fixing. This pass is that bug-fix pass.

## Result

- **75** raw findings → **58** survived adversarial verification (17 rejected as
  false positives / intended behavior).
- **2 critical, 14 high, 21 medium, 21 low.**
- **55 fully fixed · 2 corruption-fixed (lost-update serialization deferred) ·
  1 intentionally unchanged.**
- Shipped as focused commits (v8.3.1). Unit **168/0**, system green (the single system
  failure is `audio-setup` dry-run capture, which needs a real microphone not present
  in the audit environment), pact **54/0**. Schema / resolver / independence gate audits
  stay clean.

### Note on browser tests in a hardware-less environment

The unit / system / pact tiers are the authoritative validation for cloud sessions and
cover the same endpoints the browser specs drive. The full Playwright suite
(`npm run test:browser`) is intended for the RPi (or a live production server with real
hardware, audio, and a display) — `actual-usage-testing.spec.js` and
`exhaustive-system-test.spec.js` in particular target `npm run test:actual-usage`'s
live-server mode. In a hardware-less container the suite runs long and its
audio/PipeWire/webcam/AI-chat assertions fail environmentally (the same reason the one
system failure above fails), and the WirePlumber-less `AudioHealthMonitor` adds constant
log noise. The core, test-mode-friendly specs do pass here: `scenes.spec.js` (the scene
CRUD surface for #44) ran clean. Run the full browser suite on the target hardware.

### Highest-impact fixes

- **Security:** closed two path-traversals (arbitrary file read/delete via image
  endpoints), an unauthenticated **OS command injection** (`journalctl --since`),
  SSH key deploy/generate injection, an unauthenticated **path-traversal + OOM** in
  `/api/play-audio`, guarded the destructive reboot/shutdown endpoints (CSRF-safe +
  optional token), bound the always-on test port to loopback (was re-exposing the whole
  app over plaintext HTTP to the LAN), and moved SSH creds off the process table / into
  an env var.
- **Boot crash:** the server no longer dies at startup when the ElevenLabs API key is
  unconfigured (it took down *all* functionality over a missing AI key).
- **Broken features:** Goblin video + playlist deployment never worked (un-awaited
  `getGoblin()`); deployment copied from a non-existent directory.
- **RPi stability:** removed unbounded SD-card growth (telemetry), SD thrash + a
  log-losing race (scene analytics), a queue busy-loop, a python3 spawn storm, and
  added missing timeouts (Goblin fetch, one-shot audio playback).
- **Data integrity & character-independence:** introduced a shared
  `services/atomicStore.js` (temp-file+rename writes + a promise-chain mutex) and routed
  the boot-critical JSON files (scenes, poses, super-powers, parts, app-config,
  calibration) through it; **character-scoped the calibration & actuator-position stores**
  (#5) so one character's calibration can no longer overwrite another's servo bounds.

## Full findings

| # | Sev | Category | Location | Finding | Status |
|---|-----|----------|----------|---------|--------|
| 1 | critical | security | `routes/api/characterImagesRoutes.js:57` | Path traversal → arbitrary file read via character image endpoint | ✅ Fixed |
| 2 | critical | security | `services/systemService.js:176` | Unauthenticated OS command injection via `since` param in service logs endpoint | ✅ Fixed |
| 3 | high | security | `routes/api/characterImagesRoutes.js:92` | Path traversal → arbitrary file deletion via image DELETE endpoint | ✅ Fixed |
| 4 | high | security | `routes/conversation.js:439` | Unauthenticated path traversal + OOM DoS in /api/play-audio (user-controlled filename → fs.readFile) | ✅ Fixed |
| 5 | high | character-independence | `server/calibration/store.js:4` | Calibration and actuator-position stores are global (keyed by partId only), corrupting data across characters | ✅ Fixed |
| 6 | high | crash | `services/audioLoopService.js:142` | Spawned audio child processes lack an 'error' handler → uncaught exception crashes server on spawn failure | ✅ Fixed |
| 7 | high | security | `services/characterImageService.js:42` | Path traversal in character image delete/read — arbitrary file deletion and read via :filename param | ✅ Fixed |
| 8 | high | crash | `services/elevenLabsTTSService.js:13` | TTS/STT/WebSocket service singletons throw at import time when ElevenLabs key is unconfigured → server fails to boot | ✅ Fixed |
| 9 | high | correctness | `services/goblinPlaylistService.js:228` | getGoblin() Promise never awaited in deployPlaylist — playlist deployment always fails for every target | ✅ Fixed |
| 10 | high | correctness | `services/goblinVideoService.js:22` | getGoblin() Promise never awaited — all Goblin video scan/play/status/stop operations always report 'offline' | ✅ Fixed |
| 11 | high | character-independence | `services/jawAnimationSuperPowerService.js:33` | Jaw config read/write ignores requested characterId, corrupting the globally-selected character's data | ✅ Fixed |
| 12 | high | rpi-stability | `services/movement/movementTelemetry.js:80` | Telemetry flush re-reads, merges, and rewrites the entire growing telemetry file to the SD card every 30s | ✅ Fixed |
| 13 | high | data-integrity | `services/movement/transitionEngine.js:326` | transitionEngine calls record() with wrong argument order/count, corrupting telemetry and polluting the ring buffer | ✅ Fixed |
| 14 | high | rpi-stability | `services/scenes/sceneExecutor.js:930` | Scene analytics rewrites the whole file twice on every scene execution — SD-card thrash in queue/armed loops and a cross-character read-modify-write race that loses logs | ✅ Fixed |
| 15 | high | rpi-stability | `services/scenes/sceneQueue.js:135` | run_for_duration / loop_until_disabled re-execute the scene with no inter-iteration delay — busy-loop / spawn storm when a scene completes quickly | ✅ Fixed |
| 16 | high | security | `services/systemService.js:343` | SSH key deploy/generate endpoints allow shell/argument injection | ✅ Fixed |
| 17 | medium | data-integrity | `controllers/webcamModelsController.js:12` | Webcam models stored in two different files by two active controllers (split-brain) | ✅ Fixed |
| 18 | medium | character-independence | `routes/api/partsApi.js:73` | /api/parts ignores query characterId and type, breaking character-independence | ✅ Fixed |
| 19 | medium | security | `routes/api/systemRoutes.js:471` | Unauthenticated destructive control endpoints (reboot/shutdown/restart/optimize) | ✅ Fixed |
| 20 | medium | security | `routes/setup/jaw-animation.js:138` | Unvalidated characterId route param flows into config file path (write) for jaw/head animation | ✅ Fixed |
| 21 | medium | security | `server.js:847` | Full application exposed over plaintext HTTP on port 3100 in production, bypassing HTTPS | ✅ Fixed |
| 22 | medium | rpi-stability | `services/AudioHealthMonitor.js:117` | AudioHealthMonitor permanently disables self-recovery after 5 lifetime restart attempts | ✅ Fixed |
| 23 | medium | leak | `services/elevenLabsRealtimeSTTService.js:177` | Scribe v2 Realtime auto-reconnect resurrects an orphaned session, leaking the WebSocket and keepalive interval | ✅ Fixed |
| 24 | medium | error-handling | `services/elevenLabsWebSocketService.js:1658` | askAgentQuestion promise never settles (and leaks a session) if the ElevenLabs WS stalls in CONNECTING | ✅ Fixed |
| 25 | medium | correctness | `services/goblinDeploymentService.js:21` | Facehugger deployment copies from non-existent 'goblin-system' directory — every deploy fails at file transfer | ✅ Fixed |
| 26 | medium | rpi-stability | `services/goblinManagerService.js:408` | Native fetch() 'timeout' option is silently ignored — request handlers hang on unresponsive Goblins | ✅ Fixed |
| 27 | medium | correctness | `services/hardwareService/index.js:677` | GPIO continuous-servo rotateContinuous silently drops the duration parameter | ✅ Fixed |
| 28 | medium | data-integrity | `services/jawAnimationSuperPowerService.js:223` | Non-atomic writes to super-powers.json corrupt character config on power loss; concurrent read-modify-write clobbers updates | ✅ Fixed |
| 29 | medium | security | `services/orchestrationService.js:30` | Hardcoded SSH password embedded in shell commands (credential exposure + visible in process list) | ✅ Fixed |
| 30 | medium | data-integrity | `services/poses/poseRepository.js:76` | Non-atomic full-file rewrite of poses.json risks total data loss on interrupted write (RPi SD/power loss) | ✅ Fixed |
| 31 | medium | rpi-stability | `services/randomPoseService.js:131` | Random-pose safety amplitude scaling is a no-op; servos move at full range during conversation | ✅ Fixed |
| 32 | medium | correctness | `services/resource/memoryMonitor.js:58` | Memory monitor's single cooldown timer lets a WARNING suppress the subsequent CRITICAL log, hiding the pre-OOM alert | ✅ Fixed |
| 33 | medium | race | `services/resource/singleInstance.js:26` | isProcessRunning() treats EPERM (process exists, owned by another user) as 'not running', letting a second instance start | ✅ Fixed |
| 34 | medium | correctness | `services/scenes/armedModeService.js:208` | Armed-mode scene timeout does not cancel the running scene — next scene starts while the timed-out one is still driving hardware | ✅ Fixed |
| 35 | medium | error-handling | `services/scenes/sceneExecutor.js:881` | Concurrent-step failures are swallowed — scene (and analytics) report success:true while a hardware step silently failed | ✅ Fixed |
| 36 | medium | data-integrity | `services/scenes/scenesService.js:29` | scenes.json written non-atomically with no serialization — power loss corrupts the entire scene library; concurrent edits lose data / duplicate IDs | ✅ Fixed |
| 37 | medium | rpi-stability | `services/serverPlaybackService.js:461` | One-shot AI playback processes have no timeout — a blocked audio device hangs the request indefinitely | ✅ Fixed |
| 38 | low | correctness | `controllers/charactersController.js:19` | charactersController getAll() references undefined __dirname in ESM — management branch is dead code | ✅ Fixed |
| 39 | low | race | `controllers/webcamController.js:278` | Unserialized read-modify-write of parts.json in setControls can clobber concurrent edits | 🟢 Atomic write applied; cross-writer parts.json lost-update serialization deferred (very low impact, single operator) |
| 40 | low | error-handling | `public/js/dashboard.js:1642` | Scene play button spinner is never restored when the play request throws, leaving the button stuck spinning | ✅ Fixed |
| 41 | low | error-handling | `python_wrappers/gpio_read.py:8` | gpio_read.py has no error handling: a failed read silently disables motion detection and leaks the mmap/fd on exception | ✅ Fixed |
| 42 | low | rpi-stability | `python_wrappers/webcam_cli.py:59` | webcam_cli capture writes a JPEG to /tmp on every call and never deletes it | ✅ Fixed |
| 43 | low | security | `routes/api/audioLoopRoutes.js:56` | Audio-loop start plays arbitrary local file path from user input | ✅ Fixed |
| 44 | low | character-independence | `routes/scenes/api.js:379` | Scene CRUD writes ignore resolved characterId, reading/writing the globally selected character's scenes.json | ✅ Fixed |
| 45 | low | race | `routes/scenes/api.js:314` | Concurrent scene create/edit produces duplicate scene IDs and lost updates (unserialized read-modify-write) | ✅ Fixed |
| 46 | low | security | `routes/setup/calibration.js:87` | Path traversal (read) via unvalidated characterId query in calibration parts loader | ✅ Fixed |
| 47 | low | race | `routes/setup/jaw-animation.js:173` | Concurrent writes to super-powers.json clobber each other (jaw vs head config lost update) | 🟢 Atomic write applied; jaw↔head simultaneous-save lost-update serialization deferred (very low impact) |
| 48 | low | error-handling | `server.js:600` | Body-parse recovery middleware references undefined partsController (dead, silently swallowed) | ✅ Fixed |
| 49 | low | rpi-stability | `server.js:822` | Perf-monitor setInterval logs every 5s forever and is never cleared on shutdown | ✅ Fixed |
| 50 | low | rpi-stability | `server/calibration/router.js:333` | Synchronous fs.writeFileSync on the calibration move path blocks the event loop | ⚪ Not changed — audit verifier deemed it optional; sync markMoving/markCleanShutdown are intentional for crash-recovery durability |
| 51 | low | race | `server/calibration/store.js:31` | Read-modify-write race in JSON calibration store clobbers concurrent profile updates | ✅ Fixed |
| 52 | low | data-integrity | `services/configService.js:26` | updateSelectedCharacter write is non-atomic and read-modify-write races | ✅ Fixed |
| 53 | low | security | `services/goblinDeploymentService.js:130` | testSSHConnection exposes SSH password via `sshpass -p` argv | ✅ Fixed |
| 54 | low | rpi-stability | `services/lurkMotionWatcherService.js:158` | Lurk motion watcher spawns a python3 process every poll interval indefinitely | ✅ Fixed |
| 55 | low | race | `services/movement/idleLoopService.js:141` | Idle-loop servo transitions are not cancellable and keep driving servos after stop() | ✅ Fixed |
| 56 | low | correctness | `services/movement/servoCommandBuffer.js:101` | queueTransitionSequence unconditionally overwrites a higher-priority pending command, defeating the priority system | ✅ Fixed |
| 57 | low | race | `services/poses/poseRepository.js:105` | Concurrent pose add/update/delete produces duplicate pose IDs and lost updates | ✅ Fixed |
| 58 | low | rpi-stability | `services/resource/singleInstance.js:41` | Stale-PID removal never verifies the PID belongs to MonsterBox; a reused PID after reboot causes a false 'already running' and blocks startup | ✅ Fixed |

## Notes on the non-"fully-fixed" items

### #39 / #47 — cross-writer lost-update races (LOW, corruption already fixed)

Both write sites are now **atomic** (no torn files on power loss). The residual is a
*lost update* only if two subsystems write the same file at the exact same moment
(webcam controls vs. another parts.json writer; jaw config vs. head config for one
character) — implausible for a single operator. Full cross-writer serialization via the
new `withFileLock` helper is a low-value follow-up.

### #50 — Synchronous `fs.writeFileSync` on the calibration move path (NOT CHANGED)

The audit's own verifier judged this optional: `actuatorPositionStore`'s
`markMoving`/`markCleanShutdown` are intentionally synchronous so crash-recovery state
is durable even if the process dies mid-move. The writes are small and infrequent. Left
as-is by design.

## How #5 was resolved (character-scoped stores)

`data/calibration_profiles.json` and `data/actuator-positions.json` were single global
files keyed solely by `String(partId)`, but **part IDs are not globally unique** — e.g.
character-1 and character-3 both define a part id 5 referring to different physical
hardware. Calibrating part 5 on one character overwrote the other's profile, and the next
move used the wrong bounds — a potential mechanical-damage path.

The fix keys entries by `${characterId}:${partId}`. The character defaults to the node's
selected character (a node runs one character), resolved from config and cached (2s) to
avoid SD reads on the hot path; callers that know the character may pass it explicitly.
Reads fall back to a legacy bare-`partId` entry, so existing calibration data keeps
working until a part is re-calibrated — making the change strictly non-regressive. No
runtime caller changes were needed because every reader (calibration router, scene
executor, hardware service, jaw/head) already operates on the selected character.
Verified by `tests/unit/calibration-character-scope.test.js` (isolation, legacy fallback,
scoped-over-legacy precedence, scoped delete). On-hardware validation (calibrate the same
partId on two characters and confirm each drives to its own bounds) is still recommended.

## How #44 was resolved (scene CRUD honors resolveCharacter)

Scene routes already resolved the character via `getCurrentCharacterId(req)` (honoring an
explicit `?characterId`), but `scenesService` ignored it and used the selected character.
An optional `characterId` was threaded through the service and passed at every scene-route
call site; it is backward-compatible (callers that pass no id use the selected character).

## Operational notes (new environment variables)

- **`MB_ADMIN_TOKEN`** (optional): if set, the destructive `/api/system`
  reboot/shutdown/restart-service/optimize endpoints require an `x-mb-admin-token`
  header. If unset, those endpoints still reject cross-origin browser (CSRF) requests but
  remain available to the same-origin operator UI and on-box callers.
- **`MONSTERBOX_SSH_PASSWORD`** (recommended): the inter-node control password now reads
  from this env var (falling back to the previous literal). **Action:** put it in each
  node's `.env` and **rotate the credential** — it was committed to git history. Prefer
  key-based auth long-term.

## New shared utility

`services/atomicStore.js` — `writeJsonAtomic(path, value)` (SD-safe temp-file+rename) and
`withFileLock(key, fn)` (promise-chain mutex). Use these for any new persistence of
JSON data files rather than a bare `fs.writeFile`.
