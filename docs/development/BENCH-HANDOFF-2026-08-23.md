# Bench handoff — 2026-08-23 (Knight hardening session close-out)

**For the next session: this file is the complete brief.** The outgoing session ran in a
cloud container with NO route to 192.168.8.x — every node command was operator copy-paste.
A session on the LAN can do it directly (`ssh remote@192.168.8.130`, lands in
`/home/remote`, repo at `/home/remote/MonsterBox`).

## THE PRIME DIRECTIVE FOR THE NEXT SESSION

**The head (part 1) WORKS and is calibrated. Do not touch it, do not re-type it, do not
wipe or "heal" its profile, do not re-run any calibration on it unless the operator asks.**
Its exact known-good state is MINTED with a restore procedure in
`docs/hardware/minted/sirdragomir-2026-08-23/` — if anything ever damages its state,
restore from there; never re-calibrate from scratch again.

## Sir Dragomir state at close (node = f068e270 + all pushes through b812137 in repo)

**Channel map is FINAL LAW** (`docs/hardware/PCA9685-CHANNEL-MAP-DRAGOMIR.md`):
jaw = ch3, head = ch7 (multi-turn 900° real), box = ch11 (inverted). Asserted idempotently
by `scripts/bench/knight-finish.sh`, which also refuses to end quietly on any channel
collision. Do NOT assert any other map, ever.

**Calibrated 2026-08-23, all stamps flipped, by the operator's hands and eyes:**
head window **323–491** real degrees (center preset 390), jaw **27–74**, box **16–178**
(invert:true; min=closed, max=open). Camera/mic/speaker stamped via the new universal
Calibrated stamp.

**WORKING at close:** head (moves, calibrated, window enforced). Camera (picture by eye).
Speaker (TTS heard earlier). Server healthy on v10.4.0 code.

**BROKEN at close (the fresh session's first job):** operator reports **jaw (ch3) and box
(ch11) stopped moving** at the very end of the session — after calibration succeeded and
after a spontaneous full-Pi reboot. Undiagnosed; no logs captured yet. See issue #1.

## Session close-out addendum (later on 2026-08-23)

The operator returned to the bench and closed out most of the list below:

- **Issue #1 RESOLVED at the bench:** operator confirms jaw and head servos working and
  calibrated ("no jaw issues"); the earlier jaw/box outage was transient (post-reboot state,
  never reproduced). The minted snapshot remains the recovery record.
- **Issue #2 RESOLVED:** the container's red gate was environmental (wedged local test
  server — kill strays and restart it, see the rules section), but the logged
  `turnOn not supported` errors exposed the real audit defect: the `led` hardware
  controller carried no `turnOn`/`turnOff` actions, so EVERY gesture and pose light step
  on a `type:'led'` part failed while the brightness slider worked. Fixed: `led.turnOn`
  / `led.turnOff` now alias the real brightness path (unit-tested).
- **Issue #3 CLOSED by operator ruling:** don't worry about the Pi reboot. The
  `vcgencmd get_throttled` note stays here for whenever it recurs.
- **NEW, shipped at close-out:** head tracking and motion tracking are now MUTUALLY
  EXCLUSIVE by operator ruling — starting motion tracking shuts head tracking down
  (visible in the API response and `.err`), enabling head tracking takes over a
  motion-only session with a named log line, and an OpenCV tracker that dies
  UNEXPECTEDLY now logs to `.err` with its exit code and leaves a tombstone status
  (`active:false, exited:true, exit_code`) instead of silently deleting all state —
  the "OpenCV was working and just stopped, settings perfect" mystery now always has a
  named cause in `/var/log/monsterbox.err`.

## Open issues, in priority order (status per addendum above)

1. **Jaw + box not moving (head fine).** Undiagnosed. Diagnostic path:
   - Drive each via `POST /api/calibration/2/goto {"angle":50}` and
     `POST /api/calibration/3/goto {"angle":97}` while watching, then read the RESPONSE
     BODY (errors are honest now — a refusal names its cause) and
     `tail -30 /var/log/monsterbox.err`.
   - If responses claim success but nothing moves: channel-vs-pin mismatch is ruled out
     (map is final and was verified moving at calibration), so suspect POWER: the Pi
     spontaneously rebooted once (~00:58Z) — a brownout or a dropped servo rail can kill
     two channels' power while ch7's rail survives. Check the servo PSU, fuses, and the
     rail feeding the ch3/ch11 leads; run `vcgencmd get_throttled` (nonzero = undervoltage
     since boot, confirming power trouble).
   - Also possible: both were tested through a path the head doesn't use. Compare a
     calibration-page drive vs `POST /api/parts/2/test`.
   - The box is `invert:true` with window 16–178: an inverted drive mirrors within the
     window; if it "moves the wrong way but moves," that's invert, not dead.

2. **Gate is RED in the outgoing container and commit `b812137` was pushed anyway**
   (docs-only mint commit; the red pre-dates it in that container). `test:smoke` fails in
   `tests/unit/gesture-engine.test.js:259` — `Action 'turnOn' not supported for part
   type: microphone` / `motion_sensor` via `gestureEngineService.setLight`
   (`services/gestureEngineService.js:266`). **First check CI for `b812137`:** if the
   "CI Test Suite" workflow is green there, this is container-local data drift; if red,
   the prime suspect is `07228a4`'s universal device-profile change
   (`server/calibration/router.js` now auto-creates a `{kind:'device'}` profile for every
   part type) interacting with gesture/pose part selection — something may pick "parts
   with profiles" as controllable lights. Fix by filtering pickers on part TYPE, or
   narrowing where device profiles surface. Do not revert the universal stamp itself —
   the operator explicitly wants it.

3. **Spontaneous full-Pi reboot (~2026-08-23T00:58Z), root cause unknown.** Boot marker in
   journal between service starts; app auto-recovered; state survived. `vcgencmd
   get_throttled` + `sudo journalctl -b -1 -n 40` (previous boot's tail) decide
   power-vs-kernel. If undervoltage: the Pi should not share the servo supply — hardware
   item for OPERATOR-TODO. Likely related to issue #1.

4. **Runtime-path proof never ran (mission step 4).** Once jaw/box move again: create and
   execute one pose through the REAL runtime (not the calibration page), operator's eyes
   confirming:
   ```bash
   curl -sk -X POST "https://localhost:3000/poses?characterId=4" -H 'Content-Type: application/json' \
     -d '{"name":"bench-proof","parts":[
       {"partId":1,"type":"servo","target":{"angleDeg":390}},
       {"partId":2,"type":"servo","target":{"angleDeg":50}},
       {"partId":3,"type":"servo","target":{"angleDeg":97}}]}'
   # then, with the returned pose id:
   curl -sk -X POST "https://localhost:3000/poses/<id>/execute?characterId=4"
   ```
   All targets are mid-window. The head rides the multi-turn per-part seam (never the
   0-180 batch) — that path is unit-tested.

5. **Audit backlog:** 45 unverified findings with file:line evidence in
   `docs/evidence/knight-audit-2026-08-22/` (8 confirmed ones were fixed; the README
   there lists what was deliberately deferred — unified legacy page, Learn Movement,
   LED pose dispatch, jaw multi-turn seam, Body Map override nudges, etc.).

6. **Pre-existing open items:** XVF3800 mic capture still zero-frames (K4; PyAudio-only,
   judge on FRAMES); Node.js CI carries 4 inherited ECONNREFUSED failures (server-less
   workflow leg — not a regression signal unless the LIST grows); "CI Test Suite" is the
   authoritative workflow and was green through `f068e27`.

7. **v11 ship path:** tonight closed the "Dragomir part-1 supervised calibration"
   standing blocker. Remaining: Wave 6 (ghost/dead settings sweep) and Wave 8
   (verify + ship: bump to 11.0.0 only at ship, per V11-EXECUTION-PLAN).

8. **Mina is next** (operator direction). `docs/hardware/MINA-REBUILD.md` is the runbook:
   backup FIRST (§1), her restored backup carries the OLD channel map — §3a override curls
   the moment her server answers (they have NOT landed), then acceptance (§4). Her canon
   volume gets re-tuned at acceptance. Consider minting her config the same way once done
   (`docs/hardware/minted/` pattern).

## What shipped this session (all on main + claude/monsterbox-v11-production-5gntng + claude/dragomir-hardware-hardening-uibq85)

- `07b410f` sweep test paces each leg by real travel time (was: six legs in <1s).
- `d1de129` daemon channel refusals reach the caller (`ChannelDenied`; no more
  "Moved to 60°" with zero pulses); denials never fall back to one-shot wrappers.
- `7b3e8f4` audit fix batch: pose editor + Animation Studio speak real degrees (0-900);
  dispatch treats declared non-180 range as multi-turn even if servoType string is lost;
  batch path diverts continuous servos and honors model defaults; characterId threaded
  through calibration router, click-to-track, head-tracking detection, parts test route;
  servoType/rotationRangeDeg/channel writer validation; 'multi-turn' in every UI select;
  head-animation test whitelist accepts multi-turn.
- `ad184e8` head un-listed from physical-faults after calibration; **old daemons die on
  every restart** (startup eviction + deploy-side pkill) — "make sure the old version is
  dead" is now structural. NOTE: physical-faults.json is no longer advisory — the daemon
  vetoes listed parts' channels for every caller, BY CHANNEL (a channel-mate gets
  silenced too; that's what ate the box for an hour).
- `07228a4` FINAL channel map minted into script+docs+skill; Calibrated stamp on every
  part type (device profiles).
- `f068e27` data-file revert (test artifact).
- `b812137` minted known-good config + restore procedure; windows recorded in docs.
  (Pushed while the container's gate was red — see issue #2.)

## Rules that bind the next session (unchanged + hard-won)

- Motion is proven by eyes, audio by ear-check, capture by FRAMES. Success fields and
  version strings lie; `/var/log/monsterbox.err` holds the reasons (errors are honest
  now — read them instead of retrying).
- Release a channel before plugging/unplugging any servo lead.
- Code reaches nodes by rsync deploy or code-paths-only checkout (never `git pull`,
  never checkout `data/`); channels travel by overrides curls, never by committing
  node-local files. The minted snapshot is the ONE deliberate exception, as a recovery
  record under docs/.
- Never drive Orlok parts 3/4/5. PumpkinHead/Groundbreaker offline = expected.
- `npm run test:unit` + `npm run gate` before every push — and check the PIPELINE exit,
  not `| tail`'s (that's how a red gate slipped through once tonight).
- The cloud container's test server can wedge after repeated suite runs: symptoms are
  hangs + phantom ECONNREFUSED; fix is kill strays (`mocha`, `servo_daemon`, extra
  `node server.js`) and restart the 3100 server, then re-run before believing failures.

## Ready-made prompt for the fresh session

See the operator's copy; canonical text lives with this handoff so any orchestrator can
launch it: read this file top to bottom, then CLAUDE.md + monsterbox-hardware +
monsterbox-fleet skills, then fix issue #1 (jaw+box) without touching the head, verify
issue #2 (CI on b812137 / gate), run the runtime proof (#4), then Mina (#8).
