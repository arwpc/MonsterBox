# Report: lurk engineer (decision D3 — lurk / wake / AI mode)

Worker report (saved by the lead; the worker could not write under `docs/`). Ran 2026-10-09 21:00–23:05 CDT,
interrupted twice (the 22:03 reboot, the ≈09:55 power loss), finished 2026-10-10 ≈10:40. Everything in the brief
is done and live on Orlok, including the two fleet-mode routes; running on the dirty tree after the worker's
restart at 10:33. Caveats: follow orders needed a two-line change in a file the worker did not own (Hook 1, applied
by the lead at commit time); Mina, PumpkinHead and Dragomir are covered by unit tests only.

## The state machine: services/lurkStateService.js (new)

One machine per node, bound to the node's own character (`LurkStateMachine` :786; default export = the instance).

**States**
- **lurking** (boot and default): idle loop over idle-tagged poses, head tracking where there is a webcam and a
  pan servo, the PIR, background music where configured. Nothing speaks.
- **awake** (= AI mode): starts the agent alone first (PumpkinHead stagger kept: idle pauses, 250 ms settle),
  then jaw, LED sync, head tracking, AI motion and sway, follow orders and idle movement, each only where the
  parts support it.
- **off** (Lurk OFF or panic): PIR ignored; an explicit wake still works and returns to off afterwards.

**Wake and sleep.** Wake: `handleMotion` :1141 (PIR or simulate), `wake` :945 (`/wake` and the schedule), `aiOn`
:952. Sleep: `aiOff` :957 and inactivity `_checkSleep` :1449 (default 5 min). **Inactivity never ends a
conversation in progress** — activity = guest or agent speech (the conversation engineer's `onActivity` hook, live),
the speech log, reply audio still draining, PIR motion, operator chat.

**Two guards against a node that never sleeps** (both found live): a **no-guest ceiling**
(`NO_GUEST_CEILING_FACTOR` :99, 3 × timeout = 15 min; only real guest speech, an explicit wake or operator chat
count as a guest; after such a sleep the PIR cannot re-wake for one timeout, `rewake-cooldown`); and **quiet
hours** (a PIR edge in PIR quiet hours does not count as activity while awake, `decideMotion` :230).

**PIR is ignored** for 60 s after boot and 5 s after each re-arm, in its quiet hours (23:00–08:00), during a fleet
event hold, when the `pirWake` pref is false, and when the sensor is listed in `config/physical-faults.json`.

**Wake and sleep never write super-powers.json.** Capability switches live only in the characterConfigLock runtime
overlay; sleep clears only the keys the machine set itself; machine state and prefs live in
`data/character-N/lurk-state.json` (runtime state for the lock, excluded by the deploy).

**Capabilities** (`detectCapabilities` :394) come from the character's own files; broken parts are excluded (a
broken jaw stays off, a broken pan servo means no head tracking, an idle pose counts only if it moves a working
part, `countUsableIdlePoses` :318; AI motion counts only working parts). **Prefs:** `inactivityTimeoutMs` (0 =
never sleep), `pirWake`, `pirQuietHours`, `capabilityOptOut` (e.g. `["aiMotion"]`).

**Fleet event hold and release** (`eventHold` :1025, `eventRelease` :1073). Hold stops the idle loop and head
tracking, blocks background music, callouts, lurk scenes and PIR wakes, never ends an awake conversation, and
releases itself after `maxMs` (default 10 min, `EVENT_HOLD_MAX_MS` :112, clamped 10 s–2 h). Release restores what
was running before (or the current state's policy if the state changed). Idempotent: a second hold extends the
expiry and keeps the first hold's memory. Panic or Lurk OFF ends a hold.

## Routes: routes/conversation.js (thin handlers; the old lurk-mode and motion-mode code is deleted)

| Endpoint | Line | What it does |
|---|---|---|
| `GET /conversation/api/lurk-state` | :1282 | full machine status |
| `POST /conversation/api/lurk-state/prefs` | :1293 | set prefs |
| `POST /conversation/api/wake {source?, explicit?, force?}` | :1308 | wake into AI mode |
| `POST /conversation/api/sleep` | :1325 | leave AI mode |
| `POST /conversation/api/lurk/event-hold?characterId=N {characterId, reason, maxMs?}` | :1355 | fleet event hold (the fleetSteps contract) |
| `POST /conversation/api/lurk/event-release?characterId=N {characterId, reason}` | :1367 | fleet event release |
| `POST /conversation/api/ai-on {enabled}` | :1040 | `aiOn` / `aiOff` (502 when the agent should have started and did not; the body still comes alive) |
| `GET /conversation/api/ai-status` | :1074 | `enabled` = awake OR live agent; also `agentLive`, `state`, `sleepInMs` |
| `/conversation/api/motion-sensor` (GET, POST, `/simulate`) | :1379–:1434 | compatibility shims (POST toggles `pirWake`; simulate uses the real PIR decision) |
| `/conversation/api/lurk-mode` (`/capabilities`, `/motion-status`, `/activity`) | :1557–:1638 | compatibility shims (`calloutMode` always false) |

Hold response: `{success:true, held:true, alreadyHeld?, hold:{since, expiresAt, expiresInMs, reason, holds,
remembered:{state, idle, headTracking, music}}, results?, status}`. Release: `{success:true, released:true, heldMs,
remembered, results, status}`; nothing held → `{success:true, released:false, reason:"not-held"}`; a character this
node does not animate → 409.

Dashboard toggles no longer save a wake's temporary switches to disk (`jawConfigForWrite` :87 restores the disk
value of every overlaid key except the one being set; the AI Motion toggle drops the `runtimeOverride` marker).

## Other files

- **server.js** :1100 mute is runtime-only (persisted mute cleared at boot: every node boots unmuted); :1124 calls
  `lurkStateService.init` (replaces the motion re-arm and the always-on head-tracking start; `headTracking.alwaysOn`
  survives Lurk OFF, only panic stops it); :1314 shutdown stops the machine and the watcher first (watcher no
  longer respawned during shutdown, proven).
- **services/lurkMotionWatcherService.js**: `onMotion` callback on every edge; the machine owns wake and sleep.
- **services/backgroundMusicService.js**: plays only while the gate reads `lurking` (:165); Stop-All and panic
  pause instead of destroying the supervisor (`pauseAll` :606), `resume()` :617 on every entry into lurking, Lurk ON
  and config save; decoder reaper (`reapStragglers` :488) kills a paused ffmpeg decoder that ignores SIGTERM (the
  30-orphan, 2.8 GB leak; fired three times today, no orphans remain).
- **services/calloutService.js** (:186) and **services/lurkSceneService.js** (:183): off by default, gated on
  `lurking` plus quiet hours; the operator's test endpoints bypass the gate; lurk-scene false negative fixed
  (`queueStarted()` :139 reads `running`).
- **Schedule**: `services/scheduleService.js:234` new `wake` action (curls `/wake` with `source:"schedule"`, logs to
  `~/yard-theater-logs/wake.log`); `public/js/schedule.js` + `views/schedule/index.ejs` "Wake (AI mode)" option.
- **Fleet**: `services/orchestrationService.js:730` new `ai` key (20 s timeout); the emergency stop no longer sends
  `motion(false)` (a persisted pref that would latch like the old mute); `views/orchestration/index.ejs` AI button,
  E-stop text corrected.
- **routes/api/panicRoutes.js**: :162 `lurkStateService.panic` (forced head stop), :170 `pauseAll('panic')`, :186
  follow-orders disarm uses `persistRuntimeToggle` (no 423 on a locked character).
- **services/aiMotionSuperPowerService.js**: `readAiMotionConfig` applies the runtime overlay (:126);
  `writeAiMotionConfig` never saves an overlaid `enabled` (:180).
- **public/js/dashboard.js**: Lurk and AI toggles reflect the server only (`applyLurkStatus` :341); browser-side
  agent starts and the per-feature AI-off cascade removed; Loop All posts `scene_id` and shows errors (:1919).

## Proof

1. `npm run test:unit`: 1076 passing, 0 failing. `tests/unit/lurk-state.test.js` (29 tests): boot, wake order,
   overlay readers, AI-off clearing, inactivity vs speech and draining audio, the noise ceiling, re-wake cooldown,
   PIR grace, quiet hours and holds, off behaviour, panic vs always-on, hold idempotency and expiry, a hold never
   ending a conversation, a foreign character, dead-servo capabilities, the music/callout/lurk-scene gates, the
   schedule command, the fleet `ai` key; plus 3 music-gate tests in `background-music.test.js`.
2. `tests/system/lurk-state.test.js` (read-only) plus the dashboard-api mute block: 11 passing against :3100.
3. `audit:resolver` clean; `audit:independence` shows nothing from these files.
4. Every restart on Orlok logs `boot → LURKING (boot) — agent:off head:on sway:off idle:on pir:on music:on`.
5. Silent wake (2026-10-09 22:32): `lurking → AWAKE (simulate) in 2323 ms — agent:on jaw:on led:n/a head:on
   aiMotion:on orders:on sway:on idle:on`; on disk jaw/aiMotion/followOrders were false yet all three read routes
   reported `enabled:true`; music reported `awake`.
6. Inactivity sleep: with a 30 s timeout and the agent opted out, `awake → LURKING (inactivity)`; with the agent
   on, Orlok stayed awake 9+ minutes replying to room noise (hence the no-guest ceiling).
7. Locked character 4 (read-only script): wake gave `agent:on jaw:on head:on aiMotion:on orders:on`; AI off left
   zero overrides; `super-powers.json` mtime unchanged; only `lurk-state.json` written.
8. Fleet hold/release through the real `createFleetSteps().run`: HOLD `held:true, expiresInMs 59471`, RELEASE
   `released:true`; second hold `alreadyHeld:true, holds:2`; simulated motion during the hold ignored; music
   `event-hold` then `playing`; second release `not-held`.
9. Schedule wake via `POST /api/schedule/:id/run-now {confirm:true}` under cron's environment: `wake.log` shows
   `changed:true, state awake, wake.source "schedule"`; temporary event deleted; crontab unchanged.
10. Daytime with real audio (10:34): lurking → music playing, mic peak 0.117 / avg 0.044; `/wake` → agent on,
    music paused; `/sleep` → agent stopped, music back after the 6 s resume delay.

## Unproven

Speech by ear-check (wake/sleep shown by process and state); follow orders on a disk-false or locked character
(Hook 1); the dashboard in a real browser (pages 200, controls present, JS parses; `conversation-refactor`,
`orchestration` and `actual-usage` specs may assert the old behaviour); PumpkinHead and Mina on their own nodes
(unit fakes); the ceiling and re-wake cooldown live (Orlok's PIR fires about every 5 s in daylight even held still).

## Per-node runtime state to set at deploy (node-local; never commit)

- **All nodes:** callouts off (`POST /conversation/api/callouts {"enabled":false}`), lurk scenes off
  (`POST /conversation/api/lurk-scenes {"enabled":false}`); mute clears itself at boot; `lurk-state.json` is created
  on first boot; `lurk-mode-state.json` and `motion-armed-state.json` are no longer used.
- **Orlok (3):** done. Disk still has `jawAnimation.enabled:false` and `aiMotion.enabled:false` (old sleep path):
  AI mode does not need them, but scenes/sayThis/fleet events while lurking use the disk jaw flag — set it back with
  `POST /conversation/api/jaw-settings {"enabled":true}` while lurking (it was true at HEAD).
- **Mina (2):** lurks on the PIR only; jaw, pan and every idle pose are on broken parts (unavailable; jaw never
  switched on); wakes to the agent, AI motion on her lights, and orders.
- **PumpkinHead (1, locked):** works through the overlay; his PIR (part 5) is broken so never armed; he now boots
  into the idle loop with motor sway (the configuration that reset him before) — if his PSU is still marginal,
  `capabilityOptOut:["idle"]` via `/conversation/api/lurk-state/prefs`.
- **Sir Dragomir (4, locked):** PIR dead → wakes by schedule, AI or fleet; lurking starts head tracking on the
  900° neck (already the case via `alwaysOn`); `capabilityOptOut:["headTracking"]` if not wanted.
- **Renfield (6):** AI mode would turn AI motion on, against his `_note`; `capabilityOptOut:["aiMotion","followOrders"]`
  if the operator agrees with the note.

## Hooks needed elsewhere

1. Follow orders must read the overlay: `services/followOrders/followOrdersListener.js` :79–80 and :217–218,
   `if (!config.enabled)` → `if (!withRuntimeToggle(characterId, 'followOrders.enabled', config.enabled))`
   (import from `../characterConfigLock.js`). **Applied by the lead.**
2. Conversation engineer: the agent's replies to room noise (`src=noise` turns) kept Orlok awake; fewer noise
   replies would let normal inactivity work.
3. `audioLoopService.playTrack` stop path can leave ffmpeg blocked on an undrained pipe (unpipe/resume stdout or
   SIGKILL); music reaps its own stragglers meanwhile.
4. Fleet-event runner: the hold probe skips a node in AI mode unless `force:true`; release is never skipped.
5. Docs: CLAUDE.md's fleet feature list needs `ai`; KNOWN-BUGS :760–765 and :2741–2742 are stale.

## Incidents

- 2026-10-09 22:59:48: a real PIR wake started the agent for 19 s (sink device-muted); stopped with `/sleep`.
- During the 22:41 restart another worker's restart cut one wait short.
