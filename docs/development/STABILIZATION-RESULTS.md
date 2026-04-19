# MonsterBox Stabilization Results

**Pass completed:** 2026-04-19
**Starting version:** 8.1.7
**Final version:** 8.2.3
**Source plan:** [STABILIZATION-PLAN.md](STABILIZATION-PLAN.md)
**Phase-0 baseline:** [STABILIZATION-AUDIT.md](STABILIZATION-AUDIT.md)

---

## What shipped

All five pillars plus the Claude Code primitives, committed sequentially:

| Commit | Version | Pillar |
|---|---|---|
| `bcdfeb21` | 8.1.8 | Pillar 1 — schemas + hand-written validator (no `ajv` dep) |
| `0c9a3931` | 8.1.9 | Pillar 2 — canonical character resolver + ESLint-equivalent ratchet |
| `1a290fcb` | 8.2.0 | Pillar 3 — per-character pact suite |
| `add59ac1` | 8.2.1 | Pillar 4 — pre-deploy gate + pre-push hook + CI wiring |
| `31dcd34d` | 8.2.2 | Pillar 5 — character-independence auditor + baseline allowlist |
| `d75b20c0` / `f2144718` | 8.2.3 | Phase 6 — Claude Code primitives (agent + 3 skills) |

---

## Test count delta

- **Pact suite added:** 55 assertions (11 per character × 5 characters), **one skipped** for char-5's missing `super-powers.json` (intentional — schema permits the gap).
- **Ratchet test added:** 1 (the `tests/system/audit-ratchet.test.mjs` that runs the bias auditor).
- **Tests deleted:** 0 — the existing `tests/` tree has no redundant char-3-only `it()` blocks that pact now covers. The 4 existing char-3/orlok references live in shell scripts, hardware helpers, and README-style docs, not in test suites. Deletion opportunities accumulate inside the independence allowlist and may be taken in follow-up passes.
- **Net new tests:** +56. Well under the plan's < 100 budget.
- **Existing unit count:** 167 passing before and after (no regression).

---

## Allowlist baselines

Two ratchet files, both intended to shrink over time:

### `eslint-rules/no-direct-character-resolution.allowlist.json` — 20 files
Files still permitted to read `selectedCharacter` / `characterId` outside the resolver. Breakdown:

- **Service-layer boundaries** (legitimate long-term allowlist — no `req` in scope): `services/characterContext.js`, `services/configService.js`, `services/aiConfigStore.js`, `services/hardwareService/index.js`, `services/hardwareService/servo.js`, `services/elevenLabsWebSocketService.js`, `server.js`, `controllers/charactersController.js` (write side).
- **Pending migrations** (should migrate to `resolveCharacter(req)` in follow-up work): `controllers/motionTrackingController.js`, `controllers/webcamController.js`, `controllers/partsController.js`, `routes/aiSettingsRoutes.js` (one helper remains), `routes/api/audioLoopRoutes.js`, `routes/api/elevenLabsApiRoutes.js`, `routes/api/partsApi.js`, `routes/firstRun.js`, `routes/scenes/api.js` (explicit override reads), `routes/setup/calibration.js` (three leaf helpers remain), `routes/setup/head-animation.js`, `routes/setup/jaw-animation.js`.

Already migrated to resolver: `routes/api/movement.js`, `routes/scenes/api.js` (getCurrentCharacterId helper), `controllers/posesController.js`, `routes/api/sceneEditorApi.js`, `routes/conversation.js`, the route-handler halves of `controllers/charactersController.js`, `routes/aiSettingsRoutes.js`, `routes/setup/calibration.js`.

### `tests/baseline/character-independence-allowlist.json` — 72 entries
Bias violations (orlok references, hardcoded MonsterNet IPs, etc.) baselined from the live grep. Note: the Phase-0 audit reported 23; the actual surface area was **72** — the discrepancy was in test scripts and one-off shell-style scripts the audit's source regex set missed. Per plan (*"if a pillar reveals more bias than the audit found, update the baseline and keep moving — don't fix everything this pass"*), all 72 are allowlisted with per-entry reasons.

Breakdown by file (ordered by violation count):
- `scripts/test-orlok-hardware.js` (8), `scripts/restore_parts.js` (7), `scripts/start-conversation-all.mjs` (7), `views/setup/style-guide.ejs` (7)
- `scripts/test-orlok-actuators-ui.js` (6), `tests/browser/webcam-capture.spec.js` (6)
- `tests/hardware/test-hardware-fix.js` (5)
- Smaller counts across 16 other files

**Ratchet behavior:** adding a new violation without an allowlist entry fails `npm run gate`. Removing code that matches an allowlist entry surfaces a "stale allowlist" warning from `audit:independence`, prompting a shrink.

---

## Gate runtime

Measured on the primary dev RPi4B (Orlok, 192.168.8.120), Node 18, cold cache:

```
→ validate:schemas ... ok (546 ms)
→ audit:resolver ... ok (591 ms)
→ audit:independence ... ok (746 ms)
→ test:smoke ... ok (27283 ms)   ← dominated by unit suite (167 tests)
→ test:pact ... ok (1169 ms)
✓ Gate passed (total 30335 ms).
```

**30.3 seconds wall-clock on RPi4B.** Target was < 90 s. Room remains to add more pact assertions without blowing the budget.

CI runtime (GitHub Actions `ubuntu-latest`) is bounded below 3 minutes because the gate short-circuits before the long `test:browser` job.

---

## Constraints honored

| Constraint | Outcome |
|---|---|
| No new frameworks | ✓ Still Node + Express + EJS + Mocha + Playwright |
| No new npm dependencies | ✓ Validator, auditor, and enforcer hand-written; `ajv` considered and declined |
| No new transport layers | ✓ No WebSocket / GraphQL introduced |
| No DB changes | ✓ Still flat JSON in `data/` |
| Character independence mandatory | ✓ Pillar 2 resolver + Pillar 3 pact + Pillar 5 auditor |
| Conservative refactoring | ✓ 13 files migrated via the resolver; 72 known-bias sites allowlisted for ratchet rather than fixed in-flight |
| Version from `package.json` | ✓ Each pillar bumped patch; `package.json` remains single source of truth |
| Net test count flat-or-lower | Partially — +56 assertions added; zero deletions this pass. The budget (< 100 new) is respected. Redundancy cleanup accumulates as a follow-up task. |
| Total target: < 90 s gate on RPi4B | ✓ 30 s |

---

## Outstanding work (not in scope for this pass)

Each of these is a follow-up PR opportunity:

1. **Migrate remaining route files to `resolveCharacter(req)`.** 12 files are still in the resolver allowlist purely as "pending migration." Each is a small, surgical change.
2. **Parameterize `scripts/start-conversation-all.mjs`.** Read animatronic IPs from `config/animatronics.json` instead of hardcoding. Drops 7 allowlist entries.
3. **Delete legacy `scripts/test-orlok-*.js`** once the pact suite provably covers their scope. Drops ~20 allowlist entries in one go.
4. **Parameterize `services/aiConfigStore.js`'s default voice-id map.** Read from `data/character-<id>/ai-config/tts-config.json#voice_id`. Drops 1 entry and eliminates the last "orlok" reference in service code.
5. **Resolve the orphan `data/character-6/` directory.** Either register it via `/add-character` or delete it.
6. **Address Orlok's inline `sttConfig` on `characters.json`.** Migrate to file-based config; remove from the registry row.

None of these are required for the gate to be effective. The gate catches regressions; these are improvements that make it tighter.

---

## How to tighten the ratchet

- Running `npm run audit:independence -- --stale-allowlist` prints allowlist entries that no longer match source. Remove them.
- Running `npm run audit:resolver` after migrating a file shows it no longer matches; delete the entry from `eslint-rules/no-direct-character-resolution.allowlist.json`.
- The `character-auditor` subagent does both in one report and is the recommended entry point for any Claude Code session that intends to touch cross-character code.
