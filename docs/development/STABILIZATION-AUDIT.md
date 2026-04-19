# MonsterBox Stabilization Audit — Phase 0 Baseline

**Date:** 2026-04-19
**Base version:** 8.1.7
**Source plan:** [STABILIZATION-PLAN.md](STABILIZATION-PLAN.md)
**Method:** Three parallel `Explore` subagents swept the repository for resolver patterns, hardcoded character bias, and per-character data-file shape divergence. This document synthesizes their findings and is the input to Pillars 1, 2, 3, and 5.

> **Status:** Baseline only. Zero code written. The Pillars 1–5 implementation does not start until this audit is approved.

---

## 1. Character Resolver Patterns (feeds Pillar 2)

CLAUDE.md documents three patterns for resolving the current character. Pillar 2 will collapse them into a single `resolveCharacter(req)` helper guarded by ESLint. Baseline counts below.

### Pattern totals

| Pattern | Description | Count | Files |
|---|---|---:|---:|
| **A** | `await readConfig()).selectedCharacter` (re-reads disk) | 40 | 19 |
| **B** | `req.app.locals.config.selectedCharacter` (in-memory, preferred) | 9 | 4 |
| **C** | `req.query.characterId` / `req.params.characterId` (explicit override) | 7 | 4 |
| **Total raw reads** |  | **56** | **~22 unique** |

### Pattern A — `readConfig()).selectedCharacter` (40 hits / 19 files)

Heaviest offenders:

| File | Hits |
|---|---:|
| `routes/setup/calibration.js` | 13 |
| `services/aiConfigStore.js` | 3 |
| `services/hardwareService/index.js` | 3 |
| `controllers/charactersController.js` | 2 |
| `services/hardwareService/servo.js` | 2 |
| `services/elevenLabsWebSocketService.js` | 2 |
| `routes/aiSettingsRoutes.js` | 2 |
| `routes/api/elevenLabsApiRoutes.js` | 1 |
| `services/scenes/scenesService.js` | 1 |
| `controllers/partsController.js` | 1 |
| (9 other files) | 1 each |

Representative snippets:
- `routes/setup/calibration.js:78` — `const cfg = await readConfig();`
- `controllers/charactersController.js:91` — `var cfg = await readConfig();` (within `getCurrent` after checking `app.locals`)
- `services/aiConfigStore.js:10` — `const cfg = await readConfig();`

### Pattern B — `req.app.locals.config.selectedCharacter` (9 hits / 4 files)

| File | Hits | Lines |
|---|---:|---|
| `routes/api/movement.js` | 3 | 91, 137, 160 |
| `server.js` | 3 | 290, 519, 529 |
| `controllers/charactersController.js` | 3 | 89, 115, 116 |

Representative: `routes/api/movement.js:91` — `const characterId = req.app.locals.config.selectedCharacter;`

### Pattern C — `req.query.characterId` / `req.params.characterId` (7 hits / 4 files)

| File | Hits | Source |
|---|---:|---|
| `routes/scenes/api.js` | 3 | `req.query.characterId` (lines 558, 568, 580) |
| `routes/api/movement.js` | 2 | `req.params.characterId` (lines 47, 72) |
| `controllers/posesController.js` | 1 | line 366 |
| `routes/api/audioLoopRoutes.js` | 1 | line 187 |

Representative: `routes/scenes/api.js:580` — `const characterId = req.query.characterId ? parseInt(req.query.characterId, 10) : getCurrentCharacterId(req);`

### Mixed-pattern files (migration risk)

Highest-priority files for the Pillar 2 resolver migration — each mixes patterns and is a known site for character drift:

| File | Patterns | Risk |
|---|---|---|
| `controllers/charactersController.js` | A + B | Medium — `getCurrent()` tries B then falls back to A |
| `routes/api/movement.js` | B + C | Low — consistent but uses both layers |
| `routes/scenes/api.js` | A + C (implied) | Medium — fallback `getCurrentCharacterId(req)` likely hits A |

### Migration batching (for Pillar 2)

| Batch | Target | Rationale |
|---|---|---|
| 1 | `routes/api/movement.js`, `server.js`, `controllers/charactersController.js` | B-pattern only, small, safe warm-up |
| 2 | `routes/setup/calibration.js` | Large single-file concentration (13 hits) — test-heavy area |
| 3 | AI/hardware services (`aiConfigStore.js`, `hardwareService/index.js`, `hardwareService/servo.js`, `elevenLabsWebSocketService.js`, `elevenLabsApiRoutes.js`, `aiSettingsRoutes.js`) | Service layer, low-traffic routes |
| 4 | Remaining routes (`scenes/api.js`, `posesController.js`, `audioLoopRoutes.js`, `partsController.js`, `scenesService.js`) | Mop-up |

Run `npm run test:smoke` + targeted area tests after each batch.

---

## 2. Hardcoded Character Bias (feeds Pillar 5)

Pillar 5 introduces `scripts/audit-character-independence.mjs`. This section is the allowlist baseline.

### Violation total: **23 across 7 files**

| Pattern | Count | `conditional-branch` (will block) |
|---|---:|---:|
| Case-insensitive `orlok` | 8 | 1 |
| `char_id === 3` / `charId == 3` | 0 | 0 |
| `characterId: 3` / `character_id: 3` in object literals | 2 | 0 |
| Hardcoded MonsterNet IPs (`192.168.8.120/.130/.140/.150/.200`) | 12 | 0 |
| `=== 'Orlok'` / name equality branches | 0 | 0 |
| Other character names (pumpkinhead, mina, dragomir, groundbreaker) | 1 | 0 |

### Full file:line list with classification

#### Orlok references (8)
| File:line | Classification | Snippet |
|---|---|---|
| `tests/hardware/test-hardware-fix.js:97` | **conditional-branch** | `if (hostname.includes('orlok')) { ... }` |
| `tests/hardware/test-hardware-fix.js:100` | conditional-branch | `console.log('... Please run this on mina or orlok.')` (error branch) |
| `goblin/goblin-pi.js:339` | default-fallback | `['orlok', 'mina', 'pumpkinhead', 'sirdragomir', 'groundbreaker', 'localhost']` hostname list |
| `server.js:696` | comment-only | OpenSSL cert subject `/CN=orlok` in console log |
| `scripts/restore_parts.js:13` | comment-only | `const orlokRaw = await fs.readFile(ORLOK_PARTS_FILE)` — one-off restoration script |
| `scripts/restore_parts.js:16` | comment-only | `const orlokParts = JSON.parse(orlokRaw)` |
| `scripts/restore_parts.js:19` | comment-only | Log message |
| `scripts/restore_parts.js:27` | comment-only | Loop variable |

#### `characterId: 3` / `character_id: 3` (2)
| File:line | Classification | Snippet |
|---|---|---|
| `scripts/start-conversation-all.mjs:7` | config-data | `{ name: 'Orlok', ip: '192.168.8.120', characterId: 3 }` |
| `scripts/restore_parts.js:39` | config-data | `characterId: 3` |

#### Hardcoded MonsterNet IPs (12)
| File:line | IP | Classification |
|---|---|---|
| `scripts/start-conversation-all.mjs:5` | 192.168.8.150 | config-data |
| `scripts/start-conversation-all.mjs:6` | 192.168.8.140 | config-data |
| `scripts/start-conversation-all.mjs:7` | 192.168.8.120 | config-data |
| `scripts/start-conversation-all.mjs:8` | 192.168.8.130 | config-data |
| `scripts/start-conversation-all.mjs:9` | 192.168.8.200 | config-data |
| `scripts/test-orlok-actuators-ui.js:20,26,27` | 192.168.8.120 (×3) | config-data |
| `scripts/test-orlok-hardware.js:9` | 192.168.8.120 | config-data |
| `scripts/test-calibration-page.js:41,42` | 192.168.8.120 (×2) | config-data |
| `views/setup/style-guide.ejs:198` | 192.168.8.120 | comment-only (doc card) |

#### Other character names (1)
| File:line | Classification | Snippet |
|---|---|---|
| `goblin/goblin-pi.js:339` | default-fallback | pumpkinhead/sirdragomir/groundbreaker in hostname fallback list |

### Allowlist baseline structure (input for Pillar 5)

All 23 violations go into `tests/baseline/character-independence-allowlist.json` with the following `reason` classifications:

- `tests/hardware/test-hardware-fix.js:97,100` — "Hostname-based hardware test dispatch; parameterize in a follow-up pass."
- `goblin/goblin-pi.js:339` — "Hostname→character fallback list; acceptable default until character registry drives it."
- `server.js:696` — "Doc-only console output for OpenSSL cert generation."
- `scripts/start-conversation-all.mjs:5-9` — "Inter-node script using `config/animatronics.json` would be preferable; scheduled for post-stabilization cleanup."
- `scripts/restore_parts.js:13-39` — "One-off Orlok parts restoration script; retain for disaster recovery."
- `scripts/test-orlok-*.js` and `scripts/test-calibration-page.js` — "Legacy hardcoded-IP test scripts; candidates for deletion once pact suite covers their scope."
- `views/setup/style-guide.ejs:198` — "Static documentation example."

### Zero-violation categories

No hits found for:
- `char_id === 3`, `char_id == 3`, `charId === 3`, `charId == 3`
- `=== 'Orlok'`, `=== "Orlok"`, `name === 'Mina'`, etc.

This means the codebase has **no explicit character-ID equality branches and no name-equality branches** — the bias is concentrated in config-data and hostname detection, not in runtime control flow. That is a better starting point than the original STABILIZATION-PLAN assumed.

---

## 3. Per-Character Data Shape Divergence (feeds Pillar 1)

### File-existence matrix

| File | Char 1 (PumpkinHead) | Char 2 (Mina) | Char 3 (Orlok) | Char 4 (Dragomir) | Char 5 (Groundbreaker) |
|---|---|---|---|---|---|
| `parts.json` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `poses.json` | ✓ (empty) | ✓ (empty) | ✓ | ✓ | ✓ (empty) |
| `scenes.json` | ✓ | ✓ | ✓ | ✓ (empty) | ✓ |
| `super-powers.json` | ✓ | ✓ (no headTracking) | ✓ | ✓ | **MISSING** |
| `ai-config/tts-config.json` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ai-config/stt-config.json` | ✓ | ✓ | ✓ | ✓ (4 fields only) | ✓ (23 fields) |

Plus an orphan `data/character-6/` directory with no entry in `data/characters.json`. The validator must skip it cleanly.

### Divergence details per file type

#### `parts.json`
- **Motor control schema split.** Char 1 uses old (`controlBoard`, `directionPin`, `pwmPin`); char 5 uses new (`driver`, `rpwmPin`, `lpwmPin`, `renPin`, `lenPin`, `enableMode`, `minSpeed`, `maxSpeed`, `characterId`). Chars 2/4 have no motor parts, so no pattern.
- **PCA9685 address and channel naming drift.** Across chars 2, 3, 4: `config.address` (number, 64). Char 1 has both `config.address` (number) AND `config.pcaAddress` (string `"0x40"`) in different entries. Char 1 part id 63 also uses `config.pcaChannel` instead of `config.channel`.
- **`markers` field.** Char 1 only.
- **Part count and type distribution:**

| Char | Parts | Servos | Motors | Actuators | Speakers | Mics | Webcams |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24 | 2 | 3 | 7 | 2 | 7 | 1 |
| 2 | 10 | 3 | 0 | 1 | 1 | 1 | 1 |
| 3 | 12 | 4 | 0 | 3 | 1 | 1 | 1 |
| 4 | 6 | 3 | 0 | 0 | 1 | 1 | 1 |
| 5 | 4 | 0 | 1 | 0 | 1 | 1 | 1 |

#### `super-powers.json`
- Char 5 missing the file entirely → jaw config endpoint should return empty config, not 500.
- Char 2 missing `headTracking` subtree.
- `jawAnimation.configs[0]`: optional fields diverge — `audioLeadTimeMs` (chars 1, 3, 4 only), `testText` (chars 1, 3 only).
- Numeric drift within identical-shape configs: `sensitivity: 1` on chars 1/2/3, `1.5` on char 4; `quantizationLevels: 10` on chars 1/2/3, `18` on char 4.

#### `ai-config/tts-config.json`
- `voice_id` present on chars 4/5, absent on chars 1/2/3 (chars 1-3 likely inherit from `characters.json` `elevenLabsAgentId`).
- `similarity_boost`: 0.75 (char 4) vs 0.5 (chars 1-3, 5). Intentional tuning.
- `model`: all `"eleven_v3"`. Consistent.

#### `ai-config/stt-config.json`
- **Char 4 (Dragomir): only 4 fields.** `microphonePartId`, `microphoneDeviceId`, `vadEnabled`, `vadThreshold`. Missing `model`, `language`, `format`, all audio-filter fields. This is a live gap.
- **Char 5: 23 fields.** Adds buffer tuning (`captureChunkDuration`, `maxBufferDuration`, `minBufferDuration`, `sttThrottleInterval`, `microphoneInputGain`) not present on others.
- **VAD threshold drift:** char 1 = 0.35, char 2 = 0.35, char 3 = 0.38, char 4 = 0.05, char 5 = 0.02. Char 4/5 values are suspicious — likely hypersensitivity.
- **`format`:** `"mp3"` (chars 1, 5) vs `"wav"` (chars 2, 3). Char 4 missing.

#### `characters.json`
- Char 3 (Orlok) has a full inline `sttConfig` blob on the record — duplicates `data/character-3/ai-config/stt-config.json`. Schema must either declare `sttConfig` optional-and-conforming or we begin a cleanup ratchet to remove it.

### Top 5 schema-critical divergences (Pillar 1 acceptance criteria)

1. **Motor control field union.** `parts.json` motor entries must accept old-schema OR new-schema via `oneOf`, not both in one object. Schema does not force migration; future cleanup will.
2. **PCA address/channel naming.** Schema accepts `address`/`channel` OR `pcaAddress`/`pcaChannel` with a type constraint on each. Flag both patterns in validation warnings so we can ratchet to a single canonical name.
3. **Missing `super-powers.json` for char 5.** Schema declares top-level keys optional so empty/missing file is valid; jaw-animation route must return 200 with an empty config when the file is missing or `jawAnimation` key is absent.
4. **`stt-config.json` required-field set must be minimal.** Require only `microphonePartId`. Everything else optional, including `model`. Char 4 passes. Defaults live in the service, not the schema.
5. **Inline `sttConfig` on `characters.json` Orlok entry.** Declare optional on the `characters.json` schema; if present, conform to `stt-config.schema.json`.

---

## 4. Phase-0 decisions locked in (for fast Pillar 1 start)

Per the open questions in the plan file — defaults chosen under auto-mode:

| Question | Decision |
|---|---|
| Validator: `ajv` vs. hand-written | **Hand-written.** 150 lines; no new dep. Stop and ask if it grows past 250. |
| Pillar 2 commit granularity | **Four batch commits** + a final squash commit `vX.Y.Z: [stabilization] Pillar 2 - resolver`. Preserves traceability during bisect if a single batch breaks a character. |
| Orlok's inline `sttConfig` on `characters.json` | **Leave.** Flag as allowlist entry; clean in a post-stabilization pass. |
| Orphan `data/character-6/` | **Validator skips.** No delete, no registration. Flag in STABILIZATION-RESULTS.md as cleanup candidate. |

These are reversible; flag any you want changed before Pillar 1 starts.

---

## 5. Summary

| Dimension | Baseline | Target after Pillars 1-5 |
|---|---|---|
| Resolver patterns | 56 raw reads across ~22 files, three patterns | 1 helper, all callers routed through it, ESLint-enforced |
| Bias violations | 23 across 7 files, 1 true conditional | Same 23 in allowlist, ratcheted down only |
| Shape divergence | 5 top-priority schema gaps, 1 missing file, 1 four-field file, 1 orphan dir | All 6 file types have schemas; validator gates startup and CI |
| Tests | ~800+ today, many char-3-hardcoded | Flat-or-lower total; pact suite adds ~75, delete ≥75 redundant |
| Gate | Does not exist | `npm run gate` under 90s on RPi4B; pre-push + CI |

**Phase 0 complete. Awaiting approval to start Pillar 1.**
