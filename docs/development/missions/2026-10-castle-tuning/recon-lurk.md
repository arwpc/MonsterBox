# Lurk-mode recon (node orlok, char 3) — 2026-10-09 ~20:40 CDT

Read-only survey by a code-mapping agent at HEAD 86c9bb0e (v10.6.0). Orlok's runtime was read from its state
files, read-only GETs against `http://127.0.0.1:3100`, greps of `/var/log/monsterbox.{log,err}` and `crontab -l`.
Peer facts come from repo copies on Orlok and are marked "(repo copy)". Deploy excludes `parts.json`,
`poses.json`, `super-powers.json`, `scenes.json` and `*-state.json` for every character
(`scripts/deploy-to-animatronic.sh:163-182`) and skips locked characters' whole data folder (:150-160).

## 0. Why lurk "doesn't work"

1. **Two features called "lurk" share one PIR watcher.** "Lurk mode" is `POST /conversation/api/lurk-mode`
   (`routes/conversation.js:1976-2064`); "motion mode" is `POST /conversation/api/motion-sensor` (:1443-1460).
   Both call the single node-wide watcher's `start()`, which begins with `stop()`
   (`services/lurkMotionWatcherService.js:60-61`). Arming one replaces the other's wake/sleep callbacks; turning
   either off kills the watcher for both. Lurk starts awake, never starts the AI, and on wake runs only the lurk
   stack. Motion starts asleep; on wake it starts the AI agent (or a callout), then the lurk stack, then AI Motion.
2. **Lurk mode is never restored at boot.** Only `motion-armed-state.json` is re-armed (`server.js:1097-1104` →
   `conversation.js:1430-1440`). Nothing reads `lurk-mode-state.json` at startup (readers: `GET /api/lurk-mode`
   :1949-1971 and the lurk-scene probe `services/lurkSceneService.js:168-172`). After a restart the dashboard shows
   Lurk "Active" from the file (`public/js/dashboard.js:434-455`) while nothing runs. KNOWN-BUGS.md:2741-2742 and
   :760-765 claim otherwise — stale.
3. **While waiting for guests the character is motionless and blind.** Sleep (both modes) calls
   `disableLurkSuperpowers` (`conversation.js:1368-1375`, `1880-1946`): idle loop and random poses stop, jaw off,
   head tracking off unless `headTracking.alwaysOn`. Movement and head tracking only happen while awake — the
   reverse of what the operator wants.
4. **Characters speak while waiting.** Callouts speak every ~5 min with no lurk/awake check
   (`services/calloutService.js:174-183`); lurk scenes contain `sayThis` steps (Orlok 111-116 all do); the
   dashboard Lurk toggle starts the agent (`dashboard.js:295-303`) and its wake poller starts the agent even in
   callout mode (`dashboard.js:482-486`).
5. **Lurk scenes report "did not start" even when they play.** `playScene` counts success only if
   `getStatus().length > 0` (`lurkSceneService.js:204-208`), but `runLoop` removes the only queued item before its
   first `await` (`services/scenes/sceneQueue.js:168-189`); by the time `startWithConfig` reads status (:239-268)
   the length is 0. 22 false "did not start (missing?)" lines in `monsterbox.err`. The unit test mocks `playScene`
   (`tests/unit/lurk-scenes.test.js:31`).
6. **Any "Stop All Audio" or panic permanently kills background music.** The stop-all hook calls
   `backgroundMusicService.stopAll()`, which deletes the supervisors (`services/backgroundMusicService.js:526-547`);
   they restart only at boot (`server.js:1121-1132`) or via `POST /api/audio-loop/background`
   (`routes/api/audioLoopRoutes.js:215-227`). Orlok's supervisor was stopped by the 19:52 panic. Music has no
   "awake" pause.
7. **Orlok was muted at 19:52:12 CDT** (`data/speaker-state.json` `speakerMuted:true`). Mute is node-wide, on disk,
   re-applied at boot, and blocks callouts, lurk scenes, music and all playback.
8. **"AI on" turns on the ElevenLabs agent and nothing else** (`conversation.js:1015-1046`). The jaw is switched on
   by the browser (`dashboard.js:1199-1202`); LED, head tracking and AI Motion are never switched on.
9. **Scheduled events cannot wake a character.** Action types are `moment`, `scene`, `raw`
   (`services/scheduleService.js:208-242`).
10. **Wake/sleep cycles write the operator's saved settings** — jaw, LED and AI Motion flags go into
    `super-powers.json`, which is configuration (`conversation.js:1292-1293`, `1776-1779`, `1831-1834`,
    `1892-1895`); on a locked character the writes are refused silently and have no live effect (§5).

## 1. Inventory

### 1.1 Services
- `services/lurkMotionWatcherService.js` — node-wide PIR watcher; in-memory state (26-46);
  `start(characterId, {sensorPart, inactivityTimeoutMs, startAsleep, onWake, onSleep})` (60-95), default
  inactivity 5 min (73); one long-lived `python_wrappers/gpio_pin_watcher.py` printing level changes;
  `onMotionDetected` (294-311); inactivity timeout (325-338) restarts only on the next rising edge;
  `resetActivity` (130-134) is only called by `POST /conversation/api/lurk-mode/activity` (dashboard chat);
  `simulateMotion` (345-349) returns false when not armed.
- `services/lurkSceneService.js` — opt-in via `lurk-scenes-state.json` (31-39); "lurking" = lurk-mode file enabled OR
  watcher active (196); "guests present" = watcher active and awake (198); gate (107-120) skips when disabled, no
  scenes, quiet hours, muted, not lurking, guests present, conversation active, callout in flight, queue running,
  other audio; plays one scene via the queue in `sequential` mode (202-209). Boot: `apply` (`server.js:1146-1156`).
- `services/calloutService.js` — opt-in via `callout-state.json`; defaults (30-38) interval 300000, jitter 15,
  quiet 23:00-08:00, `aiOnWake` false, `maxWords` 20; gate (174-183) never checks lurk/awake; `planWake` (196-199)
  `startAgent = !(enabled && !aiOnWake)`; each line via the one-shot `askAgentQuestion` socket (311-324);
  `holdJawForCallout` (237-256); `onMotionWake` (531-551). Boot: `apply` (`server.js:1134-1144`).
- `services/backgroundMusicService.js` — opt-in `backgroundMusic` block in `super-powers.json` (read 223-237,
  writes lock-refusable 239-255); play gate (148-160) checks disabled/no tracks/muted/quiet/conversation/queue/other
  audio/resume delay — never lurk/awake; probe (273-295); stop-all hook destroys (526-547); `applyConfig` (551-556)
  at boot.
- `services/headTrackingAlwaysOn.js` — `headTracking.alwaysOn === true` (31-33); survives lurk stop unless forced or
  operator-off this session (51-55); boot start (61-67, `server.js:1106-1119`, 15 s delay); the operator toggle
  (`conversation.js:458`) is remembered in memory only.
- `services/randomPoseService.js` — in-memory enable (74-86); `disable()` with no id disables everyone (94-105);
  poses fire only from `triggerDuringTTS` (296-330) — needs saved `aiMotion.enabled` + `ambientDuringSpeech`, text
  ≥ 50 chars, 50% roll. Adds nothing to a silent lurk.
- `services/movement/idleLoopService.js` — the only mover that works without speech; node-wide singleton
  `start` (398-420) / `stop` (425+); `loopIteration` (249-375) moves poses tagged `idle` only
  (`services/movement/poseLibrary.js:143-150`); ignores `movement-config.json` `idle.enabled`, reads timing only
  (258-259); NOT started at boot.
- `services/aiMotionSuperPowerService.js` — defaults off (65-85); `readAiMotionConfig` (113-136) 5 s cache, never
  applies runtime overrides. Readers: `randomPoseService.js:307-308`, `gestureEngineService.js:603-605`,
  `followOrdersListener.js:88-89`, `server.js:1185-1190`.
- `services/gestureEngineService.js` — agent `gesture` tool runs a recipe if `aiMotion.enabled && triggers.agentGesture`
  (593-617); recipes in `data/character-{id}/gestures.json` (51-53), only char 3 has one.
- `services/followOrders/` — listener starts at boot if enabled (`followOrdersListener.js:299-309` ← `server.js:1060-1070`);
  orders ignored unless AI Motion on + `guestCommand` (77-95); `ackMode: 'speak'` speaks (128-131);
  `writeFollowOrdersConfig` lock-refusable (`followOrdersSuperPowerService.js:116-128`).
- `services/scheduleService.js` + `services/schedule/` — real crontab managed block (`crontabFile.js:1-31`); action
  types (208-242): `moment` (yard-theater perform.mjs, say/audio via orchestration), `scene`
  (`curl -sk -X POST https://localhost:3000/scenes/api/:id/play?characterId=N`, bypasses the scene queue —
  `routes/scenes/api.js:382-404`), `raw`. Run-now 456-477.

### 1.2 Endpoints
| Endpoint | Code | Effect |
|---|---|---|
| `POST /conversation/api/lurk-mode {enabled, inactivityTimeoutMs?}` | conversation.js:1976-2064 | On: `enableLurkSuperpowers` (1988) + watcher started awake (1994-2028); sleep disables everything and writes `{enabled:true, sleeping:true}`; wake re-enables; off stops watcher + disables; saves `lurk-mode-state.json` (2044-2050); returns `calloutMode` (2055-2058). No server-side AI. |
| `GET /conversation/api/lurk-mode`, `/motion-status`, `/capabilities`, `/activity-status` | 1949-1971, 2067-2069, 1643-1652, 2079-2133 | read only |
| `POST /conversation/api/motion-sensor {enabled, inactivityTimeoutMs?}` | 1443-1460 → `armMotionMode` 1382-1410 / `disarmMotionMode` 1413-1424 | watcher starts asleep with `wakeOnMotion`/`sleepOnMotion`; saves `motion-armed-state.json`; no-op in test mode |
| `POST /conversation/api/motion-sensor/simulate` | 1465-1481 | fires the armed watcher as if the PIR triggered, waits 1.5 s; `{success:false}` if nothing armed |
| `POST /conversation/api/ai-on {enabled}` | 1015-1046 | headless agent only + `ai_agent_state.json` |
| `POST /conversation/api/speaker-mute {muted}` | 990-1005 | the only mute setter |
| `POST /conversation/api/callouts`, `/callouts/test` | 1502-1513, 1517-1531 | callout state |
| `POST /conversation/api/lurk-scenes`, `/lurk-scenes/test` | 1548-1559, 1564-1579 | lurk-scene state |
| `POST /conversation/api/{jaw-settings, led-talk, follow-orders, ai-motion, head-tracking}` | 168-206, 232-267, 294-324, 357-413, 446-524 | dashboard toggles; all pass a runtime-toggle override key except head tracking |
| `POST /api/orchestration/superpower/:feature` | orchestrationRoutes.js:1267-1280 → orchestrationService.js:717-753 | keys lurk, jaw, head, motion, mute, orders, aiMotion — no `ai`, callouts, lurk-scenes, music |
| `POST /api/panic` | panicRoutes.js:111-227 | `disarmLurkCompletely` (154-163 → conversation.js:1858-1871), orders off (168-176), agent off + `ai_agent_state` (183-201), kill media, fleet `emergencyStop` (orchestrationService.js:777-819, deliberately not mute). Does not stop callout or lurk-scene timers. |
| `POST /api/audio/stop-all` | server.js:621-635 | also destroys background music (dashboard "Stop Audio", dashboard.js:743) |
| `GET/POST /api/audio-loop/background` | audioLoopRoutes.js:197-227 | background-music config |

No dashboard or fleet UI exists for callouts, lurk scenes or background music (API only).

### 1.3 Runtime state files
| File | Writers | Readers / boot |
|---|---|---|
| `lurk-mode-state.json` (gitignored) | `POST /lurk-mode` (2044-2050); lurk sleep/wake; `disarmLurkCompletely` (1864-1869) | `GET /lurk-mode`; lurk-scene probe. Not read at boot. |
| `motion-armed-state.json` | `persistMotionArmedState` (1261-1270) from arm/disarm/wake/sleep — overwrites the whole file, so a custom `inactivityTimeoutMs` is lost after the first wake/sleep | `restoreMotionModeOnStartup` (1430-1440) at boot |
| `ai_agent_state.json` (tracked in git for chars 2, 3) | `/ai-on` (1030-1032); `setAgentForMotion` (1272-1284); panic | `GET /ai-status` uses the live session. Not read at boot. |
| `callout-state.json` | `calloutService.writeState` (372-384) | boot `apply`; `planWake` (1330-1335) |
| `lurk-scenes-state.json` (not gitignored, untracked) | `lurkSceneService.writeState` (240-252) | boot `apply` |
| `data/speaker-state.json` (node-wide) | `serverPlaybackService.setSpeakerMuted` (215-222) | read in the constructor (142, 176-185); missing = unmuted |

Runtime-ish values that live in configuration (`super-powers.json`, lockable): `jawAnimation.enabled`,
`jawAnimation.ledSync.enabled`, `aiMotion.enabled` (+ `triggers.ambientDuringSpeech` set true when enabled,
conversation.js:387), `followOrders.enabled`, `headTracking.enabled` (written only by `/setup/head-animation`,
`routes/setup/head-animation.js:153`, never consulted at boot), `headTracking.alwaysOn`, `backgroundMusic`.

## 2. The wake path today
PIR in motion mode: "STATE 1" → `onMotionDetected` → if asleep `wakeOnMotion` (conversation.js:1326-1365):
(1) `planWake(callout-state)`; if `startAgent`, `setAgentForMotion(true)` starts the headless session, opens the mic
loop and plays the first_message (`elevenLabsWebSocketService.js:113-116`, 1407-1473), else a non-awaited callout
greeting (1344-1349); (2) settle 250 ms / 1500 ms after a callout (the stagger exists because cold-starting the agent
on top of the lurk stack resets PumpkinHead, 1300-1320; KNOWN-BUGS.md:734-758); (3) `enableLurkSuperpowers`
(1755-1845): jaw if `servoPartId` exists (saved without override key, 1766-1783), head tracking via
`startHeadTrackingForCharacter` (needs webcam + pan servo: saved `panServoId` or a servo named /pan|head|swivel/,
1661-1731), `randomPoseService.enable` (1795-1802), idle loop if `hasIdlePoses` — which checks for ANY pose while the
loop needs `idle`-tagged poses (82-87, 1804-1820), LED sync if `led_ring` (1822-1842); (4) `setAiMotionForMotion(true)`
writes `aiMotion.enabled` (1286-1298, 1361); (5) save `{enabled:true, awake:true, results}`.
Inactivity sleep: 5 min default (1259, 1589; watcher :73); lurk mode can set 0 = never; the timer resets only on PIR
rising edges or dashboard chat `/activity`; `sleepOnMotion` (1368-1375) runs `disableLurkSuperpowers` then
`setAgentForMotion(false)` and `setAiMotionForMotion(false)` — so sleep tears down a live conversation, including an
operator-started `/ai-on` session.
Boot order (`server.js`): hostname → character (132-143); mute restored in the playback constructor; follow-orders
listener (1060-1070); motion re-arm (1097-1104); always-on head tracking +15 s (1106-1119); background music
(1121-1132); callouts (1134-1144); lurk scenes (1146-1156); LED rings (1158-1177); random poses if AI Motion on
(1179-1196). Not restored: lurk mode, the agent, the idle loop. A PIR line that floats/starts HIGH wakes immediately
on re-arm (gpio_pin_watcher.py:9) — the PumpkinHead reset loop (KNOWN-BUGS.md:760-765).
Mute: `data/speaker-state.json`, re-applied by the `ServerPlaybackService` constructor; blocks playback (364, 452,
782), audio loops (`audioLoopService.js:70`, 125), audio library (`audioLibrary.js:299`), music, callouts, lurk
scenes. Nothing un-mutes automatically; panic deliberately does not mute; the Fleet Command Center E-stop text says
it mutes (`views/orchestration/index.ejs:77`, 1058) — stale. `tests/system/dashboard-api.test.js:152-170` asserts
mute persists.

## 3. "AI mode" today
Server `/api/ai-on` toggles the headless agent only (1015-1046); headless sessions are exempt from the age reaper
(`elevenLabsWebSocketService.js:369-373`). Browser (`dashboard.js:1194-1208`): AI on also turns the jaw on
(1199-1202); AI off switches off jaw, LED Talk, head, AI Motion, Orders one at a time (1179-1192). AI on does NOT
turn on LED sync, head tracking, AI Motion, orders, or wake handling; no `ai` key in the fleet superpower endpoint
(`orchestrationService.js:717-727`) and no AI button in the Fleet Command Center (`views/orchestration/index.ejs:47-55`).
Capability detection that exists: `checkLurkCapabilities` (conversation.js:1602-1640; `ai: true` hardcoded, `idle`
= any pose), the AI Motion movable-parts check (365-377), follow-orders `canPerform` (306-307). Dashboard: `/` is
`views/conversation/showtime.ejs` (Lurk switch :41, feature chips 109-143, AI switch 180); `/dashboard/classic` is
`views/conversation/index.ejs` (Lurk 33-38, Monster Features 163-204, AI 112); both run `public/js/dashboard.js`
(loaders 1432/1479/1616/1632/1650/1698; mute 690-705; motion 708-729).

## 4. Scheduled events
Can trigger yard-theater moments, one scene via direct `executeScene`, or a raw shell command. Cannot trigger a
wake, AI mode, a callout, lurk, or the scene queue. Orlok's managed crontab block: Dusk Ceremony `30 18 31 10 *`,
Thomas `47 20 31 10 *`, Night Memory `0 2 1 11 *`, disabled October weekend rehearsal; the operator's own `@reboot`
line is preserved outside the block. Moments target nodes [1-6] (`scripts/yard-theater/moments/*.json`).

## 5. Character independence and locked characters
No hardcoded ids/names in this machinery (names only in comments). One-character-per-node assumptions: one
watcher, one idle loop, `randomPoseService.disable()` turns off everyone, boot uses `config.selectedCharacter`.
`GET /api/motion-sensor` (1234), `/head-tracking-status` (430), `/activity-status` (2093) load parts for the node's
selected character rather than the resolved `characterId`. Schedule `scene` action hardcodes `https://localhost:3000`
(scheduleService.js:230).
Locked characters (1, 4; both fingerprint `super-powers.json`): runtime `*-state.json` and `ai_agent_state.json`
writes allowed (`characterConfigLock.js:36-48`, 104-107). Lurk/wake/sleep jaw/LED/AI Motion writes go through
`persistRuntimeToggle` without an override key (1292, 1777, 1833, 1893): the 423 is swallowed and nothing happens
live (jaw cache updated only after a successful write, `jawAnimationSuperPowerService.js:391-392`; override map
never set; every AI Motion reader ignores overrides). Panic `panicRoutes.js:173` writes follow-orders config
directly and throws on a locked character with Orders on, so 174-175 never run. Background-music config writes
refused with 423. Idle loop default `movement-config` creation only warns (`idleLoopService.js:95-121`).

## 6. Orlok (char 3) at 20:40 CDT
lurk-mode-state `enabled:false, sleeping:false` (19:52:12, the panic); motion-armed-state `enabled:false, awake:false`
(will NOT re-arm after reboot); ai_agent_state `enabled:false`; callout-state enabled, 300000/15 %, quiet 23-08,
`aiOnWake:false`, `maxWords:20`; lurk-scenes-state enabled, scenes 112-116 + 111, 240000/25 %; speaker-state
`speakerMuted:true` (19:52:12); super-powers: jaw `enabled:false` (HEAD true), servoPartId 10; ledSync false;
headTracking enabled false, pan 15, cam 9, no `alwaysOn`; aiMotion `enabled:false` (HEAD true); followOrders false;
backgroundMusic enabled (8 tracks, vol 40, shuffle, resume 5000, quiet 23-08; not in HEAD). movement-config
`idle.enabled:false` (ignored). PIR part 14 GPIO 17; no led_ring. Live: lurk off, watcher inactive (182 detections
this process, last 19:52:07); callouts running (last line 19:47:58, last result "muted"); lurk scenes running
(last result "muted", lastPlayedAt null — the false negative); AI off; muted; music config enabled but supervisor
"stopped"; random poses off. Rotation scenes: 112 The Count Wakes (2 sayThis), 113 Fire of Wallachia (4), 114 The
Moon Spell (3), 115 Roll Call of the Castle (3), 116 The Invitation (2), 111 Arc 1 (2 + audio).

## 7. Capabilities per character (repo copies)
| Char | Jaw servo | Head (cam + pan) | Idle-tagged poses | LED ring | PIR | Other |
|---|---|---|---|---|---|---|
| 1 PumpkinHead (locked) | none | cam, no servo | 2 (Body Sway, motor) | yes | GPIO 16 | hard-resets when everything starts at once (KNOWN-BUGS:767-798) |
| 2 Mina | 1 | 2 + cam 7 | 3 | no | GPIO 26 | |
| 3 Orlok | 10 | 15 + cam 9 | 14 of 35 | no | GPIO 17 | only `gestures.json` and `backgroundMusic` |
| 4 Sir Dragomir (locked) | 2 | 1 (900° multi-turn) + cam 4, `alwaysOn:true` | 0 | no | GPIO 26, never fired (KNOWN-BUGS:1389-1392) | |
| 5 Groundbreaker | none | no servo | 0 | no | none | no `super-powers.json`; motor only (dead) |
| 6 Renfield | none | pen servo is not a pan | 0 | yes | GPIO 17 | |
No code generates random movement from a character's parts; 4, 5 and 6 cannot "move occasionally" without
authored idle poses.

## 8. Gap analysis
- **Move while lurking / head tracking:** exists (idle loop, head-tracking helper, always-on). Missing: a pre-wake
  lurk state running idle loop + head tracking with no AI; sleep returning to lurk instead of off; lurk restore at
  boot; `hasIdlePoses` checking idle-tagged poses; movers for 4/5/6 (authored idle poses). Files:
  `routes/conversation.js` (one state machine, or a new `services/` module), `server.js`,
  `services/lurkMotionWatcherService.js` (lurk without a PIR).
- **Nobody speaks while lurking:** speakers today are callouts, lurk scenes, the dashboard starting the agent,
  follow-orders acks. Files: `services/calloutService.js` (gate or retire), `services/lurkSceneService.js` (retire
  or non-speaking only; fix the success check at 208), `public/js/dashboard.js` (remove `setServerAi(true)` at
  300-303 and 482-486), per-node runtime state off.
- **Wake on PIR, schedule, AI mode:** PIR exists via two conflicting modes; schedule needs a wake endpoint (works
  without PIR) + a `wake` action (`scheduleService.js:208-242`, `public/js/schedule.js`); AI-on-as-wake missing;
  sleep must not tear down an operator-started session or a live conversation; conversation activity must reset the
  timer server-side (`services/elevenLabsWebSocketService.js` hook).
- **AI mode = every capability the parts support:** `wakeOnMotion` is the closest bundle (no Orders);
  `checkLurkCapabilities` probes parts. Missing: one server-side AI-mode on/off used by `/ai-on`, wake, schedule,
  fleet; fleet `ai` key (`orchestrationService.js:717-727`, `views/orchestration/index.ejs`); override keys on the
  lurk writes; runtime override support in `aiMotionSuperPowerService.js:113-136`; browser AI toggle defers to server.
- **Unmuted by default:** `services/serverPlaybackService.js:176-185` restores mute at boot;
  `tests/system/dashboard-api.test.js:152-170` asserts it.
- **Orlok-only music while lurking:** per-character opt-in exists. Missing: awake/AI gate in
  `backgroundMusicService.js` (probe 273-295, gate 148-160); stop-all/panic should pause not destroy (526-547); mute
  blocks it. A looping scene would be worse (queue suppresses music/callouts; nothing stops a queue on wake).
- Smallest file set: `routes/conversation.js`, `server.js`, `public/js/dashboard.js`, `services/calloutService.js`,
  `services/lurkSceneService.js`, `services/backgroundMusicService.js`, `services/scheduleService.js`,
  `services/orchestrationService.js`, `services/aiMotionSuperPowerService.js`, optional `routes/api/panicRoutes.js`.

## 9. Hazards and test fallout
PumpkinHead: keep the agent-first stagger; KNOWN-BUGS says he must not be left in lurk until his PSU is fixed
(:796-798). Sir Dragomir: never auto-generate movement for the multi-turn neck. Orlok: parts 4 and 5 share a rail —
never drive them together on the agent's own initiative. Headless sessions are never reaped (billing). Per-node data
and state never travel with a deploy. Stale docs: KNOWN-BUGS.md:760-765, :2741-2742, E-stop text in
`views/orchestration/index.ejs`. Tests likely to change: unit `callouts`, `lurk-scenes`, `background-music`,
`head-tracking-always-on`, `character-config-lock`; system `dashboard-api` (mute), `orchestration`; browser
`conversation-refactor`, `orchestration`, `actual-usage-testing`.
