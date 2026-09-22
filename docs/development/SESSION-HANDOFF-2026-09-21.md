# Session handoff — 2026-09-21 (Sir Dragomir) → next session (Mina)

Written at the end of a long Dragomir session. Everything below is committed and
pushed to `origin/main`, and deployed to every reachable node.

---

## 1. Where things stand

**Sir Dragomir (char 4) is FINISHED and LOCKED.** 13 config files fingerprinted.
`config/character-locks.json` now freezes three characters: PumpkinHead (1),
Sir Dragomir (4), Renfield (6).

**Fleet:** all five reachable nodes healthy on 10.6.0, all un-muted.
**Renfield (6) is OFF the network** — no ping, no SSH, not advertising on mDNS.
He missed every deploy this session and is the one node still unverified.

**Main is green:** full gate passes (schemas, resolver, independence,
design-system, smoke, pact). 756 passing, 0 failing, 45 pending.

---

## 2. The big lesson of this session — read before touching a lock

`MB_ALLOW_LOCKED_CHARACTER_WRITES=1` is **not** a safe way to run tests on a node
whose character is locked.

It was tried here. **One run wiped PumpkinHead's `parts.json` from 233 lines to
5**, destroying his Body Shakes motor config — including the PWM limits that stop
a 100% start browning out his Pi. Restored from git; `lock:verify` caught it.

The suites now SKIP a locked character instead (`tests/helpers/lockAware.js`),
and Mocha reports those as *pending* so the coverage gap stays visible. If you
lock Mina, expect the same pattern and use the same helper — do not reach for the
env var.

---

## 3. What was fixed this session (all on main)

| Area | Root cause |
|---|---|
| "Very slow with AI on", video ~5s behind | **Two** `motion_tracking_service.py` on one camera, ~77% CPU each. Both start paths registered the tracker *after* an `await`, so a concurrent start spawned a competitor and orphaned the first. Fixed with an in-flight guard. |
| Audio Library "fails everywhere" + "they default to mute" | Same bug. Fleet Emergency Stop called `disarm.mute(true)`; that mute persists to disk and restores at boot, and nothing ever un-muted. Hidden because muted playback returns `success:true` and the clients ignored `muted`. |
| Loop button made noise on a muted node | `audioLoopService.startLoop` had no mute check and the route bypassed `serverPlaybackService`. |
| Head-tracking config "does nothing" | The hot-update route dropped 4 of 12 keys including `detectionMode` — which is what the preset buttons are defined by — while still returning `success:true`. |
| Head-tracking panel bottom cut off | `head-animation.css` was the pre-`be04fc33` copy; only the left column scrolled. |
| Hard to speak over any character | See §4. |
| Dragomir on the wrong mic | Part was named "Webcam Microphone" with `deviceId:"default"`, which resolves to a broken ALSA path (zero frames). Pinned to the ReSpeaker node; the XVF3800 sink no-suspend rule was also missing on this node. |
| Jaw barely opened | `sensitivity: 0.6` multiplying an already-normalized 0..1 signal = a hard cap at 64% travel. Now 1.6. |
| AI off left everything running | Dashboard now cascades AI-off to jaw, LED-talk, head tracking, AI motion, follow-orders. |
| Locked character returned 500 | Jaw routes now answer **423**, matching the LED/movement routes. |

---

## 4. Barge-in — how it works now (affects ALL characters)

They were hard to speak over *structurally*: the mic stays open during playback,
but the mic loop **replaces the real microphone with synthetic room floor** before
it leaves the node (`elevenLabsWebSocketService.js`, the `_floorFrameB64` path),
plus a 2.5 s tail. So ElevenLabs' turn model literally cannot hear the guest, and
its `interruption` event — whose handler already existed — could never fire.

That gate stays: it is what stops the character's own reply tail and the servo
whine beside the mic being transcribed back as spurious guest turns.

Detection now happens locally, against a **learned echo floor** (how loud this
node sounds to its own mic while speaking), so an AEC array and a bare USB mic
both self-calibrate with no per-character config. Guards: 3-frame run (~750 ms),
an absolute floor, and a 700 ms grace period.

- `shouldBargeIn()` is pure and exported — 11 unit tests in `tests/unit/barge-in.test.js`
- `_bargeIn()` stops audio, stops the jaw, returns the eyes to `listening`, drops
  queued agent audio, and clears mic suppression character-wide
- Manual: `POST /conversation/api/stop-speaking`
- Back out entirely with `MB_BARGE_IN=0`

**Not yet proven by ear.** Worth doing on Mina: talk over her mid-reply.

---

## 5. Open items for the next session

### Requested but NOT yet done
1. **PIR events in the AI window** — when the PIR fires, surface it in the AI
   panel. `services/speechLogService.js` + the AI panel feed is the likely path
   (it already records scene speech via `recordSpeech`).
2. **Brief coloured status lines in the AI window** when a character responds to
   an order or moves a part.
3. **Both Dragomir and Mina are too long-winded.** This is the ElevenLabs AGENT
   prompt, *not* local `tts-config` — see `agent-voice-vs-local-tts` in memory.
   Edit each agent's system prompt to demand short answers unless asked to
   elaborate. Dragomir is LOCKED, but his agent config lives at ElevenLabs, not
   in `data/character-4/`, so this does not need an unlock.

### Known problems
4. **Dragomir's PIR does not fire.** Frozen at GPIO 23 at operator direction with
   the pin **UNVERIFIED** — the part description records the whole finding. With
   the app's watcher stopped, GPIO 23 read 0 HIGH across 160 samples over 40 s of
   real movement, and a sweep of every claimable GPIO (4–27) found nothing
   toggling. **GPIO 7 and 8 could not be tested** (the SPI driver holds them) — a
   data wire on either would explain the silence. Check power and the data pin.
5. **Renfield offline** — needs power/network, then `npm run deploy:all`.
6. **Dependabot: 5 vulnerabilities** (4 high, 1 low) on the default branch,
   untouched this session. `gh` token is dead; read them with
   `npm audit --package-lock-only` per lockfile.
7. **The 5 parked neck commits** on branch `dragomir-neck-local-2026-09-21` were
   built on the theory that his neck fault was software. The operator found the
   real cause: **a bad solder joint inside the servo**. Recommend dropping them.
8. **The riddle scenes have never been played end-to-end on hardware.**

---

## 6. Starting the Mina session

Mina is **character 2**, `192.168.8.140`. She is NOT locked.

```bash
ssh remote@192.168.8.140          # lands in /home/remote, NOT the repo
cd /home/remote/MonsterBox
```

Read first: `CLAUDE.md`, then memory `MEMORY.md`. Then:

```bash
git log --oneline -10
npm run lock:status
curl -sk https://localhost:3000/health
```

### What is already known about Mina (verify, don't trust)
- **Her hardware has been unstable** — hard power-loss events were recorded
  2026-08-20. Treat her as suspect before blaming software.
- **Her PCA9685 emits correct PWM but nothing moves** → servo V+ power/fuse was
  the last diagnosis. Check that before touching code.
- **Her XVF3800 mic previously gave 0 bytes.** The cause is known: a SUSPENDED
  SINK IS A DEAD MIC on that array. The fix is the sink-only no-suspend rule at
  `scripts/node-baseline/51-respeaker-no-suspend.{lua,conf}` — **check which one
  her WirePlumber needs** (0.4 reads Lua from `main.lua.d`; a 0.5-style JSON file
  in `wireplumber.conf.d` is silently ignored, and vice versa). Dragomir needed
  the Lua one at `~/.config/wireplumber/main.lua.d/`. Never pin the input node.
- **Her speaker:** signal reaches the XVF3800 but was silent in the room — check
  her powered subwoofer.
- **Voice acceptance (operator, verbatim):** NO Romanian accent, DOES whisper,
  NO singing.
- Her calibration was wiped fleet-wide 2026-09-06 along with everyone else's.

### Rules that cost real money when ignored
- **Judge audio by ear-check, never by `success:true`.** `played:true` lies while muted.
- **Judge capture by FRAMES** (non-zero bytes AND non-zero RMS), never "the device opened".
- **Logs are SPLIT** — `console.warn`/`error` go ONLY to `/var/log/monsterbox.err`.
  A healthy-looking `.log` means nothing.
- **QUIET HOURS: no audio testing at night without asking.**
- **Deploy rsyncs files, not git** — prove a fix landed by grep on the node.
- Browser suite: `MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test tests/browser`
  (the npm script self-collides on the PID guard). Port 3100 drives REAL hardware
  unless `?dryRun=1` as a QUERY param.
