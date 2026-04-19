# MonsterBox Stabilization Plan

**Owner:** Aaron Warner
**Repo:** github.com/arwpc/MonsterBox
**Created:** April 2026
**Goal:** Eliminate the class of bug where fixing a feature on one character (Orlok, Mina, Dragomir, Pumpkinhead, Groundbreaker) breaks it on another. Achieve this through structural guarantees, not more tests.

---

## The Diagnosis

This is not a testing problem. It is an architecture problem that testing keeps trying to compensate for. Three root causes, all visible in the existing `CLAUDE.md` and `README.md`:

1. **Character data isn't strictly contracted.** Per-character JSON files (`parts.json`, `super-powers.json`, `ai-config/*`) are free-form. When jaw animation gets fixed for Orlok, the fix relies on Orlok's particular shape — Dragomir's file lacks a field, has a string where Orlok had a number, or names a part differently. The note in `CLAUDE.md` — *"Part IDs: strings in scenes.json, numbers in poses.json — executor uses `String(partId)`"* — is exactly the kind of inconsistency that, repeated across files and characters, causes the leakage.

2. **Three patterns for resolving the current character (A/B/C in CLAUDE.md).** Anywhere code mixes them, character context can drift between request and execution. That's the recipe for "works in calibration UI, fails in scene executor."

3. **Hardcoded Orlok bias.** Already documented as a known issue in `CLAUDE.md`. Without a mechanical way to *find* the remaining instances, they keep surfacing one at a time as you fix individual subsystems.

The fix is not more tests. The fix is to make character-leakage *impossible to introduce*, validated by a small number of high-leverage tests run automatically per character.

---

## Hard Constraints

- No new frameworks. No new transport layers. No database changes.
- No new npm dependencies without explicit approval.
- All deployment via git push/pull to nodes (preserve current MonsterNet workflow).
- Character independence is mandatory — every change must work for any `char_id` with no special-casing.
- Conservative refactoring only. Smaller change wins ties.
- Read versions from `package.json`. Never hardcode.
- Total new test count target: under 100 added (we may *delete* tests made obsolete).

---

## The Five Pillars

### Pillar 1 — Schemas (no behavior change)

Add JSON Schema for `parts.json`, `poses.json`, `scenes.json`, `super-powers.json`, `ai-config/tts-config.json`, `ai-config/stt-config.json`. Schema validates on app start AND in CI. If any character's data file doesn't conform, the app refuses to start the affected subsystem with a clear error naming the file and field.

**Deliverables:**
- `config/schemas/*.json` — JSON Schema files
- `services/schemaValidator.js` — startup validator with graceful subsystem degradation
- `npm run validate:schemas` script that exits non-zero on failure
- Use `ajv` only if already in `package.json`; otherwise ask before adding

### Pillar 2 — Canonical Character Resolver

Collapse patterns A/B/C to a single `resolveCharacter(req)` helper. ESLint rule (using existing `eslint-rules/`) makes the others fail.

**Deliverables:**
- `services/characterContext.js` exporting `resolveCharacter(req)` returning `{ id, name, dataDir, network }`
- Precedence: explicit `req.query.characterId` > `req.app.locals.config.selectedCharacter` > config file fallback
- ESLint rule `no-direct-character-resolution` flagging direct reads outside the resolver
- Allowlist of exempt files (resolver, config loader, tests)
- Migrate one route file at a time, commit after each, run `npm run test:smoke` after each

### Pillar 3 — Character Pact Suite

One pact suite that runs the same ~15 contract tests against every character. Adding a 6th character automatically adds 15 tests, no new code.

**Contract tests per character:**
- Schemas valid for all data files
- Every part in `parts.json` responds to `GET /api/parts/:id`
- Every movement part responds to `POST /api/parts/:id/test` in `MB_TEST_MODE=1`
- Jaw config loads and validates
- Head tracking status endpoint responds
- TTS endpoint round-trips a 2-word string
- Each of the 14 scene step types validates against schema

**Deliverables:**
- `tests/pact/character-contract.test.mjs` (Mocha, matches existing style)
- Iterates over all characters from `data/characters.json`
- `npm run test:pact` and `npm run test:pact:character -- --char <id>`
- Delete redundant per-character hand-written tests the pact now covers

### Pillar 4 — Pre-Deploy Gate

Single command runs schema validation + character pact + smoke tests + lint, in under 90 seconds on RPi4B. Wired to git pre-push hook AND existing GitHub Actions workflow.

**Deliverables:**
- `scripts/gate.mjs` running fast-fail in order: `validate:schemas` → `test:smoke` → `test:pact` → ESLint
- `npm run gate`
- `.husky/pre-push` (only if `husky` already a dep, otherwise plain `.git/hooks/pre-push` documented in `install.sh`)
- Opt-out env var for emergency pushes
- Updated `.github/workflows/` job, kept under 5 minutes

### Pillar 5 — Orlok-Bias Auditor

Grep-driven script that finds bias patterns. CI fails if new violations appear. Existing violations get a baseline allowlist that shrinks over time (ratchet only tightens).

**Bias patterns:**
- Case-insensitive `orlok`
- `char_id === 3`, `characterId: 3`, `character_id: 3`
- Hardcoded MonsterNet IPs (`192.168.8.120`, `.130`, `.140`, `.150`, `.200`)
- Conditionals branching on specific character name or id

**Deliverables:**
- `scripts/audit-character-independence.mjs` outputting `{ pattern, file, line, snippet }` JSON
- `tests/baseline/character-independence-allowlist.json` listing currently-known violations with comments
- Audit fails CI on any violation NOT in the allowlist
- Wired into `npm run gate`

---

## Claude Code Primitives in `.claude/`

One subagent and three skills, all project-level (committed to the repo):

### Subagent: `.claude/agents/character-auditor.md`
- Read-only tools (Read, Grep, Glob, read-only Bash)
- Description: "Audits MonsterBox for character independence violations and per-character data shape divergence. Use proactively before any cross-character change."
- Body: runs `audit-character-independence.mjs` and `validate:schemas`, returns structured report

### Skill: `.claude/skills/add-part/SKILL.md`
- Triggers on "add a part", "new servo", etc.
- Reads part schema, prompts for type/GPIO/character
- Writes `parts.json` entry, calibration defaults, super-powers references
- Always validates against schema before writing

### Skill: `.claude/skills/add-character/SKILL.md`
- Bootstraps a new character: `data/character-{N}/` with all required files in valid shape
- Registers in `data/characters.json`, adds IP to MonsterNet docs
- Runs `test:pact` against the new character to verify

### Skill: `.claude/skills/pre-deploy-gate/SKILL.md`
- Frontmatter `disable-model-invocation: true` (high-risk, user-invoked only)
- Runs `npm run gate`, parses output, formats failures with file:line and suggested fixes

---

## Sequence (Audit First, Then Build)

### Phase 0 — Audit (no code written)

Spawn three parallel `Explore` subagents:

1. Find every read of `selectedCharacter`, `characterId`, `char_id`. Report count per pattern (A/B/C from CLAUDE.md) and files involved.
2. Grep for hardcoded character bias (patterns above). Return file:line references.
3. Diff the *shape* of `data/character-{1..5}/` data files. Report keys missing from some characters, type mismatches, default-value divergence.

Synthesize into `docs/development/STABILIZATION-AUDIT.md`. **Stop and wait for approval before writing code.**

### Phase 1-5 — Implement Pillars

After audit approval, implement Pillars 1 → 5 in order. Commit after each. Run `npm run test:smoke` after each migration step.

### Phase 6 — Claude Code Primitives

Build the subagent and three skills. These come last because they depend on the schemas and resolver existing.

### Phase 7 — Documentation

- Update `CLAUDE.md`: replace "three patterns" section with "use `resolveCharacter(req)` only". Document the gate and auditor subagent.
- Update `README.md`: new `npm run gate` command, testing philosophy change.
- Add `docs/development/STABILIZATION-RESULTS.md`: pillars complete, test count delta, allowlist baseline (so future-you can track the ratchet).
- Update `CHANGELOG.md` under next version.

---

## Working Rules

- Commit after every pillar: `vX.Y.Z: [stabilization] Pillar N - <description>`
- Run `npm run gate` after every pillar
- If a pillar reveals more bias than audit found: update baseline allowlist and keep moving. Don't try to fix everything in this pass. Stabilize first, fix incrementally.
- If you want to add a 6th pillar: STOP and ask. Scope discipline is the point.
- When all five pillars and `.claude/` primitives are in: run full test suite once, then summarize: pillars complete, tests added, tests deleted, current allowlist size, gate runtime.

---

## Success Criteria

- Schema validation runs on every node startup
- Single `resolveCharacter()` is the only path to character context
- Pact suite proves each character meets the same contract
- `npm run gate` blocks regressions at pre-push and in CI in under 90s
- Bias allowlist exists, has a known baseline count, only shrinks
- Total test count is **flat or lower** than today, not higher
- A subsequent fix to one character cannot break another without the gate catching it
