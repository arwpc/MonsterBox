# Changelog

All notable changes to MonsterBox are documented in this file.

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
