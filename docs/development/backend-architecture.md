# MonsterBox Backend Architecture

## Overview

MonsterBox is a single-node Node.js/Express application with EJS templating that
controls animatronic hardware from a Raspberry Pi 4B. The backend orchestrates
character data, scene/pose execution, AI voice services, and hardware control.
Hardware is driven by Python scripts invoked through Node `child_process`, not by
in-process GPIO libraries. Reliability on SD-card storage is a first-class
concern, so state persistence uses atomic writes and per-file locks.

## Technology Stack

### Core Framework
- **Node.js**: `>=18.0.0` (see `engines` in `package.json`), ES modules (`"type": "module"`)
- **Express.js**: `^4.18.2` web application framework
- **EJS**: `^3.1.9` templating engine (master layout in `views/layouts/master.ejs`)

### Runtime Dependencies (`package.json`)
The complete runtime dependency set is small and deliberate:
- **axios** `^1.15.0` — HTTP client (AI/service calls)
- **ejs** `^3.1.9` — view templating
- **express** `^4.18.2` — web framework
- **form-data** `^4.0.4` — multipart bodies for outbound uploads
- **multer** `^2.1.1` — multipart/form-data (file upload) handling
- **music-metadata** `11.12.3` — audio file metadata parsing
- **node-fetch** `^3.3.2` — fetch in Node contexts
- **ws** `^8.18.3` — WebSocket server for the real-time AI chat channel

There is **no** `dotenv`, `express-session`, `winston`, `i2c-bus`, `onoff`, or
`mpg123` dependency. Logging is via `console`; there are no Node GPIO/I2C
libraries.

### Hardware Integration
- Hardware control lives in Python CLIs under `python_wrappers/`
  (`servo_cli.py`, `motor_cli.py`, `led_cli.py`, `light_cli.py`,
  `linear_actuator_control.py`, `stepper_cli.py`, `sensor_cli.py`,
  `pca9685_control.py`, `jaw_servo_daemon.py`, `head_tracking_cli.py`,
  `webcam_cli.py`, `microphone_cli.py`, `speaker_cli.py`, ...).
- Node calls them via `child_process.spawn` through the centralized helper
  `services/hardwareService/exec.js` (`runPy(args, options)`), which defaults to
  `/usr/bin/python3` and the `python_wrappers/` directory with a 30 s timeout.
- The `services/hardwareService/` layer (`servo.js`, `motor.js`, `actuator.js`,
  `stepper.js`, `light.js`, `pca9685.js`, `index.js`) wraps these CLIs into a
  typed hardware abstraction.

### Version Management
The version is the single source of truth in `package.json` (`8.4.0` at time of
writing) and is read dynamically — `server.js` loads it via `createRequire` and
exposes it on `/health` and `res.locals.appVersion`. It is never hardcoded.

## Application Structure

### Entry Point (`server.js`)

`server.js` is the Express app entry point (`package.json` `main`). It is an ES
module executed top-to-bottom with top-level `await`.

#### Startup Sequence
1. **Imports**: route modules and services are imported statically at the top;
   `package.json` is loaded via `createRequire` for the version string.
2. **Global safety handlers**: `uncaughtException` and `unhandledRejection` are
   logged but do **not** crash the process — an animatronic should stay up.
3. **Resource management (optional, dynamic imports, non-fatal)**: single-instance
   PID lock (`services/resource/singleInstance.js`), process-priority elevation,
   environment detection, startup health check, and a `MemoryMonitor` (30 s).
4. **Configuration**: `loadConfig()` reads `config/app-config.json` (falls back to
   `{ port: 3000, theme: 'dark', selectedCharacter: null }`).
5. **Hostname → character auto-select**: `getHostnameCharacterId()` maps the host
   to a `characterId` via `config/animatronics.json`; if it differs from the
   stored selection, `updateSelectedCharacter()` persists it. `selectedCharacter`
   is then authoritative in memory (`app.locals.config`).
6. **Port**: `process.env.PORT` or `config.port`, default `3000`.
7. **Startup schema validation**: `services/schemaValidator.js` validates each
   character's data files. Failures never crash; they are recorded on
   `app.locals.subsystemHealth` so routes can degrade gracefully.
8. **Middleware** (see below).
9. **Route mounting** (see below), plus a `printRoutes()` debug dump.
10. **Error handlers**: optional test-mode 5xx downgrade, a generic 500 JSON
    handler, and a 404 handler that renders the error view.
11. **Server start**: if `certs/server.key` + `certs/server.cert` exist the primary
    port serves **HTTPS**, otherwise plain **HTTP**, bound to `0.0.0.0:PORT`.
12. **`onServerReady()`**: starts the WebSocket AI-chat server, `AudioHealthMonitor`,
    jaw-animation audio integration, movement telemetry auto-flush, the system
    performance collector, and a console perf monitor.
13. **Test-port listeners**: an always-on loopback HTTP listener on `3100`
    (Mocha system tests); `TEST_PORT` adds an extra listener (Playwright, `3200`).
14. **Graceful shutdown**: `SIGTERM`/`SIGINT`/`SIGHUP` trigger `gracefulShutdown()`.

#### Middleware Stack (in registration order)
1. `express.json({ limit: '50mb' })` and `express.urlencoded({ extended: true, limit: '50mb' })`
2. `express.static('public')` and `/data` static (character images/media)
3. EJS view engine + `views/` directory
4. `/health` readiness endpoint (returns status + dynamic version)
5. `res.renderWithLayout()` helper that wraps content templates in
   `views/layouts/master.ejs`
6. Structured error-stats capture and `/__errors` inspection endpoints
7. **Per-request character/context middleware**: reloads non-character config from
   disk, keeps the in-memory `selectedCharacter` authoritative, and populates
   `res.locals` (`currentCharacter`, `currentCharacterName`, image, `appVersion`)

There is no session middleware; the server holds no per-user session state.

### Route Architecture

Routes live under `routes/` (plus the calibration router under `server/`). The
real tree is:

```
routes/
├── aiSettingsRoutes.js       # /ai-settings
├── audioLibrary.js           # /audio-library
├── conversation.js           # /conversation
├── firstRun.js               # /first-run
├── goblinManagement.js       # /goblin-management
├── orchestration.js          # /orchestration (web UI)
├── videoLibrary.js           # /video-library
├── api/
│   ├── audioLoopRoutes.js        # /api/audio-loop
│   ├── characterImagesRoutes.js  # /api
│   ├── configRoutes.js           # /api/config
│   ├── elevenLabsApiRoutes.js    # /api/elevenlabs
│   ├── movement.js               # /api/movement
│   ├── orchestrationRoutes.js    # /api/orchestration
│   ├── partsApi.js               # /api/parts
│   ├── randomPoseRoutes.js       # /api/random-poses
│   ├── resource.js               # /api/resource
│   ├── sceneEditorApi.js         # /api (scene editor)
│   └── systemRoutes.js           # /api/system
├── poses/index.js            # /poses (editor + pose API)
├── scenes/
│   ├── api.js                    # /scenes/api
│   ├── armed-mode.js             # armed-mode helpers
│   └── index.js                  # /scenes (Animation Studio)
└── setup/
    ├── audio.js                  # /setup/audio
    ├── calibration.js            # /setup/calibration
    ├── characters.js             # /setup/characters
    ├── head-animation.js         # /setup/head-animation
    ├── jaw-animation.js          # /setup/jaw-animation
    ├── models.js                 # /setup/models
    ├── poses.js                  # /setup/poses
    └── system.js                 # /setup/system

server/calibration/router.js  # /api/calibration (Unified Calibration API v1.5)
```

The legacy per-hardware route files described in older docs
(`servoRoutes.js`, `motorRoutes.js`, `ledRoutes.js`, `partRoutes.js`,
`sceneRoutes.js`, `characterRoutes.js`, `cameraRoutes.js`, `voiceRoutes.js`,
`activeModeRoutes.js`, ...) do **not** exist. Hardware is exercised through
`/api/parts` (type-aware dispatch) and the setup/calibration routers.

#### Mounting Notes
- `/setup/super-powers` is a `301` redirect to `/setup/jaw-animation`.
- Several small endpoints are defined inline in `server.js`: the dashboard `/`,
  `/live`, `/setup`, `/setup/style-guide`, Goblin device-compat aliases
  (`/api/goblins/...`), audio-health endpoints (`/api/audio/...`), and diagnostic
  `/__audio/*` and `/__errors` endpoints.
- A test-only `GET /__kill` shutdown route is registered **only** under
  `MB_TEST_MODE`/`NODE_ENV=test`.

### Character Context Resolution

Character context is resolved per request by `resolveCharacter(req)` in
`services/characterContext.js` — **not** by sessions. Resolution precedence
(`pickFromReq`, all coerced to a numeric id):

1. `req.query.characterId`
2. `req.params.characterId` (or `req.params.charId`)
3. `req.app.locals.config.selectedCharacter`
4. async fallback to `readConfig().selectedCharacter` (`config/app-config.json`)

`resolveCharacter()` returns a context object
`{ id, name, dataDir: 'data/character-<id>', network }`, where `network` comes
from `config/animatronics.json`. Sync (`resolveCharacterSync`) and by-id
(`getCharacterById`) variants exist. Registry/network lookups are cached and can
be cleared with `invalidateCache()`.

Direct reads of `selectedCharacter` or `req.query.characterId` outside this
resolver are blocked by `npm run audit:resolver`; service-layer helpers without a
`req` may use `readConfig()` and are listed in
`eslint-rules/no-direct-character-resolution.allowlist.json`.

## Service Layer Architecture

Business logic lives in `services/` (plus `controllers/`). Notable services:
- **`configService.js`** — `readConfig()`, `updateSelectedCharacter()` (atomic
  write), `getHostnameCharacterId()`.
- **`characterService.js` / `characterContext.js`** — character registry and
  per-request context.
- **`scenes/` and `poses/`** — scene execution engine and pose repository.
- **`serverPlaybackService.js`, `audioLoopService.js`, `AudioHealthMonitor.js`,
  `pipewireService.js`** — audio playback, looping, and health.
- **ElevenLabs services** (`elevenLabsTTSService.js`, `elevenLabsSTTService.js`,
  `elevenLabsWebSocketService.js`, `elevenLabsRealtimeSTTService.js`) — AI voice.
- **`jawAnimationSuperPowerService.js`, `headAnimationSuperPowerService.js`,
  `jawServoDaemon.js`** — jaw/head animation.
- **`goblin*Service.js`** — Goblin video/playlist subsystem.

## Real-time Communication

WebSockets are used narrowly, not as a general transport layer. The primary API
surface is HTTP/JSON.
- `elevenLabsWebSocketService` runs a `ws` server for real-time AI chat on
  `ws://<host>:8795`, or `wss://<host>:<PORT>/ai-chat` when the main port serves
  HTTPS.
- `elevenLabsRealtimeSTTService` uses WebSockets for streaming speech-to-text.
- Video (webcam) uses the external `mjpg-streamer` process on port `8090`, not a
  Node WebSocket stream.

## Configuration Management

File-based configuration (no environment-file loader):
- **`config/app-config.json`** — `port`, `theme`, `selectedCharacter`, `dataPath`.
  Written atomically by `updateSelectedCharacter()`.
- **`config/animatronics.json`** — hostname → `characterId` network map.
- **`config/schemas/`** — JSON schemas enforced at startup and by the gate.
- **`data/characters.json`** — character registry.
- **`data/character-<id>/`** — per-character `parts.json`, `poses.json`,
  `scenes.json`, `super-powers.json`.

Relevant environment variables are read directly from `process.env`: `PORT`,
`NODE_ENV`, `MB_TEST_MODE`, `TEST_PORT`, `MONSTERBOX_HARDWARE_AVAILABLE`,
`MB_SKIP_GATE`, `KILL_SERVER_AFTER_TESTS`.

## Persistence & Stability Architecture

Because the app runs from SD-card storage and animatronics are routinely
unplugged mid-operation, critical writes are hardened against corruption.

### Atomic Store (`services/atomicStore.js`)
- **`writeJsonAtomic(filePath, value, opts)`** — writes to a unique sibling temp
  file, then `rename(2)`s it over the target. Rename is atomic within a
  filesystem, so a reader or a crash never sees a partial file.
- **`withFileLock(key, fn)`** — serializes async critical sections sharing a key
  (typically a file path or `${filePath}:${characterId}`) via a promise chain, so
  concurrent writers don't clobber each other.
- **`updateJsonUnderLock(filePath, mutate, opts)`** — a locked read-modify-write:
  reads/parses (falling back to `defaultValue` on missing/corrupt), applies
  `mutate`, and atomically writes back unless `mutate` returns the `SKIP_WRITE`
  sentinel.

These helpers back config, scenes, poses, super-powers, calibration, and part
persistence (`configService.js`, `scenes/scenesService.js`,
`poses/poseRepository.js`, jaw/head super-power services, calibration store,
`partsApi.js`, and several controllers).

### Character-Scoped Hardware State
Part IDs are **not** globally unique across characters, so hardware state is keyed
by `${characterId}:${partId}` (with a legacy bare-`partId` read fallback for
backward compatibility):
- **`server/calibration/store.js`** — `JsonCalibrationStore` persists calibration
  profiles to `data/calibration_profiles.json`, keyed per character so one
  character's calibration can't overwrite another's (which could drive a servo to
  damaging bounds).
- **`services/actuatorPositionStore.js`** — persists open-loop actuator and
  continuous-servo positions to `data/actuator-positions.json` with atomic writes,
  crash-recovery flags (`isMoving`, `recoverFromCrash()`, `markUnknown()`), and a
  `markCleanShutdown()` invoked during graceful shutdown.

Both default to the node's selected character (briefly cached) but accept an
explicit `characterId` from callers that know it (scene executor, jaw/head
services).

### Pre-Deploy Gate (`npm run gate` → `scripts/gate.mjs`)
A fast-fail pipeline runs before every commit and push (git pre-push hook) and in
CI. Steps run in order, each able to abort:
1. `validate:schemas` — per-character data files conform to `config/schemas/`
2. `audit:resolver` — no direct character-state reads outside the allowlist
3. `audit:independence` — character-bias ratchet (Orlok refs, hardcoded IPs, etc.)
4. `test:smoke` — unit-level sanity pass
5. `test:pact` — per-character contract suite

`MB_SKIP_GATE=1` bypasses locally (emergency only; CI still enforces it).

## Error Handling Strategy

- **Process-level**: `uncaughtException`/`unhandledRejection` are logged, not
  fatal — the server stays up for hardware reliability.
- **Startup**: schema-validation failures degrade affected subsystems via
  `app.locals.subsystemHealth` instead of crashing.
- **Request-level**: routes use `try/catch` with standardized JSON error bodies.
  Under `MB_TEST_MODE`, an error middleware downgrades unexpected 5xx responses to
  benign 200s to keep UI/E2E tests stable and records them on
  `app.locals.errorStats` (exposed at `/__errors`).
- **Graceful shutdown**: `gracefulShutdown()` (SIGTERM/SIGINT/SIGHUP) stops the
  idle loop, motion tracking, performance collector, WebSocket server, jaw
  animation + servo daemon, and memory monitor; persists actuator positions
  (`markCleanShutdown`); releases the PID lock; and hard-exits after a 10 s
  timeout.

## Development and Testing

- **Ports**: `3000` production (HTTPS if certs present), `3100` always-on loopback
  HTTP test listener (Mocha), `3200` Playwright server.
- **Test mode**: `MB_TEST_MODE=1` enables the 5xx downgrade, the `/__kill` switch,
  and a capped perf monitor.
- **Suites**: Mocha unit/system/hardware tests and Playwright browser E2E tests;
  granular `test:*` scripts and `scripts/test-runner.mjs` allow per-area runs.
- **Hot reload**: `npm run dev` uses `nodemon server.js`.

## Deployment

- Runs as `monsterbox.service` (systemd) on the Raspberry Pi; restart after server
  changes with `sudo systemctl restart monsterbox.service`.
- HTTPS is automatic when `certs/server.key` and `certs/server.cert` exist
  (required for browser microphone access); otherwise the server runs HTTP.
- Single-instance enforcement via a PID lock prevents two servers contending for
  the same hardware.

---

*This document reflects the codebase as of MonsterBox 8.4.0. For exact behavior,
`server.js`, `services/characterContext.js`, `services/atomicStore.js`, and
`scripts/gate.mjs` are the authoritative sources.*
