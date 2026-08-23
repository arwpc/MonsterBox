# MonsterBox — Animatronic Control Platform

## Project Identity
- **Application:** MonsterBox — RPi4b-based animatronic character control system
- **Version:** Read from `package.json` — NEVER hardcode version strings
- **Owner:** Aaron Warner, Coralville, Iowa
- **Stack:** Node.js, Express, EJS templates, Python hardware scripts, Raspberry Pi 4B
- **Repository:** Local git, commit frequently with descriptive messages; remote at github.com/arwpc/MonsterBox
- **Package type:** ES modules (`"type": "module"` in package.json)

## Architecture Constraints — READ FIRST
- **DO NOT** replace Node.js, Express, or EJS with alternative frameworks
- **DO NOT** introduce WebSockets, GraphQL, or new transport layers
- **DO NOT** restructure the database schema or switch databases
- **DO NOT** add new npm dependencies without explicit approval
- **DO NOT** make changes that alter user-facing behavior unless fixing a bug
- **PRIORITIZE** reliability and performance over cleverness or complexity
- **PRESERVE** all existing API endpoints and their contracts
- When in doubt, make the smaller change. Conservative refactoring only.

## Hardware Platform
- **Board:** Raspberry Pi 4B, 8GB RAM, Debian Bookworm (aarch64)
- **Storage:** SD card — minimize unnecessary writes (no excessive logging, avoid file watchers)
- **Connectivity:** WiFi primary (`wlan0`), Ethernet optional
- **Peripherals:** USB camera (motion tracking), USB audio adapter, optional serial devices
- **Hardware control:** Python scripts in `python_wrappers/` called via Node `child_process`
- **GPIO:** PCA9685 PWM for servos, direct GPIO for LEDs/motors/sensors
- **Service:** `monsterbox.service` (systemd) — restart after server changes: `sudo systemctl restart monsterbox.service`
- **Logs are SPLIT — grep both.** `console.log` → `/var/log/monsterbox.log`; `console.warn`/`console.error` → **only** `/var/log/monsterbox.err` (systemd `StandardOutput`/`StandardError` append). The failure reason (dropped capture candidate, refused device, silent fallback) sits in `.err` while `.log` still reads healthy. Never diagnose from `.log` alone.
- **ReSpeaker XVF3800 capture:** `parec`/`ffmpeg`/`arecord` open the array and then deliver **zero frames**; PyAudio is the only capture layer that streams from it. Probe with the app's own path (`python_wrappers/microphone_cli.py`) and judge on FRAMES (non-zero bytes AND non-zero RMS), never on "the device opened". Trap list: `docs/hardware/RESPEAKER-XVF3800.md` → *Capture traps*.

## Directory Structure
```
MonsterBox/
├── server.js              # Express app entry point
├── package.json           # Version source of truth (read dynamically)
├── CLAUDE.md              # This file
├── routes/                # Express route handlers
│   ├── api/               # JSON API endpoints
│   ├── scenes/            # Animation Studio routes
│   ├── setup/             # Character setup routes
│   └── poses/             # Pose routes (editor + API, HTML list redirects to /scenes)
├── services/              # Business logic layer
│   ├── scenes/            # Scene execution engine
│   ├── poses/             # Pose management
│   └── hardwareService/   # Hardware abstraction layer
├── controllers/           # Request handlers
├── views/                 # EJS templates
│   ├── layouts/           # master.ejs layout wrapper
│   ├── scenes/            # Animation Studio (studio.ejs)
│   ├── poses/             # Pose Editor (editor.ejs)
│   ├── setup/             # Character setup pages
│   └── partials/          # Shared template fragments
├── public/                # Static assets (CSS, client JS, images)
├── python_wrappers/       # Hardware control scripts (servo, LED, motor, sensor, camera)
├── data/                  # Runtime data (JSON files)
│   ├── characters.json    # Character registry
│   ├── character-{id}/    # Per-character data (parts, poses, scenes, super-powers)
│   └── audio-library/     # Shared audio files
├── config/                # App configuration
├── tests/                 # Test suites (800+ tests)
│   ├── unit/              # Mocha unit tests (7 files)
│   ├── system/            # Mocha system/integration tests (17 files)
│   ├── browser/           # Playwright E2E tests (24 spec files)
│   ├── hardware/          # Mocha hardware tests (4 files, need real GPIO)
│   └── ai/                # AI service tests (2 files)
├── scripts/               # Utility and migration scripts
├── ai/                    # AI prompt templates and config
├── goblin/                # Goblin subsystem (video/playlist)
└── docs/                  # Documentation
```

## Key Concepts
- **Characters:** Animatronic personas (Orlok, etc.) stored in database with unique char_id
- **Character Independence:** ALL functionality must work for ANY selected character, never hardcoded to a specific char_id or character name
- **Known Issue:** Much code was originally built for Orlok (char_id=3). Hardcoded references to "Orlok", "orlok", char_id=3, or character_id=3 are bugs unless they are default/fallback values clearly marked as such
- **AI Services:** TTS (text-to-speech) and STT (speech-to-text) — must have ONE canonical implementation each, used everywhere
- **Hardware Layer:** Python scripts control servos, LEDs, audio on RPi GPIO pins via Node child_process calls
- **Animation Studio:** Unified scene/pose editor at `/scenes` — three-panel layout with timeline editor, drag-and-drop, and live preview. Replaces the separate Scenes and Poses pages (legacy routes redirect to `/scenes`)
- **Pose Editor:** Dedicated page at `/poses/editor` for visually positioning hardware parts and saving as named poses. Supports servo angles, motor/actuator controls, lights, and optional audio (file or TTS)
- **Dashboard (`/`):** Primary operator interface with draggable/reorderable panels. Scenes panel supports drag-reorder, delete, play individual, and loop-all. Monster Features panel has jaw/head-tracking/parrot toggles
- **Character ID in routes:** Use `resolveCharacter(req)` from `services/characterContext.js`. It is the only supported path to character context. Precedence: `req.query.characterId` > `req.params.characterId` > `req.app.locals.config.selectedCharacter` > `readConfig()` fallback. Direct reads of `selectedCharacter` or `req.query.characterId` outside the resolver are blocked by `npm run audit:resolver`. Service-layer helpers that have no `req` may still use `readConfig()`; they are allowlisted in `eslint-rules/no-direct-character-resolution.allowlist.json`.
- **Character ID in hardware calls:** every `controlPart()` / calibration-store call from a context that knows its character MUST pass it (`controlPart(id, action, params, { characterId })`, `store.get(partId, characterId)`). Part ids are only unique within a character; omitting it resolves against the node's mutable `selectedCharacter` and has driven the wrong PCA9685 channel.
- **Calibration bounds:** read through `calibratedBounds(profile)` / `store.get()` — never `profile.bounds` raw. Placeholder (autoGenerated) spans and degenerate (`min≈max`) windows are withheld by the read path; `isDegenerateWindow()` is enforced at every bounds writer so a zero-span window (which permanently freezes a part at one angle) can no longer be persisted. Writers use `store.getRaw()`.
- **Supervised calibration override:** the calibration endpoints (nudge, home, jog-raw, and goto with `calibrationOverride: true`) relax the safety ANGLE WINDOW and DURATION CAP so an operator can measure real travel and home to a physical endstop. `blockAllMotion`, `noRetractBelowMin` and power-group serialization NEVER relax (`services/hardwareService/safetyLimits.js`). **There is no longer any current-draw cap in software.** BOTH speed caps were removed in v10.1 at the operator's direction: the global speed-cap *multiplier* in the motion planner (a timing knob that defaulted to 1.0, never a safety limit) and the per-part `safety.maxSpeedPct`. `grep -rn "maxSpeedPct"` now matches no source file, so adding that key to `config/hardware-safety.json` validates silently and enforces nothing — do not add it believing it protects a circuit. **2026-08-20 operator ruling: EVERY per-part safety limit was removed, all characters, permanently** ("we don't need them ever again"). `config/hardware-safety.json` is empty; software refuses nothing. Do not re-add blocks, windows, caps, retract-guards, test exclusions, or serialization without the operator's direction. Two cautions survive as knowledge, not enforcement: Orlok's shared elbow/forearm rail (parts 4+5) has blown fuses under simultaneous load, and the knight's 900° multi-turn neck can wrap its head cabling — agents drive those parts only on operator direction, never on their own initiative, and automated suites should not command them. Runtime paths (scenes, poses, superpowers, dashboards) must never set `calibrationOverride`.
- **Jaw-to-audio sync — the jaw LEADS; the knob is `audioLeadTimeMs`.** The jaw timeline starts at t≈0 while first sound waits on one-shot `mpg123` spawn + decode + PipeWire connect (~50–150 ms warm) plus USB-sink resume when the sink is suspended (~150–450 ms cold), so an "early" jaw is physics, not a bug. Correct it with `audioLeadTimeMs` (**positive = delay the jaw**) via `POST /setup/jaw-animation/api/jaw-animation/:charId`. It MUST land on the **ACTIVE** config, not `configs[0]`: the read path resolves `configs.find(c => c.id === jaw.activeConfigId) || configs[0]` (`flattenJawConfig()` in `services/jawAnimationSuperPowerService.js`), and Orlok carries three configs with different values — writing `configs[0]` when `activeConfigId` points elsewhere silently changes nothing at play time. Use the endpoint (it targets the active config and refreshes the in-memory cache — no restart); a hand edit of `super-powers.json` is masked by that cache until the service restarts. Tune by eye per node (cold and warm differ); a WirePlumber no-suspend rule on the speaker sink removes the cold-start half of the spread.

## Character Data Files
Each character at `data/character-{id}/` contains:
- `parts.json` — Hardware part definitions (servos, motors, LEDs, sensors)
- `poses.json` — Named pose configurations (part positions)
- `scenes.json` — Animation sequences (ordered steps with timing)
- `super-powers.json` — AI and special ability configurations
- Part IDs: **strings** in scenes.json, **numbers** in poses.json — executor uses `String(partId)`

## Key API Endpoints
- `GET /api/parts` → raw array of parts (NOTE: returns array directly, not `{ success, parts }` wrapper)
- `GET /api/parts/:id` → `{ success, part }` — single part by ID
- `POST /api/parts/:id/test` → test hardware part (type-aware dispatch)
- `GET /scenes/api/` → `{ success, scenes }` — list all scenes for current character
- `POST /scenes/api/reorder` → `{ orderedIds: [...] }` — persist scene library order
- `POST /scenes/api/:id/play` → execute a single scene
- `POST /scenes/api/queue/start-config` → `{ mode: 'loop_queue', scenes: [{sceneId}] }` — start queue loop
- `GET /poses/editor` → Pose Editor page
- `GET /poses/editor/:id` → Edit existing pose
- `GET /poses/api/poses` → list poses for current character
- `POST /poses` → create pose, `PUT /poses/:id` → update, `DELETE /poses/:id` → delete
- `GET /setup/jaw-animation/api/jaw-animation/:charId` → jaw config + available servos
- `POST /setup/jaw-animation/api/jaw-animation/:charId` → save jaw config (enabled, servoPartId, etc.)
- `GET /api/orchestration/nodes` → live node registry (config overlaid with mDNS discovery: source/status/trust)
- `POST /api/orchestration/nodes/manual` → pin a node by IP (fallback for multicast-blocked networks); `DELETE /api/orchestration/nodes/manual/:id` → forget it
- `GET /api/orchestration/fleet-health` → aggregated per-node health (version, CPU, RSS, uptime, servo latency)
- `GET /api/orchestration/animatronic/:id/status` → single-node health
- `POST /api/orchestration/superpower/:feature` → `{ enabled, ids? }` — fleet-wide toggle (feature: lurk|jaw|head|motion|mute|idle)
- `POST /api/orchestration/stop-all-queue-loops` / `POST /api/orchestration/emergency-stop` → fleet transport + panic stop
- `PUT /api/orchestration/volume` → `{ volume, ids? }` — master speaker volume across the fleet (0-100%; cannot express canons above 100%)
- `POST /api/orchestration/volume/restore-canonical` → `{ ids? }` — every node re-applies its OWN ear-verified `sinkVolume` from config/animatronics.json (the fleet-wide undo for a master-volume fan-out; node-local form: `POST /api/system/volume/canonical`)
- `GET /api/orchestration/animatronic/:id/webcam-stream` → same-origin MJPEG proxy (latest-frame relay via `services/mjpegRelay.js` — drops stale frames rather than queue them, so video stays real-time under load; the Fleet Command Center streams remote webcams through this)

## Scene Step Types
`servo`, `motor`, `linear-actuator`, `light/led`, `audio`, `sayThis`, `askAI`, `goblin-video`, `wait`, `sensor`, `pose`, `hardware`, `jaw-animation`, `head-tracking`
- `concurrent` flag on a step means "run THIS step and the NEXT step simultaneously"
- `jaw-animation` and `head-tracking` steps are non-fatal (return success with warning if hardware unavailable)

## Common Commands
- `npm start` — Start the application server
- `npm test` — Run full test suite (browser + system + unit)
- `npm run verify` — Run system + unit + browser tests
- `npm run test:unit` — Mocha unit tests only
- `npm run test:system` — Mocha system tests only (MB_TEST_MODE=1)
- `npm run test:browser` — Playwright E2E tests
- `sudo systemctl restart monsterbox.service` — Restart after server changes
- `sudo journalctl -u monsterbox.service -f` — unit lifecycle only; the app's own output is in `/var/log/monsterbox.log` + `/var/log/monsterbox.err` (see Hardware Platform)
- `git log --oneline -20` — Recent commit history

### Multi-node (MonsterNet) / mDNS discovery
- `npm run deploy:all` — deploy the current code to **every** animatronic in `config/animatronics.json` (parallel, `--dry-run` to preview). SSH creds from `MONSTERBOX_SSH_PASSWORD`.
- `npm run check:discovery` — fleet who-sees-whom matrix (spots nodes up-but-not-discovered)
- `npm run advertise-node` — write this node's `_monsterbox._tcp` avahi service file (also done on server startup and by the deploy)
- `npm run earcheck` — fleet ear-check (`scripts/fleet-audio/earcheck.mjs`). It shells into each node over key-based SSH; a node it cannot shell into is scored `OFFLINE — no ssh/shell reachability` even while that node is serving fine. Run real ear-checks from Orlok (the node holding fleet SSH trust) and confirm any `OFFLINE` with `curl -sk https://<peer>:3000/health` before believing a node is down.
- `ssh remote@<ip>` lands in `/home/remote`, NOT the repo. Remote commands need absolute paths (`/home/remote/MonsterBox/...`) or a `cd` first — a bare `npm run …` over SSH fails in a way that reads like a missing script.
- Nodes discover each other over mDNS; orchestration overlays the live IP onto `config/animatronics.json` (static entries are a fallback). See `docs/development/NODE-DISCOVERY.md` and `docs/setup/NODE-DISCOVERY-VALIDATION.md`.

## Testing — Granular Test Commands
The full suite has 800+ tests and takes significant time on RPi4B. Use granular commands to test only what you changed.

### Speed Tiers
| Command | What it runs | Speed |
|---------|-------------|-------|
| `npm run test:smoke` | Unit tests only | ~10s |
| `npm run test:quick` | System + 2 browser specs | ~2min |
| `npm run verify:quick` | Same as test:quick | ~2min |
| `npm run test:unit` | All unit tests | ~15s |
| `npm run test:system` | All system tests | ~1min |
| `npm run test:browser` | All browser E2E tests | ~15min |
| `npm test` | Everything (browser + system + unit) | ~20min |

### By Functional Area (pick what you changed)
Each area has `test:unit:<area>`, `test:system:<area>`, and `test:browser:<area>` variants (where tests exist):

| Area | Unit | System | Browser |
|------|------|--------|---------|
| **parts** | — | `test:system:parts` | `test:browser:setup` |
| **audio** | — | `test:system:audio` | `test:browser:audio` |
| **scenes** | — | `test:system:scenes` | `test:browser:scenes` |
| **jaw** | `test:unit:jaw` | `test:system:jaw` | `test:browser:jaw` |
| **head** | — | `test:system:head` | `test:browser:head` |
| **ai** | — | `test:system:ai` or `test:ai` | `test:browser:ai` |
| **calibration** | `test:unit:calibration` | — | `test:browser:calibration` |
| **dashboard** | — | `test:system:dashboard` | `test:browser:dashboard` |
| **models** | — | `test:system:models` | `test:browser:models` |
| **video** | — | `test:system:video` | `test:browser:video` |
| **webcam** | — | — | `test:browser:webcam` |
| **orchestration** | — | — | `test:browser:orch` |
| **conversation** | — | — | `test:browser:conversation` |

### Unified Test Runner (recommended for Claude Code)
The test runner at `scripts/test-runner.mjs` supports cross-suite area testing:
```bash
# Run all tests for one area across all suites
node scripts/test-runner.mjs --area jaw              # unit + system + browser jaw tests
node scripts/test-runner.mjs --area audio --suite system  # just system audio tests
node scripts/test-runner.mjs --suite unit             # all unit tests
node scripts/test-runner.mjs --suite system --grep "parts"  # system tests matching "parts"
node scripts/test-runner.mjs --suite browser --spec scenes   # single browser spec
node scripts/test-runner.mjs --help                   # full usage
```

### Running the browser suite — the default npm script does NOT work here

```bash
MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test tests/browser --reporter=list
```

`npm run test:browser` starts its OWN server on port 3200, which trips `server.js`'s
single-instance PID guard; Playwright then reports a **config** failure that reads exactly like a
test failure and has sent more than one session chasing a non-existent regression. Port 3100 serves
the full app and is always up.

**Port 3100 runs with `NODE_ENV=production` and `MB_TEST_MODE` UNSET.** So a browser test that hits a
hardware endpoint drives REAL hardware unless it passes `dryRun` — `scene-concurrency` was moving a
coffin actuator for 8.5 s twice on every suite run, and the play route only short-circuits on the
`?dryRun=1` QUERY parameter (`routes/scenes/api.js`), not a body field.

The full suite takes ~50 minutes on an RPi4B. Use the granular commands above for anything smaller.

### Browser Test Modes
| Mode | Command | When to use |
|------|---------|------------|
| **Headless CLI** | `npm run test:browser` | RPi SSH, CI/CD, default |
| **Headed** | `npm run test:browser:headed` | Windows IDE with display, debugging |
| **MCP** | `npm run test:mcp` | Claude Code with @playwright/mcp tools |
| **MCP Quick** | `npm run test:mcp:quick` | Fast smoke test via MCP |
| **Live Server** | `npm run test:mcp:live` | Test against running production server |
| **Actual Usage** | `npm run test:actual-usage` | Headed against live server, 60s timeout |

### Hardware Tests (require real GPIO)
```bash
npm run test:hardware              # All hardware tests
npm run test:hardware:servo        # Continuous servo calibration
npm run test:hardware:actuator     # Linear actuator calibration
npm run test:hardware:stepper      # Stepper motor tests
npm run test:hardware:mic          # Microphone CRUD tests
```

### Mocha Pattern Matching
For ad-hoc filtering, pass `--grep` to Mocha:
```bash
npm run test:system -- --grep "parts"     # System tests matching "parts"
npm run test:unit -- --grep "calibration" # Unit tests matching "calibration"
```

### MCP Integration
- `.mcp.json` configures @playwright/mcp server for Claude Code browser tools
- `playwright.mcp.config.js` — Enhanced tracing, always-on screenshots
- Claude Code can control the browser interactively via MCP `browser_*` tools
- Use `/test-browser` skill in Claude Code to run browser tests with appropriate mode detection

### Test Ports
| Port | Purpose |
|------|---------|
| 3000 | Production server (HTTPS) |
| 3100 | Test HTTP listener (always on, Mocha system tests) |
| 3200 | Playwright test server (HTTP, spawned by Playwright config) |

### Testing Protocol (when to run what)
1. **Minor change** (single file, cosmetic): `npm run test:smoke` + area-specific test
2. **Feature change** (new route, service logic): Area-specific system + browser tests
3. **Cross-cutting change** (middleware, layout, config): `npm run test:quick`
4. **Release / PR**: `npm test` (full suite)

## Code Style
- ES module syntax (`import`/`export`) — project uses `"type": "module"`
- Use `async`/`await` over raw Promises or callbacks
- Error handling: always catch and log, never swallow silently
- Use descriptive variable names; no single-letter variables except loop counters
- Comments: explain WHY, not WHAT
- Client-side JS in `public/js/*.js` files: ES5 IIFE pattern — use `var`, no arrow functions, no template literals
- Inline `<script>` in EJS templates: may use ES6+ (existing code uses `const`, arrow functions, template literals in conversation/index.ejs) — match the existing style of each file

## Version Management
- Version string MUST be defined in exactly ONE place: `package.json` version field
- All version displays in UI, logs, API responses, and documentation MUST read from package.json dynamically — never hardcoded
- Use `import` of package.json or equivalent pattern

## Testing Protocol
- Run **relevant area tests** before AND after changes (not the full suite for minor changes)
- Use `npm run test:smoke` as a fast sanity check after any change
- If a test references hardcoded character data, fix the test to be character-independent
- Test each form and button with at least 2 different characters
- If tests don't exist for changed functionality, write them
- Mocha tests need `--exit` flag to prevent hanging
- Pre-existing intermittent failures (not bugs): VU meter, jaw animation save config, calibration timeout
- **Audio claims are proven by ear-check (record + transcribe), never by API success.** A `success: true` from a say/play endpoint says only that a write landed; an empty STT transcript is a *capture* symptom until proven otherwise. Prove the capture layer and the voice gate separately.

## Git Workflow
- Commit after each logical unit of work (not at end of session)
- Commit message format: `vX.Y.Z: [phase] brief description` (use current version from package.json)
- Example: `v6.7.0: [animation-studio] add jaw-animation step type to executor`
- Tag final version: `git tag -a vX.Y.Z -m "MonsterBox X.Y.Z release"`
- `git push` runs `npm run gate` as a pre-push hook (~30 s on RPi4B). Bypass in emergencies only: `MB_SKIP_GATE=1 git push` — CI still runs the gate.

## Pre-Deploy Gate
Every commit and push is gated by `npm run gate`, which runs in this order:
1. `validate:schemas` — per-character data files conform to `config/schemas/`
2. `audit:resolver` — no direct character-state reads outside the resolver allowlist
3. `audit:independence` — bias violations (Orlok refs, hardcoded IPs, name equality) outside the baseline allowlist
4. `test:smoke` — unit-level sanity pass
5. `test:pact` — per-character contract suite

Failures surface `file:line` and a suggested fix. See `docs/development/STABILIZATION-PLAN.md` for the design and `docs/development/STABILIZATION-RESULTS.md` for the baseline numbers.

Allowlists:
- `eslint-rules/no-direct-character-resolution.allowlist.json` — service-layer helpers and pending migrations.
- `tests/baseline/character-independence-allowlist.json` — known bias violations, shrinks over time only.

Use the `character-auditor` subagent (`.claude/agents/character-auditor.md`) proactively before any cross-character change. It is read-only and runs the same four audit commands as the gate.

## Performance Notes (RPi4B)
- 8GB RAM, quad-core ARM Cortex-A72 — capable but not a desktop
- SD card storage — avoid large file buffering, minimize write operations
- Disable file watchers for: `node_modules`, `.vscode-server`, `audio-library`
- Keep API responses lean; avoid loading entire files when partial reads suffice
- Use streaming for large audio file operations where possible

## Claude Code Integration

### Custom Skills (Slash Commands)
Custom slash commands are available in `.claude/commands/` and `.claude/skills/`:
- `/learn-monsterbox` — Full codebase onboarding: reads all key docs, code, and memory files, then reports readiness. Use at the start of any session for deep context.
- `/check-health` — Quick health check: git status, test baseline, config, version, service status.
- `/test-browser` — Run browser tests using the appropriate mode for the current environment.
- `/add-part` — Scaffold a new hardware part entry, validate against schema, run pact for the target character.
- `/add-character` — Bootstrap a new character: creates `data/character-<N>/` with valid files, updates `data/characters.json` and `config/animatronics.json`, runs pact.
- `/pre-deploy-gate` — User-invoked only. Runs `npm run gate` and classifies failures with `file:line` and suggested fixes.
- `/build-v9-orlok` — Autonomous v9.0 Orlok build. Familiarizes, then executes `docs/development/V9-ORLOK-MISSION.md` end-to-end using the expert-agent team. Orlok node only; run in a bypass-permissions/auto-accept session for true hands-off operation.

### Subagents (`.claude/agents/`)
- `character-auditor` — Read-only; runs `validate:schemas`, `audit:resolver`, `audit:independence`, and `test:pact`; returns a structured report. Use proactively before cross-character work.
- **v9.0 Orlok expert team** (orchestrator–worker pattern; see `docs/development/V9-ORLOK-MISSION.md`): `hardware-diagnostician` (read-only; proves parts move, isolates dead channels/fuse), `python-wrapper-specialist` (`python_wrappers/*.py` correctness + `py_compile`), `elevenlabs-ai-specialist` (verifies current ElevenLabs offerings, upgrades canonical TTS/STT in place, tests live), `pose-author` (builds/validates `poses.json` within bounds), `test-runner` (runs suites, triages real vs flaky vs environmental), `security-triager` (Dependabot + leaked-cred, existing-dep fixes only), `docs-scribe` (keeps `KNOWN-BUGS.md`/`CHANGELOG.md`/`README.md`/docs + version record truthful). A lead session decomposes work, fans these out in parallel, adversarially self-verifies, and synthesizes.

### MCP Servers
- **@playwright/mcp** — Configured in `.mcp.json`, provides `browser_*` tools for interactive browser testing and debugging from within Claude Code sessions.
- **Notion MCP** — Available for project tracking integration.
- **HubSpot MCP** — Available for CRM integration.

### Agent & Subagent Usage
- Use `Explore` subagent for broad codebase searches.
- Use `Plan` subagent for designing implementation strategies.
- Use `general-purpose` agent for multi-step tasks.
- Parallel agent launches are preferred when tasks are independent.

## Shared Memory System
Persistent knowledge base at `~/.claude/projects/-home-remote-MonsterBox/memory/`:
- `MEMORY.md` — Quick reference (auto-loaded every session, keep under 200 lines)
- `architecture.md` — Full architecture, service map, route structure, data storage
- `characters.md` — Character details, parts, GPIO pins, Goblins
- `ai-services.md` — ElevenLabs integration, speech pipeline, config
- `testing.md` — Test infrastructure, commands, file structure
- `api-reference.md` — Full API endpoint reference
- `hardware.md` — Hardware types, wiring, Python wrappers, relay wiring

When you learn something new about the codebase that will be useful across sessions, update the relevant memory file. Keep MEMORY.md under 200 lines.

## Session Startup Checklist
1. Read this CLAUDE.md
2. Consult shared memory (`MEMORY.md` is auto-loaded; read topic files as needed)
3. Run `git status` to check for uncommitted work
4. Run `git log --oneline -10` for recent history
5. For deep onboarding, use `/learn-monsterbox` skill

## Session Cleanup Checklist
1. Run full test suite — all tests must pass
2. Update `README.md` to reflect any changes made this session
3. Update `install.sh` if any new dependencies or setup steps were added
4. Update any documentation in `docs/` that references changed functionality
5. Update `CHANGELOG.md` with summary of changes
6. Commit all changes with descriptive message
7. Run `git log --oneline -5` and confirm clean history
8. Update shared memory files if new knowledge was gained
