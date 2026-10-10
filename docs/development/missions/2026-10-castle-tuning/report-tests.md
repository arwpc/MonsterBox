# Report: test engineer (Phase 4, D6 tests)

Worker report, 2026-10-10 on Orlok (saved by the lead). Scratch logs in `/home/remote/mission-scratch/tests/`
(`unit-*.log`, `system-*.log`, `browser-*.log`, `gate-*.log`, `parts-alive-1.log`, `kill-*.log`, guard snapshots
under `guard/`).

## Summary

- Gate green, unit at 0 failing (1103 passing, up from 1078).
- Tests can no longer leave residue in live data: a guard restores what the test process wrote and fails loudly
  on any other change; it heals what a killed run left behind on the next run (both kill paths tested on Orlok).
- Real offenders fixed: the jaw system test overwrote Orlok's tuned jaw config on every run; two browser specs
  pressed the real Studio emergency stop; `hardware.test.js` drove Orlok's broken Elbow (the `REFUSED ch4` lines).
- Hardware test proven on Orlok: the 4 working movable parts alive by hardware readback; the 4 broken parts skipped.

## Results

| Suite | Result | Log |
|---|---|---|
| `npm run gate` (180 s smoke cap) | green, 82 s total (smoke 76 s) | `gate-4.log` |
| unit (smoke step) | 1103 passing, 0 failing, 16 pending | `gate-4.log` |
| pact | 72 passing | |
| system (`npm run test:system`) | 398 passing, 32 pending, 1 failing (a lead comment that tripped the audit ratchet; clean by the final gate) | `system-5.log` |
| browser, full suite | 547 passed, 12 failed, 6 skipped (1.3 h); triaged below | `browser-1.log` |
| browser re-runs after fixes | 136 + 70 + 24 + 138 passed, 0 failed on everything that failed and every spec the brief names | `browser-2..5.log` |
| hardware `npm run test:hardware:parts` on Orlok | 5 passing, 4 pending: 4 working parts ALIVE by readback, 4 broken skipped | `parts-alive-1.log` |

Earlier system runs were cut short by service restarts at 12:56:55, 13:19:15, 13:29:55 and 13:39:27 (clean
stop/start each time, no crash).

## 1. Tests never mutate operator state

New `tests/helpers/liveDataGuard.mjs`, wired as Mocha root hooks from `tests/setup.js` (unit and pact) and via
`--require` for `test:system*` and `test:ai`. It snapshots 79 operator files into
`~/.cache/monsterbox-test-guard/<repo>/run-<pid>-<ts>/` (config files tests could touch, the registry, the audio
library index, calibration and actuator stores, every `data/character-N/*.json` and `ai-config/*.json`; runtime
state excluded), wraps the test process's fs writes to journal every guarded write, restores only what this
process wrote, and fails loudly on any difference it cannot attribute (never overwriting it). On SIGINT/SIGTERM/
SIGHUP (the gate's timeout included) it restores before exiting; after SIGKILL/OOM/power loss the next run
restores what the dead run journaled (only files last written inside that run's window). Broken-part rule: the
run fails on any `Testing part <id>` or `REFUSED ch… part <id>` line appended to the logs for a part in
`config/physical-faults.json` or `config/scene-hazards.json`. Overrides `MB_TEST_GUARD_DIR`, `MB_TEST_GUARD=off`.

Proofs on Orlok: SIGTERM with synthetic part `987655` present → `data/character-3/parts.json changed -> restored`
(sha identical before/after); SIGKILL then next run → `previous test run (pid 7868) died; … restored`;
fail-loud probe (append to `config/scene-hazards.json`) → run failed, file unchanged; concurrent writer (unit
test) → reported `left`, content kept.

Offenders fixed: `tests/system/jaw-animation.test.js` (saves the active config and posts it back unchanged; the
lead's cache refreshed with Orlok's own config, file byte-identical); `tests/system/movement.test.js` (node's own
character, skips when locked); `tests/system/orchestration.test.js` (fleet fan-out opt-in with
`MB_ALLOW_FLEET_FANOUT=1`); `tests/system/dashboard-api.test.js` (reorder sends the current order and accepts 423;
say skips 23:00–08:00 unless `MB_ALLOW_AUDIO=1`); `tests/browser/webcam-calibration.spec.js` (answers the PUT in
the page). In-process unit tests that write the selected character's files are covered by the guard (parts.json:
multi-turn-servo, device-calibrated-stamp, calibrated-stamp-main-page, continuous-jog-saturation,
servo-type-validation, calibration-single-part-api, override-removal; others: ai-config-store,
atomic-json-writers, character-data-deletion). True isolation needs an app hook (see Needs hands).

## 2. Browser specs follow the new contracts

New `tests/browser/fixtures.js`; every spec imports `{ test, expect }` from it (30 one-line import changes). It
guards every browser context: scene plays and step tests go `?dryRun=1`; requests that would act on the live node
are answered `{success:true, intercepted:true}` and recorded in a `hazards` fixture (queue starts, `ai-on`,
`ask-ai`, wake/sleep, lurk-mode, lurk prefs, event-hold/release, callouts, lurk-scenes, say/play-audio, jaw-drive,
motion-sensor, pose execute, idle start, ElevenLabs play, restart-service, `/api/panic` and the Studio
`emergency-stop`, every fleet fan-out); part commands for broken or hazard parts get 409; a worker-level guard
diffs operator files and scans the logs for broken-part commands.

Spec changes: `conversation-refactor` (AI switch reflects `ai-status` and posts `ai-on {enabled}`; read-only
contract tests for `ai-status` `state`/`latency`/`conversationMode` and `lurk-state` bound to the node's
character; Lurk mirrors `armed`; callouts/lurk-scenes boolean `state.enabled`; jaw and head toggles restored; Say
This uses `#chatModeToggle`; AI deck default; phone-width scenes tab clicked through the DOM to avoid PANIC);
`orchestration` (masters `ai, lurk, jaw, head, aiMotion, motion, mute, orders`; AI master posts
`/superpower/ai {enabled, ids}`); `actual-usage-testing` 1.4 (Loop All posts `{mode:'loop_queue',
scenes:[{scene_id}]}`; tile play returns `dryRun:true`); `scenes` (library equals `GET /scenes/api/`; Studio Play
dry); `studio-goblin-step` (in-memory store for create/save/delete); `head-tracking-dashboard` (badge agrees with
`head-tracking-status`; tracking from boot); `panel-sortable`, `mcp-comprehensive` (AI deck default since v10.6.0);
`ai-settings` (Wake or Sleep picked from the enabled button); `video-library` (controls asserted by action);
`all-pages-health` (a peer's honest `503 camera_unavailable` ignored).

Full-suite failures triaged: two environmental (service restarted mid-run), the rest fixed and passing on re-run
(dashboard deck default, Say This control, mobile viewport PANIC bar overlap, ai-settings race, orchestration
dblclick timeout during a restart, console errors from a peer 503, new video-library button).

## 3. System tests use the new scene data

`dashboard-api` (scene list equals the node character's own `scenes.json`; every step type dispatchable, fleet
types pass); `ai-motion` (already API-driven); `parts-api`, `hardware`, `jaw-servo-id`, `head-animation` select
parts through the new `tests/helpers/testableParts.mjs`, which never returns a broken or hazard part (this fixes the
`REFUSED ch4`: `hardware.test.js` called `controlPart(<first servo>, moveToAngle 90)` on Orlok's broken Elbow).

## 4. Hardware test per character part list

New `tests/hardware/parts-alive.test.js` (`npm run test:hardware:parts`), never in the gate
(`tests/unit/index.test.js` skips it by name; refuses to run without `MONSTERBOX_HARDWARE_AVAILABLE=1`). It reads
the node's own character, `parts.json`, `physical-faults.json`, `scene-hazards.json`; skips broken parts and hazard
parts unless `MB_HARDWARE_ALLOW_HAZARDS=1`; pauses head tracking and idle with a lurk event-hold and releases it
afterwards; judges each part by hardware readback and rejects `simulated:true` (PCA duty read back from the chip;
drive pins sampled with `pinctrl`; GPIO level or PCA duty for lights, left as found).

Orlok, 13:20: part 1 actuator ALIVE (PWM pin 12 high in 10 of 72 samples); part 8 lamp ALIVE (GPIO16 lo→hi→lo,
restored off); part 10 jaw ALIVE (ch3 duty 6.4 % @74° → 6.1 % @69° → 6.4 %); part 15 head ALIVE (ch0 duty 7.7 %
@99° → 8 % @104° → 7.7 %); parts 2, 3, 4, 5 skipped (broken; 4 and 5 also hazard). Hold released afterwards.
Not yet run on any other node.

## 5. Unit coverage gaps

`tests/unit/fleet-event-runner.test.js` (7: rotation, quiet-hours refusal and `--force`, busy deferral, failed play
releases every node and exits 1, `played-with-warnings`, lock refusal and stale-lock takeover, `--dry-run`
posts `?dryRun=1` with no releases; runs without `--dry-run` make read-only GETs to the real Goblins);
`tests/unit/fleet-show-tools.test.js` (7: `push-show.sh` argument and missing-show exits, `--dry-run` with
stand-in ssh/scp/rsync, conductor files parse and match `events.json`); `tests/system/fleet-conductors.test.js`
(`install-conductors.mjs --validate-only` against :3100, sha unchanged); `tests/unit/live-data-guard.test.js` (7).

## 6. Other files

`package.json`: `test:hardware:parts`; `--require tests/helpers/liveDataGuard.mjs` on `test:system*` and
`test:ai`. `tests/baseline/character-independence-allowlist.json`: one entry removed (ratchet shrank by one).

## Needs hands

1. `tests/browser/fixtures.js` and `tests/helpers/*` must be committed with the specs (done by the lead).
2. The first guard version briefly rolled back the lead's lock refresh; the worker restored it and `lock:verify`
   is green. Attribution was added because of this.
3. Orlok's webcam part 9 still holds test-written tracking values from earlier runs of the old webcam spec
   (`motionTracking.motionThreshold 42`, `trackingDeadzone 8`, `headTracking.rangeDeg 90`); the operator should
   set the real values.
4. App changes for true isolation: an `MB_DATA_DIR` every service honours; an env override for the goblins path
   in `run-next.mjs`; the parts test endpoint re-stamps the motion sensor's calibration `updatedAt` (ignored by
   the guard for that file only).
5. Service restarts during long suite runs cause ECONNREFUSED failures; coordinate restarts.

Known flaky, not bugs: VU meter, jaw save config, calibration timeout; orchestration dblclick when a restart
lands mid-test; dashboard `networkidle` (never arrives by design, now tolerated).
