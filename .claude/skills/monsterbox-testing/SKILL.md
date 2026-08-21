---
name: monsterbox-testing
description: Running MonsterBox test suites without wrecking the node or chasing phantom regressions — the one browser-suite invocation that works, the ports and their live-hardware semantics, suites that mutate operator state, and what counts as proof (ear-check, grep-on-node) versus what lies (success fields, version strings). Load before running any suite or interpreting its failures.
---

# MonsterBox testing

## The browser suite — one invocation works, the obvious ones don't

```bash
MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test tests/browser --reporter=list
```

- `npm run test:browser` starts its own server on 3200 and trips `server.js`'s
  single-instance PID guard; Playwright reports a **config** failure that reads exactly like
  a test failure. Multiple sessions have chased that non-existent regression.
- `node scripts/test-runner.mjs --suite browser` has the same defect (never sets
  `MB_USE_RUNNING_SERVER`). The unified runner is fine for unit/system suites only.
- Full suite ≈ 50 min on a Pi 4B. Prefer area commands (`test:browser:jaw`, etc. — table in
  CLAUDE.md) or a single spec.

## Ports and their semantics

| Port | What | Danger |
|------|------|--------|
| 3000 | production HTTPS | real fleet, real hardware |
| 3100 | always-on test HTTP listener | **runs `NODE_ENV=production`, `MB_TEST_MODE` unset — hardware endpoints drive REAL hardware.** Only the `?dryRun=1` QUERY param short-circuits scene play (not a body field). A suite once drove a coffin actuator 8.5 s twice per run. |
| 3200 | Playwright-spawned server | PID-guard collisions (above) |

Orchestration system tests against production fire REAL fleet commands — only ever run them
against a test-mode server.

## Suites that mutate operator state

- The gate once wrote **5 SSH keypairs to `~/.ssh` per run** (760 found) via the system-admin
  guard test; fixed, but watch for the class: a test that reaches a real handler mutates real
  state.
- A suite once left the whole fleet **permanently muted** (mute persists to
  `data/speaker-state.json` and reapplies at boot). Snapshot-and-restore operator state; and
  never commit a service-written data file while a suite is running (`jawAnimation.enabled`
  transient got committed once).
- `test:unit` writes `selectedCharacter: 1` to app-config; hostname auto-select corrects it
  on service restart.

## What counts as proof

- **Audio: ear-check (record + transcribe), never an API success field.**
  `generate-and-play` returns `{"success":true,"played":true}` **while muted**. Check
  `muted:false` first, or record and measure. `npm run earcheck` from Orlok only (SSH trust);
  confirm any `OFFLINE` with `curl -sk .../health` before believing it.
- **Deploys: grep the node for the changed symbol** — `/health` version and git HEAD both lie
  (rsync moves files, not git). `/fleet-verify` automates this.
- **Logs: read BOTH.** `console.log` → `/var/log/monsterbox.log`; `warn`/`error` → **only**
  `/var/log/monsterbox.err`. The refusal reason is in `.err` while `.log` reads healthy.
  Establish the boot boundary before reading a tail — `.err` has no timestamps.

## Triage baseline

Pre-existing intermittents (not regressions): VU meter, jaw-animation save-config,
calibration timeout, audio-setup dry-run without a mic. The gate (`npm run gate`, ~30 s) runs
on every push; granular commands and the full speed-tier table live in CLAUDE.md.
