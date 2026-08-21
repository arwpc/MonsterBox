# v11.0 Production-Readiness — Session Handoff

**Written:** 2026-08-21, ~10:00Z
**Repo state:** `48fd5e33` on `main`, pushed. Gate green (6/6) on every commit.
**Version:** `package.json` is still `10.4.0`. Bump to `11.0.0` only at the release tag.
**Working tree:** clean apart from node-local files that must NOT be committed (see §6).

---

## 0. One-paragraph brief

Aaron wants v11.0 shippable for Halloween and is tired of recurring minor faults. This session
audited production readiness (29 verified findings), then fixed all three calibration show-stoppers
plus a class of defect nobody had named: **software driving hardware the operator knows is broken**.
The remaining work is a list of majors and minors in §4, and six physical items only Aaron can close
in §5. Two of three live characters still cannot perform because of hardware, not software.

---

## 1. Where the audit lives

| What | Where |
|---|---|
| Calibration findings (17), full text | workflow journal `wf_19918891-769/journal.jsonl` |
| Uptime/pages findings (12), full text | workflow journal `wf_8456184e-cce/journal.jsonl` |
| **All 29 findings, machine-readable** | `docs/evidence/v11-audit-2026-08-21/findings-*.json` — committed |
| Calibration UI digest (17 findings, prose) | `docs/evidence/v11-audit-2026-08-21/v11-calib-surfaces.md` — committed |
| Uptime/perf digest (12 findings, prose) | `docs/evidence/v11-audit-2026-08-21/v11-uptime-perf.md` — committed |
| Operator hardware checklist | `docs/hardware/OPERATOR-TODO.md` — canonical, committed |
| Prior plan (still largely valid) | `docs/development/V11-HANDOFF.md` |
| Earlier research corpus | `docs/evidence/v11-research/*.json` |

Journal path root:
`/home/remote/.claude/projects/-home-remote-MonsterBox/915d1866-fef0-545d-952f-c45a099ca73a/subagents/workflows/`

Extract findings with:
```bash
python3 -c "
import json,sys
for line in open(sys.argv[1]):
    o=json.loads(line)
    if o.get('type')!='result': continue
    r=o.get('result')
    if isinstance(r,dict):
        for f in (r.get('findings') or []):
            print(f.get('severity'), f.get('id'), '|', f.get('title'))
" <journal.jsonl>
```

The `/tmp` digests have already been copied into `docs/evidence/v11-audit-2026-08-21/`, so nothing
depends on `/tmp` or on the workflow journals surviving.

---

## 2. Show-stoppers — all 4 real ones accounted for

| # | Finding | Status |
|---|---|---|
| 1 | `sweep-placeholder-fullspan` — Sweep Test drove an unmeasured servo full-span ×3 at 100%, unclamped, while the UI showed the placeholder as a measurement | **FIXED** `bd0cc48c` |
| 2 | `markers-invisible-live-fallback` — invisible, uneditable `part.markers` were the live jaw guardrail fallback; one part carries Min 63/Max 131 against a measured 33–98 | **FIXED** `a356ff2a` |
| 3 | `invert-split-brain` — two different invert formulas, 756 µs apart on a live part | **FIXED** `a356ff2a` |
| 4 | `UP-1` — webcam "apply device" destroys the self-healing mjpg launcher | **REFUTED** — app runs as `User=remote`; the systemd drop-in dir is root-owned, so the write gets EACCES. Not reachable. |
| 5 | `UP-2` — head-tracking held a pan servo it had refused to drive, starving the idle loop | **FIXED** `48fd5e33` |

**All show-stoppers are closed.** `UP-2` was an ordering bug: `maybeDriveHead()` claimed the pan servo
at priority 80 and only afterwards discovered the servo had no usable window, so the servo was locked
to an owner that would never move it — 239 refusals alongside "All servos preempted by higher
priority, pausing...". The guardrail check now precedes the claim and actively releases when there is
no window. Head tracking also still fell back to legacy `part.markers` for guardrails; that was
retired here too, matching the jaw fix.

---

## 3. Also fixed this session (not from the finding list)

These came out of the work rather than the audit, and matter more than most of the majors.

- **`isTestSafePart()` had INVERTED.** It reads `config/hardware-safety.json`, emptied by operator
  ruling 2026-08-20, so it returned `true` for every part. `tests/system/parts-api.test.js` — written
  specifically to skip the fuse-rail servo — began selecting `servos[0]`, the dead elbow.
  `npm run test:system` drove it to 50° then 77°, and a queue loop drove the damaged bow 5 s twice
  per play while the damaged left arm accumulated 111 drives. New `config/physical-faults.json`
  carries physical-damage truth. **It is NOT a revival of the retired limit system** — it refuses no
  operator command; only code that picks a part on its own initiative consults it. Consulted by
  `isTestSafePart`, `sceneExecutor.executeStep`, `poseEngine.executePose`, `batchMoveServos`,
  `headAnimationSuperPowerService.getAvailableServos`, and `stallGuard`. (`1b3ad059`, `a356ff2a`)
- **Nothing ever released a PWM channel.** A PCA9685 latches its registers, so a stall outlives the
  process — it survives an app restart *and* a reboot. New `services/hardwareService/stallGuard.js`
  sweeps at startup, shutdown, and every 5 minutes, releasing ONLY broken-part and unmapped channels.
  (`1b3ad059`, `a356ff2a`)
- **Two servo model records corrected** against manufacturer data: Stingray-2 voltage 4.8–6 V →
  **4.8–8.4 V** (900° rotation confirmed), and RDS51150 notes now record the verified **9–12.6 V**.
  (`84f587cd`)
- **Browser suite 18 failures → 1.** 16 were tests waiting for `networkidle` on a dashboard that
  holds an EventSource, a WebSocket and 1 s/1.5 s/3 s polls — unreachable by design. 1 was a real UI
  dead zone (a Bootstrap tooltip covering the adjacent Audio Library control). 1 is hardware.
  (`781a56b0`)
- **Head tracking no longer offers broken servos** as pan candidates. (`781a56b0`)
- **Orlok's head window restored** from `docs/character_orlok.md` (`3–169°`, human-calibrated
  2026-08-19) — the live store held a `0–180` placeholder, so head tracking refused 239 times. Now
  `calibrated: true`, `canEnable: true`, offering only servos 10 and 15. **Node-local, deliberately
  uncommitted.** Wants physical confirmation (§5-F).
- **Orlok part 5 modelId** corrected from a 40 kg `ds3240mg` to the 150 kg part, which silenced a
  false `mixes incompatible voltage classes` warning that had fired on every boot
  (`⚠ servoChannels: warning` → `✓ servoChannels: ok`). **Node-local, uncommitted.**

---

## 4. OPEN findings, by severity

Verified and surviving adversarial review unless marked. Several verify agents died on the session
limit — those are marked *(unjudged)* and should be re-verified before acting.

### Uptime / performance — majors
| ID | Title | Note |
|---|---|---|
| UP-3 | Video geometry has four disagreeing sources; UI advertises 1080p30 while the stream is VGA15 | Aaron explicitly asked for ONE canonical resolution applied to all six characters, including offline nodes |
| UP-4 | `performance-history.json` fully rewritten every 5 min — ~427 MB/day of SD writes, non-atomic | SD-card life |
| UP-5 | No liveness watchdog: an app alive but not serving on :3000 is never auto-recovered | Verifier's correction is important — do **not** use `WatchdogSec`+`sd_notify` (no dep, `MainPID` is npm). Use a systemd timer curling `/health` with a 3-consecutive-failure threshold. |
| UP-6 | `characters.json` and the tts-config class written non-atomically | Verifier says start with `sceneAnalyticsService.js:195` — 13.8 KB rewritten non-atomically on **every scene execution** |

### Uptime / performance — minors
`UP-7` per-servo-move logging is 53% of the log · `UP-8` `/tmp` on SD, 140 crontab backups
accumulating · `UP-9` motion-tracker churn 144 cycles (**symptom of the USB fault, §5-A — fix power
first**) · `UP-10` 50 MB body limit · `UP-11` `ExecStart=npm start` keeps a 60 MB wrapper resident
(cosmetic) · `UP-12` goblin reconnect loop polls storage nodes forever (cosmetic)

### Calibration UI — majors
| ID | Title |
|---|---|
| `edit-save-wipes-config` | Edit-tab Save rebuilds `config` from scratch and PUTs wholesale, **erasing keys written by other tabs** (motion/head-tracking tuning, model overrides) |
| `mic-sliders-dead-route` | Mic Sensitivity is a total no-op; Gain never persists. Both POST to `GET /setup/calibration/api/parts/:id` — a route that does not exist |
| `continuous-jog-saturates-success` | Continuous-servo CW/CCW jog silently stops moving hardware at the estimated-position rail while reporting success |
| `overrides-cannot-be-removed` | Blank fields are skipped, "Revert to Model" is a server-side no-op, and the Effective panel updates optimistically even when the save FAILED |
| `ghost-pulse-override-fields` | Min/Max/Neutral Pulse + Rotation Range override fields are ghosts — the runtime drive path never reads them *(unjudged)* |
| `calibrated-stamp-only-on-hidden-page` | Two parallel calibration pages; the "Calibrated" trust stamp lives only on the hidden one *(unjudged)* |

### Calibration UI — minors
`safety-tab-dead` (verifier downgraded major→minor; deleting it **breaks
`tests/browser/webcam-calibration.spec.js:181-192`, remove that test in the same change**) ·
`simple-cal-ghost-editor` (downgraded to minor; note there is a **THIRD** min/max surface the finding
missed — the Markers `setMinBtn`/`setMaxBtn` writing `config.markers`) · `test-buttons-unconditional-done`
*(unjudged)* · `preset-field-name-drift` — `addPreset` writes `{position}`, executor reads `{angle|p}`
*(unjudged)* · `characterid-param-ignored` *(unjudged)* · `lastcalibrated-means-lastwritten` *(unjudged)* ·
`orphan-save-pulse-fabricates-presets` *(unjudged)* · `stale-profile-wrong-kind` (cosmetic)

### Found in passing, not in the audit list
- **Orlok's speaker `audioDeviceId` drifted** from the explicit XVF3800 sink to `"default"`, and
  mic/speaker grew `sampleRate`/`gain`/`bass`/`treble`. Settings-clobber class. Left uncommitted.
- **`/api/system/volume` lies**: reports `100%` while `wpctl` shows the sink at **1.30**. Touching the
  slider silently drops ~23%.
- **The speaker mute flag was ON** — the show played silence. Cleared via
  `POST /conversation/api/speaker-mute {"muted":false}`. Nothing on any dashboard surfaces it.
- **`data/calibration_profiles.json` is cross-contaminated.** One keyed file, `character:part`. The
  Dragomir node holds 10 character-3 and 2 character-1 profiles, and where a key exists on two nodes
  **the values disagree** (char 3 part 15 is `0–180` placeholder on Orlok, measured `60–180` on
  Dragomir; char 4 part 2 is `97–151` on Dragomir, `97–166` on Mina).
- **`data/models/*.json` is written at runtime** — not a read-only catalogue.
- **Scene 107's goblin step is broken**: `goblin.step requires videoId`, scene carries only `goblinId`.
- **Dragomir's `parts.json` diverges from Orlok's copy of it** (jaw ch0 vs ch1). Each node's own copy
  is authoritative for itself.

### RESOLVED — the phantom channel leak (`92e68ae5`)
A full `test:system` run kept energizing the broken elbow's channel at 1445.3 µs with **no
corresponding command in the Node-side log**. Found by instrumenting rather than guessing: a
read-only register watcher showed the write at a fixed offset (deterministic); running the suspected
suite alone did NOT reproduce it (so, background actor); `lsof /dev/i2c-1` showed the only persistent
holder is the servo daemon — and it is `jaw_servo_daemon.py`, a 34-line shim over `servo_daemon.py`,
not the file being read. A trace at that daemon's single write chokepoint proved it: 226 writes,
222 to the jaw, **2 to the broken part's channel**. The Node layer logs its *intent*, not what
reaches the chip, which is why every earlier search came up empty.

The deny now lives at the transport: `servo_daemon._write()` refuses to ENERGIZE a channel owned by a
part declared broken (releases still allowed, so a stall can be cleared). That daemon is the only
persistent owner of the I2C bus, so the stdin jaw protocol, the unix socket and one-shot CLI calls all
funnel through it — nothing can bypass it. `MB_SERVO_TRACE=1` leaves the trace permanently available.
`tests/unit/broken-channel-denial.test.js` pins it as a cross-language contract, because
`physical-faults.json` is now read by both runtimes and a silent disagreement would reopen the leak.

---

## 5. Needs Aaron's hands — canonical list in `docs/hardware/OPERATOR-TODO.md`

| | Item | Why it matters |
|---|---|---|
| **A** | **Powered USB hub** for the camera + ReSpeaker mic array | **447** over-current events in one boot (155 four hours earlier — accelerating). Root cause of the 144 motion-tracker respawns, the last browser failure, and the 2026-08-17 42× mjpg crash-loop. Highest value. |
| **B** | Dedicated supplies + fuses for elbow/forearm | **12 V is correct; 24 V would destroy them.** RDS51150 is 9–12.6 V, stall 8.0 A @ 12 V (manufacturer-verified). If the installed servos really are 12–24 V they are a different model — read the label first. |
| **C** | Knight's head: move jaw servo **ch0 → ch1**, then `POST /api/calibration/1/nudge?characterId=4 {"dir":"max","scale":"med"}` | Settles dead-channel vs live. Two measurements conflict: +0.4 dB (2026-08-19) vs +10.33 dB (2026-08-21). |
| **D** | Eyeball the knight's head + cable loom | One probe commanded `move_to_pca 60→90` = 277 µs ≈ **125° on a 900° servo**, beyond the ±45° cleared. If ch4 is truly dead, nothing moved. |
| **E** | Mina neck ch8 + eye ch11 — treat as **one** shared V+/harness branch | ch8 gets correct changing PWM and does not move. Move jaw `ch4 → ch8`, then `→ ch11`. Her eye laser proves nothing about V+ (3 V relay off the signal pin). |
| **F** | Confirm Orlok's restored **3–169°** head window at the rig | Doc-sourced restore, not re-measured. |

---

## 6. Rules that will bite the successor

- **Never commit node-local files.** `data/character-*/parts.json`, `poses.json`, `super-powers.json`,
  `data/calibration_profiles.json`, `config/app-config.json` are per-node, excluded from deploy, and
  the current working copies carry unrelated drift (including the `audioDeviceId` regression). They
  show as permanently modified. That is normal.
- **`config/` IS deployed** (except `app-config.json`); so are `data/models/` and
  `data/character-*/scenes.json`. `parts.json` and `poses.json` are NOT.
- **Browser suite invocation** — the npm script self-collides on the PID guard:
  `MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test tests/browser --reporter=list --workers=1`
  Port 3100 runs `NODE_ENV=production` against **real hardware**. 533 tests, ~1.1 h at `--workers=1`.
- **Aaron's advice on long runs:** anything over 10 minutes has probably already failed, and the
  signal usually appears early — tail the log rather than waiting.
- **Do not re-add per-part safety limits.** `config/hardware-safety.json` is empty by permanent
  operator ruling. `config/physical-faults.json` is a different thing and is the right place for
  "this hardware is broken".
- **`servo_cli.py` angle scales differ**: `move_to_pca` is 0–180, `move_to_pca_multi` is 0–1800, both
  over 500–2500 µs. A 4 µs "probe" through the multi path faked a dead channel this session.
- **PCA9685 `LEDn_OFF` bit 12 is the full-off FLAG**, not a tick count. Use
  `servo_cli.py reconcile 0x40`, which masks it and joins the chip to that node's `parts.json`.
- **SSH lands in `/home/remote`, not the repo.** Use `cd /home/remote/MonsterBox &&` or absolute paths.
- **Delegation lesson from this session:** two workflows died with agents stalled on un-timeouted
  `ssh`/`arecord` and 0 journaled results, burning ~850 k tokens. Deterministic shell work belongs
  **inline in the lead session**, where results are checkpointed. Wrap every remote command in
  `timeout`. Memory: `orchestrate-dont-grind`, `agent-shape-not-agent-count`.

---

## 7. Exact next steps, in order

1. **Fix `UP-2`** (head-tracking claim leak) — the last show-stopper. Re-measure first: Orlok's head
   now has a real window, which may have changed the behaviour.
2. **`UP-3` — one canonical webcam geometry.** Aaron asked for this by name. Decide the value, name
   the single owning file, and make all six characters inherit it identically, including the four
   offline nodes (staged now, deployed later). Note `mjpg-launcher.sh` + `/etc/default/monsterbox-cam`
   is the real path today, and its `by-id` device resolution must be preserved.
3. **`UP-6`/`UP-4` SD-card and power-loss work**, starting with `sceneAnalyticsService.js:195`.
4. **Calibration majors** in the §4 order. `edit-save-wipes-config` first — it destroys operator work.
5. **Then run the full suite** and re-baseline. Expect 532/533 with the webcam capture failing until
   the USB hub is fitted.
6. **Do not tag `v11.0.0`** until items A–F in §5 are closed or explicitly waived by Aaron. Two of
   three live characters still cannot perform.

---

## 8. Verified baseline at handoff

```
gate            6/6 green
unit            472 passing (18 new this session)
system          366 passing
hardware         44 passing
browser         532 of 533 (the 1 is the USB camera dropping off the bus)
service         active, 0 restarts, no throttling
fleet           .120 / .130 / .140 all HTTP 200
held channels   ch0 (head) + ch3 (jaw) only — no broken part energized
show-stoppers   4 of 4 closed (3 calibration + UP-2); UP-1 refuted as unreachable
```

---

## 9. Cloud vs bridge — what the successor can and cannot do remotely

The successor runs in a CLOUD environment, not on this Pi. Most of the remaining work is fine there;
a specific subset is not.

**Fine in the cloud** — all of the open calibration majors and minors, `UP-3` (choosing the canonical
webcam geometry and where it lives), `UP-4`/`UP-6` (atomic writes, SD-write reduction), `UP-7`,
`UP-8`, `UP-10`, `UP-12`, plus `npm run gate`, `test:unit` and `test:pact`. These are code and data
changes verifiable by reading, by unit tests, and by the gate.

**Requires the bridge machine (this Pi), because it needs real hardware or a real node:**
- Anything reading or writing the PCA9685 — `servo_cli.py reconcile`, channel probes, the stall guard,
  the `MB_SERVO_TRACE` path. There is no chip in the cloud.
- `npm run test:system` and `npm run test:browser` against port 3100/3000. Port 3100 drives REAL
  hardware; the suites also exercise the daemon, the camera and audio. Cloud runs of these are not
  meaningful and should not be treated as verification.
- Ear-checks and anything about audio routing, volume, or the mute flag.
- The webcam/mjpg-streamer path, `/etc/default/monsterbox-cam`, and the USB over-current work.
- Reading a peer node's own `parts.json` / `calibration_profiles.json` over SSH; fleet SSH trust lives
  on this box.
- Deploying (`npm run deploy:all`) and any grep-on-node verification.
- Every item in §5.

**So:** the cloud successor should write the fix, prove what it can with unit tests and the gate, and
explicitly hand the hardware verification back — labelled as unverified until run on the bridge.
Do not report a hardware-dependent fix as proven from the cloud.
