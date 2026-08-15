# Open Issues — August 2026

Findings from a full-codebase onboarding pass on v8.5.0. Every item below was verified
against the code or reproduced in a dev container; none are speculative. Nothing here has
been fixed yet — this is a work queue for the next session.

**Baseline at time of writing:** `npm run gate` passes (schemas / resolver / independence /
smoke / pact, ~61 s). Working tree clean at `c5c572c`.

| # | Issue | Severity | Kind |
|---|-------|----------|------|
| 1 | Groundbreaker maps to a character that doesn't exist | **P1 — breaks a node at boot** | code/data |
| 2 | `test:smoke` rewrites `config/app-config.json` | **P2 — pollutes every gate run** | test |
| 3 | Two high-severity advisories in the dependency tree | **P2 — dev-only, low real risk** | deps |
| 4 | `gpio_assignments.md` contradicts Orlok's `parts.json` | P3 — misleads wiring/debug | docs |
| 5 | HAL interface doc describes code that doesn't exist | P3 — misleads agents | docs |
| 6 | Orphan `data/character-6/` | P3 — trap for id reuse | data |
| 7 | Orlok's stored jaw bounds are stale | P3 — cosmetic today | data |
| 8 | Committed fallback SSH password | Security — needs operator action | security |

---

## 1. Groundbreaker maps to a character that doesn't exist — P1

`config/animatronics.json:7` gives Groundbreaker `"characterId": 7`, but
`data/characters.json` registers Groundbreaker as **id 5**, and there is no
`data/character-7/` directory. `README.md` and `docs/deployment/README.md` both document it
as Character 5, so the animatronics entry is the outlier.

**Why it breaks the node.** On boot, `server.js:128` calls
`getHostnameCharacterId()` (`services/configService.js:33-43`), which matches
`os.hostname()` against `animatronics.json` and returns that entry's `characterId`. On the
box whose hostname is `groundbreaker` this returns `7`, and `server.js:131` writes
`selectedCharacter: 7` / `dataPath: data/character-7` into `app-config.json`. Every
downstream read — `controlPart()` loading `data/character-7/parts.json`, the scene
executor, jaw and head config — then resolves to a directory that isn't there.

Per `docs/deployment/README.md`, the hostname *is* the character identity and
`app-config.json` is overwritten at startup, so this cannot be worked around by editing
config on the node.

**Why the gate misses it.** The pact suite iterates `data/characters.json` and the schema
validator checks per-character files. Nothing cross-checks `animatronics.json.characterId`
against the character registry.

**Fix:** change `characterId` to `5` in `config/animatronics.json:7`. Confirm against the
physical node first — if that box genuinely carries a distinct character 7, the correct fix
is instead to register id 7 in `characters.json` and scaffold `data/character-7/` via the
`/add-character` skill. Do not guess; the two fixes are not equivalent.

**Then add the missing ratchet** so this class of drift can't recur: extend
`tests/pact/character-contract.test.mjs` (or `scripts/validate-schemas.mjs`) to assert that
every `animatronics[].characterId` resolves to an id in `data/characters.json` **and** to an
existing `data/character-<id>/` directory. This is the durable fix; the one-line edit alone
leaves the hole open.

**Verify:** `node -e "const a=require('./config/animatronics.json').animatronics, c=new
Set(require('./data/characters.json').map(x=>x.id)); console.log(a.filter(x=>!c.has(x.characterId)))"`
should print `[]`.

---

## 2. `test:smoke` rewrites `config/app-config.json` — P2

Running `npm run test:unit` (which the gate runs as `test:smoke`, and which `git push` runs
via the pre-push hook) leaves `config/app-config.json` switched to character 1:

```
before: "selectedCharacter": 3, "dataPath": "data/character-3"
after:  "selectedCharacter": 1, "dataPath": "data/character-1"
```

**Culprit:** `tests/basic.test.js:131-138` — *"should set selected character"* — POSTs
`/setup/characters/api/select` with the first character in the list and never restores the
prior value. That handler
(`controllers/charactersController.js:150` → `services/configService.js:21`) writes the real
config file. `tests/basic.test.js` is not in `tests/unit/`, but
`tests/unit/index.test.js` is a recursive loader that imports every `*.test.js` under
`tests/` except the `unit`/`system`/`browser` directories, so it gets pulled into the unit
run. Bisected per-file: only `tests/unit/index.test.js` causes the mutation.

**Impact.** Every gate run and every push dirties a tracked file, which is how this was
found (a spurious `config/app-config.json` diff appeared alongside a real change). On a dev
box it also silently retargets which character's hardware data the next `controlPart()`
call reads. On an RPi it is masked at boot by hostname auto-select, so it is a dev/CI
correctness problem rather than a field failure.

**The pollution cascades.** Because the selected character is now 1, subsequent tests write
to *that* character's data files. A test run in this container also left
`data/character-1/poses.json` modified (its trailing newline stripped by
`writeJsonAtomic`), i.e. the suite mutates real per-character data, not just the config
pointer. Any tracked file under `data/character-1/` can be touched this way. Expect more
than one file in the post-test diff, and revert all of it.

**Fix:** save and restore the config around that test — capture
`GET /setup/characters/api/current` in `before()` and POST the original id back in
`after()`. Point the test at a temp config path if a clean fixture seam is preferred, but
the save/restore is the smaller change and matches the project's conservative-refactor rule.
Restoring the character pointer also stops the cascade into `data/character-1/`, so fix that
first and re-measure before chasing the data-file writes separately.

**Verify:** `git checkout -- config/app-config.json data/ && npm run test:unit && git status
--short` should report no changes. Today it reports at least
`config/app-config.json` and `data/character-1/poses.json`.

---

## 3. Two high-severity advisories in the dependency tree — P2

`npm audit` reports **2 high** (0 critical/moderate/low) in the root tree. `goblin/` is
clean (0 of everything). GitHub's dependabot reports 3 high on the default branch — the
discrepancy is unexplained and worth a look at the security tab.

| Package | Advisory | Pulled in by |
|---|---|---|
| `brace-expansion` | GHSA-rgw5-rvv9-x895 — DoS via unbounded intermediate arrays | `mocha` → `minimatch@5`, `nodemon` → `minimatch@3` |
| `js-yaml` 4.0.0–4.3.0 | GHSA-5p4m-2wfm-xmqj — quadratic CPU in `!!omap` (CVE-2026-59870) | `mocha` |

**Both paths are devDependencies only** (`mocha`, `nodemon`) — neither ships in the runtime
an animatronic executes, so real exposure is low. This supersedes the README's "npm audit
now reports 0 vulnerabilities" claim from v8.4.0, which should be updated or dated when
this is addressed.

**Fix:** `npm audit fix` reports both as fixable without a breaking change. Run it, confirm
`npm run gate` still passes (mocha is the test runner — this touches it), and update the
README line. Note `package.json` already carries a `mocha` → `serialize-javascript`
override, so check whether an added override is cleaner than a lockfile bump.

---

## 4. `gpio_assignments.md` contradicts Orlok's `parts.json` — P3

`docs/hardware/gpio_assignments.md:3-23` disagrees with `data/character-3/parts.json` on
nearly every Orlok channel and on the actuator pins. Data is authoritative.

| Part | Doc says | `parts.json` says |
|---|---|---|
| Jaw servo | ch 0 | **ch 3** (part 10) |
| Elbow servo | ch 1 | **ch 4** (part 4) |
| Forearm servo | ch 8 | **ch 5** (part 5) |
| Head servo | ch 15 | **ch 0** (part 15) |
| Right Arm actuator | DIR 5 / PWM 13 | **DIR 23 / PWM 12** (MDD10A, part 1) |
| Left Arm actuator | DIR 23 / PWM 12 | **DIR 18 / PWM 13** (MDD10A, part 2) |
| Bow actuator | DIR 18 / PWM 6 | **RPWM 19 / LPWM 21 / REN 5 / LEN 22** (BTS7960, part 3) |

Anyone wiring or debugging from this table drives the wrong channel. The other characters'
sections in the same file have not been checked against their `parts.json` and should be.

**Fix:** regenerate the Orlok section from `parts.json`, then audit the Mina / Sir Dragomir
/ PumpkinHead sections the same way. Consider generating this file from the data instead of
maintaining it by hand — a small `scripts/` generator would keep it honest permanently.

---

## 5. HAL interface doc describes code that doesn't exist — P3

`docs/integration/Hardware-Integration-Layer-Interfaces.md` documents, in present tense, an
architecture that is not in the repository:

- `GET /api/hardware/devices`, `POST /api/hardware/devices/{id}/control`,
  `GET /api/hardware/safety`, `POST /api/hardware/emergency-stop` — no `/api/hardware`
  routes exist (the only near-match is `routes/setup/audio.js:455`
  `/api/hardware-devices`).
- Motor/Light WebSocket services on ports 8771/8772 — no reference to either port anywhere
  in the JS or Python.
- `public/hardware-monitor.html` — file does not exist.
- `npm test:hardware-comprehensive`, `npm test:hal-integration` — not in `package.json`.

The real hardware path is `services/hardwareService/index.js` → `controlPart()` →
`python_wrappers/*.py`, which the doc never mentions. This actively misleads both humans and
agents onboarding through `/learn-monsterbox`, which reads this file as step 15.

**Fix:** either mark the document clearly as a historical/aspirational design that was never
built, or replace it with an accurate description of `controlPart()`, the
`HARDWARE_CONTROLLERS` table, part-type normalization, and the calibration-invert hook.
The second is more work but removes a persistent trap. If replaced, update the
`/learn-monsterbox` step list accordingly.

---

## 6. Orphan `data/character-6/` — P3

`data/character-6/` exists with `parts.json: []`, `poses.json` (`characterId: null`),
`servos.json: []`, and an `ai-config/` containing `tts-config.json` / `stt-config.json`.
Character 6 is **not** registered in `data/characters.json` (which holds ids 1–5) and not in
`config/animatronics.json`.

The `/add-character` skill already documents it as a known orphan and warns against reusing
id 6, so the trap is at least signposted. It is inert today — nothing enumerates character
directories — but it will collide the moment someone bootstraps a sixth character.

**Fix:** delete the directory if it is genuinely dead (confirm with the owner first — check
whether any RPi in the field still runs it before removing), or finish registering it. Do
not leave it half-created.

---

## 7. Orlok's stored jaw bounds are stale — P3

`data/character-3/super-powers.json` active config `config-1` ("Default") stores
`minAngle: 102 / maxAngle: 143`, while part 10's markers in `parts.json` read
`Min 63 / Mid 83 / Max 131`. The two other saved configs both store 63/131.

**Harmless today:** `readJawConfig()`
(`services/jawAnimationSuperPowerService.js:132-144`) overlays the live calibration profile
over the stored values on every read, and `writeJawConfig()` deliberately excludes
`minAngle`/`maxAngle` from the persisted tuning keys — precisely to stop cross-character
bleed, since calibration profiles were historically keyed globally. So the stale numbers are
overwritten before use whenever a calibration profile exists.

**Risk:** if no calibration profile exists for part 10 on a given node, the overlay is
skipped and the stale 102/143 becomes the actual jaw travel. Could not be confirmed here —
`data/calibration_profiles.json` is gitignored (`.gitignore:92-94`, correctly, because part
ids are per-character) and therefore absent from this container.

**Fix:** on the Orlok node, read the live profile for part 10 and either correct the stored
values or strip `minAngle`/`maxAngle` from the saved configs entirely, since they are
non-authoritative by design. Stripping is the cleaner option and matches the write path's
intent.

---

## 8. Committed fallback SSH password — Security

`services/orchestrationService.js:26` still contains
`const LEGACY_SSH_PASSWORD = 'klrklr89!';`, used at line 47 whenever
`MONSTERBOX_SSH_PASSWORD` is unset. It is passed to inter-node `sshpass` calls (reboot,
deploy, config push — lines 234, 249, 352, 368).

This is a **known, already-tracked** item: the v8.5.0 CHANGELOG flags it as a leaked
credential retained only so the fleet keeps working, and a startup warning fires when the
fallback is in use (lines 48-50). It is listed here because it is still outstanding, not
because it is newly discovered.

**Fix (operator action, not a code change alone):** rotate the password on every node, set
`MONSTERBOX_SSH_PASSWORD` in each node's systemd service environment, confirm the startup
warning stops firing fleet-wide, and only then remove the constant. Removing the constant
first would break any node that hasn't been rotated. Better still, move the fleet to SSH
keys and drop password auth entirely — `sshpass` exists here only to work around its
absence.

---

## Suggested order for the next session

1. **#1** — confirm the intended Groundbreaker id with the owner, fix the mapping, add the
   cross-file ratchet to the gate. Highest impact, and the ratchet pays forward.
2. **#2** — save/restore in `tests/basic.test.js`. Small, and it stops every future session
   from chasing a phantom config diff.
3. **#3** — `npm audit fix`, re-run the gate, update the README claim.
4. **#4/#5** — doc corrections; #4 first, since wrong pin tables can cause real hardware
   damage.
5. **#6/#7** — need owner confirmation and on-node inspection respectively; batch them with
   the next hardware session.
6. **#8** — operator/fleet task, schedule separately from a code session.

Items 1, 4, 6, and 7 need a decision or on-hardware check the container can't make — do not
guess at them.
