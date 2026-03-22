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
│   ├── unit/              # Mocha unit tests (4 files)
│   ├── system/            # Mocha system/integration tests (14 files)
│   ├── browser/           # Playwright E2E tests (23 spec files)
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
- **Character ID in routes:** Three patterns exist — **prefer Pattern B** for new code:
  - **A:** `(await readConfig()).selectedCharacter` — re-reads config file each call
  - **B:** `req.app.locals.config.selectedCharacter` — in-memory, fastest (preferred)
  - **C:** `req.query.characterId` — explicit override (used in calibration unified view)

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
- `sudo journalctl -u monsterbox.service -f` — Follow service logs
- `git log --oneline -20` — Recent commit history

## Testing — Granular Test Commands
The full suite has 800+ tests and takes significant time on RPi4B. Use granular commands to test only what you changed.

### Speed Tiers
| Command | What it runs | Speed |
|---------|-------------|-------|
| `npm run test:smoke` | Unit + syntax only | ~10s |
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

## Git Workflow
- Commit after each logical unit of work (not at end of session)
- Commit message format: `vX.Y.Z: [phase] brief description` (use current version from package.json)
- Example: `v6.7.0: [animation-studio] add jaw-animation step type to executor`
- Tag final version: `git tag -a vX.Y.Z -m "MonsterBox X.Y.Z release"`

## Performance Notes (RPi4B)
- 8GB RAM, quad-core ARM Cortex-A72 — capable but not a desktop
- SD card storage — avoid large file buffering, minimize write operations
- Disable file watchers for: `node_modules`, `.vscode-server`, `audio-library`
- Keep API responses lean; avoid loading entire files when partial reads suffice
- Use streaming for large audio file operations where possible

## Claude Code Integration

### Custom Skills (Slash Commands)
Custom slash commands are available in `.claude/commands/`:
- `/learn-monsterbox` — Full codebase onboarding: reads all key docs, code, and memory files, then reports readiness. Use at the start of any session for deep context.
- `/check-health` — Quick health check: git status, test baseline, config, version, service status.
- `/test-browser` — Run browser tests using the appropriate mode for the current environment.

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
