# MonsterBox scenes / poses / executor / test-coupling recon

## Provenance and limits

- Run on the Orlok node (hostname `orlok`, 192.168.8.120), repo `/home/remote/MonsterBox`, HEAD `86c9bb0e` (v10.6.0). The working tree carries uncommitted Orlok data: `data/character-3/scenes.json` (+5 Lurk scenes, ids 112-116), `super-powers.json`, `data/audio-library/library.json`, `data/goblins.json`, and an untracked `data/character-3/lurk-scenes-state.json`.
- Strictly read-only. Besides reading source I ran `node scripts/validate-schemas.mjs` (passes, all 6 characters), a pure call to `validateQueueDefinition`, and GET-only requests to this node's :3100 listener, to peer nodes (`https://<ip>:3000`) and to Goblins via the node API. I also read the running service's `/proc/<pid>/environ`. Nothing was written, restarted or played.
- **The requested report file was NOT written.** This agent has no write tool and its role forbids creating files. This message is the full report; persist it to `/tmp/claude-1000/-home-remote-MonsterBox/26c4c0b3-31c7-4df4-abb0-d653712a3390/scratchpad/recon-scenes-tests.md` yourself if you want the file.
- Evidence tags: [src] read in source, [data] read in a data file, [live] read-only GET against a running node, [ran] read-only script/function run, [inferred] reasoned from code, not executed.

---

## 0. Headline findings (these change the plan)

1. **The repo copy is not the fleet.** Peer `scenes.json`/`poses.json` are node-local (excluded from deploy). [live] Groundbreaker (char 5) has 5 scenes and 1 pose; the repo copy has 1 scene and 0 poses. Renfield (char 6) has 5 scenes; the repo copy has 4. Mina (192.168.8.140) did not answer ping or HTTPS during this run. Pull each node's own files before wiping anything.
2. **Locks are on chars 1 (PumpkinHead) and 4 (Sir Dragomir)**: `/home/remote/MonsterBox/config/character-locks.json:4` and `:30`. `docs/development/CHARACTER-CONFIG-LOCKS.md` says 1 and 6, which is stale (Renfield was unlocked in commit `e1ad0670`). **The scenes and poses routes do NOT answer HTTP 423.** A locked write throws `CharacterConfigLockedError` (status 423) in `writeJsonAtomic`, but `routes/scenes/api.js` catches everything as HTTP 500. `controllers/posesController.js` returns 400 on create/update and 500 on delete. Only the jaw, LED, calibration, parts, movement and audio-loop routes map it to 423. Detect a lock by the message text "is LOCKED".
3. **Scenes, poses, gestures and queue/template files are excluded from `deploy-to-animatronic.sh` for every character** (confirmed, with more excluded than you listed). A locked character's whole `data/character-N/` is also excluded. `scripts/bringup-animatronic.sh` is the one script that does NOT exclude `scenes.json` (details in section 5). The only HTTP ingest is `POST /scenes/api/import`, which merges, validates nothing and deletes nothing. Poses have no bulk endpoint.
4. **Scene ids stored outside scenes.json will dangle or silently re-bind** (full list in section 3). Lurk rotations are live and running on 4 nodes. `POST /scenes/api` assigns `max+1`, so ids restart at 1 after a full delete. Chars 5 and 6 lurk rotations are `["1".."5"]` and would silently start playing the new scenes with those ids.
5. **Dashboard "Loop All" is broken as shipped.** `public/js/dashboard.js:1953` posts `scenes:[{sceneId}]`, but `validateQueueDefinition` only reads `scene_id` or `id`. [ran] `{"sceneId":5}` throws "scene_id is required for each item" (HTTP 400), and the UI ignores the response. CLAUDE.md:104 and docs/api/api-documentation.md:83 document the same wrong shape. Studio, legacy scenes.ejs and lurk use `scene_id` and work.
6. **An `audio` step on the non-jaw path is killed at 30 s** (`runWrapper` default timeout). Recorded in this node's `data/scene-analytics.json`: scenes 111 and 113 failed with "Hardware command timed out after 30000ms" (2026-10-05, 10-09, 10-10). Only clips under about 28 s are safe (list in section 8).
7. **Steps on physically broken parts are silently skipped and counted as success.** Orlok parts 2, 3, 4, 5; Groundbreaker part 1; PumpkinHead part 5 (PIR). Details in 2.5.
8. **dryRun is not a validator.** It returns success for any step, including unknown types and missing fields. The 3100 listener runs `NODE_ENV=production` with `MB_TEST_MODE` unset [live /proc], so only `?dryRun=1` makes `/play` safe there.
9. **Test hazards that activate with valid ids** (section 7): `tests/system/orchestration.test.js:343` really fans out `start-all-queue-loops` against the live listener. `defaultSceneId` is valid today on Orlok, Groundbreaker and Renfield. The browser suite's "play first scene tile" fires a real show.
10. **sayThis never caches TTS.** Every play is a live ElevenLabs call. Recorded `quota_exceeded` failures make lines silently vanish (non-fatal).
11. **Poses carry no audio.** The Pose Editor's "audio" option only writes text into `notes` (`public/js/poses-editor.js:~506-512`); `poseEngine` has no audio code. CLAUDE.md claims otherwise.
12. **Unlocking char 1 breaks `tests/unit/character-config-lock.test.js:36` and `:75`** unless it is relocked or re-fingerprinted afterwards.

---

## 1. Data model

### 1.1 `/home/remote/MonsterBox/config/schemas/scenes.schema.json` [src]
- Root: array (line 5). Scene requires `id` and `name` (line 8). `id` is string|number (10), `name` is string (11), `steps` is an optional array (12-42).
- Step requires only `type` (16). Enum (18-39), 17 values: `servo, motor, linear-actuator, linear_actuator, light, led, audio, sayThis, askAI, goblin-video, wait, delay, sensor, pose, hardware, jaw-animation, head-tracking`.
- No other step field is declared and there is no `additionalProperties` rule. Field names are defined only by the executor and the Studio.
- The validator is a hand-rolled subset, `/home/remote/MonsterBox/services/schemaValidator.js:34-98`: anyOf, oneOf, type (arrays allowed), enum, pattern, required, properties, items. Files: `:10-17`. A missing file counts as valid (`:100-103`). The `scenes` rules are not enforced at runtime, only by `validate:schemas`, pact and the gate.
- Enum versus dispatcher mismatches (`/home/remote/MonsterBox/services/scenes/sceneExecutor.js:876-922`):
  - `linear_actuator` (underscore) is schema- and pact-valid but has no `case`. At runtime it throws "Unknown step type" and, not being in `NON_FATAL_STEP_TYPES`, aborts the scene.
  - `goblin` and `part` are dispatched but not in the schema (pact rejects them too).
  - A step with no `type` but a `poseId` dispatches as a pose (`:838`), but the schema requires `type`.

### 1.2 `/home/remote/MonsterBox/config/schemas/poses.schema.json` [src]
- Root object. Required: `characterId` (number) and `poses` (array) (line 6). `templates` is an optional object.
- Pose item required: `id` (string|number), `name` (string), `parts` (array, no item schema) (13-14).
- Optional: `category`, `description`, `notes` (strings); `concurrent` (bool); `tags` (string[]); `weight`, `holdVariance`, `jitterDeg`, `transitionDurationMs` (numbers); `transitionProfile` enum `linear|ease_in|ease_out|ease_in_out|overshoot|bounce`; `created`, `modified` (strings).
- The part shape is enforced only by `validatePose` at `/home/remote/MonsterBox/services/poses/poseRepository.js:211-233`: `name` is a string, `parts` is a non-empty array, and each part has numeric `partId`, string `type` and object `target`.

### 1.3 Type conventions [data, verified across all 6 characters]
- Scene `partId`: 53 of 53 are strings. Pose `partId`: 65 of 65 are numbers. `parts.json` ids are all strings.
- Scene ids: 25 of 25 are numbers. Scene `poseId`: 19 numbers and 1 string (scene 108 uses `"1"`).
- Executor calls use `String(partId)`. Calibration and position stores use `parseInt(partId)`, so part ids must be integer-like.
- **Scene ids must be positive integers.** Every route and service uses `parseInt` (e.g. `/home/remote/MonsterBox/services/scenes/scenesService.js:64,70`; `routes/scenes/api.js:50,302`). A non-numeric id never matches. `sceneId` 0 fails `if (!sceneId)`.
- **Pose ids must be real numbers.** `getPose` uses strict `===` (`poseRepository.js:93`) against `parseInt(step.poseId)`. A string id in poses.json never resolves.

### 1.3b Other per-character and global files

| File | Holds scene/pose ids | Deploy-excluded? (`deploy-to-animatronic.sh` line) | Locked? |
|---|---|---|---|
| `data/character-N/scenes.json` | scene ids (top-level array) | yes, 176 | yes |
| `data/character-N/poses.json` (`{characterId, poses[], templates}`) | pose ids | yes, 166 | yes |
| `gestures.json` (only char 3 has one: `{version,_comment,gestures[7]}`; steps use string `partId`, `target`/`level`, `delayMs`, `durationMs`, `easing`; read by `services/gestureEngineService.js`, not by scenes) | part ids; engine also accepts `step.pose` | yes, 177 | yes |
| `scene-queues.json` (`{queue_id,name,mode,scenes:[{scene_id,lifecycle}]}`) | scene_id strings | yes, 178 | yes (`queueLibrary.js:104`) |
| `scene-queue-templates.json` (`{id,name,items:[{id,name}]}`) | scene ids | yes, 179 | yes |
| `lurk-scenes-state.json` | `sceneIds` (strings) | yes via `*-state.json` (171) | **no** (runtime state) |
| `callout-state.json` | none (callouts only yield to a running queue) | yes (171) | no |
| `data/scene-analytics.json` (global; usage keyed `<char>_<sceneId>`; 150 executions here) | scene ids | yes, 187 | n/a |
| `config/animatronics.json` `defaultSceneId` | scene ids | **not excluded; travels with every deploy** | n/a |
| `data/scene-templates.json` (global, 6 legacy templates using step types `pause`, `sound`, `voice` that the executor does not dispatch) | none | not excluded | n/a |

No `scene-queues.json` or `scene-queue-templates.json` exists at the canonical path. Two legacy nested files exist and are git-tracked: `data/character-3/character-3/scene-queues.json` (one saved queue "Test Story 1" pointing at scene_ids "26" and "24", already dangling) and `data/character-5/character-5/scene-queues.json` (`[]`). `loadQueues` falls back to the nested path (`queueLibrary.js:88-100`).

---

## 2. The scene executor

Main file: `/home/remote/MonsterBox/services/scenes/sceneExecutor.js`. Every scene run goes through `executeScene` (`:994`), called from the queue, `/play`, `/play-stream`, armed mode and cron-driven `/play`.

### 2.1 Step reference (field names exactly as read; `*` = required)

| type (impl lines) | Fields consumed | Timing / blocking | Errors |
|---|---|---|---|
| `servo` (410-434) | `partId*`; `angle*` (real degrees, e.g. 372-406 on the knight's 900° head); `duration` (default 1000); `usePreset` + `presetName` (`__MIN__`, `__MAX__` or a named preset from the node-local calibration store, 47-99) | PCA9685 servos: the daemon call sends no duration (`hardwareService/index.js:1105`), so the step returns on ack and does **not** wait for travel. GPIO servo (Renfield's pen): blocks `max(150,duration)` ms (`index.js:1203`). A calibration `capability.invert` mirrors the angle (`index.js:2341-2354`) | non-fatal |
| `motor` (436-501) | `partId*`; `direction` (default `forward`; `cw/fwd` and `ccw/rev/reverse/back/backward` are normalized by `motor.control`, `index.js:303-312`); `speed` (default 50); `duration` (default 1000); presets | Blocks for `duration` (python wrapper, 30 s cap). If a calibration profile has `bounds.minP/maxP` and `motion.bins`, the executor clamps `duration` using a persisted position estimate (450-488). That clamp can reach 0 ("Duration must be positive. Got 0", analytics 2026-09-04) | non-fatal |
| `linear-actuator` (503-574) | `partId*`; `direction` (`extend` default, `retract`); `speed` (default 50); `duration` (default 1000); presets | Calls `extend`/`retract` (not `jog`). Same blocking, clamp and 30 s cap | non-fatal |
| `light` / `led` (576-587) | `partId*`; `state` (**only the literal `'on'` turns on; anything else, including `toggle`, turns off**); `brightness` (default 100); `duration` (default 0) | GPIO relay lamps (e.g. Orlok part 8): `duration > 0` blocks that long and then turns **off**; 0 latches **on** and returns (`scripts/light_control.py:41-46`). PCA9685 and neopixel ignore `duration`. `led_ring` parts have no controller (`HARDWARE_CONTROLLERS` has no `led_ring`), so scenes cannot address them; they react to speech via jaw/LED sync | non-fatal |
| `audio` (183-214) | `audioId*` (library id, **or** bare filename with extension, **or** a path starting `/` or `./`; see 2.3); `volume` (default 100; **ignored on the jaw-sync path**); `jawSync` (default true; `false` bypasses the jaw). No device field: the sink comes from the speaker part (`findSpeakerDeviceForCharacter`, 36-42, which only matches a speaker part carrying `characterId`; chars 2 and 4 lack it, so they use `default`) | Blocks until playback ends. Non-jaw path: `speaker_cli.py play` waits (`proc.wait()`, python_wrappers/speaker_cli.py:170/178/215/235) under the 30 s `runWrapper` timeout. Jaw path: blocks for the analyzed duration, no 30 s cap | non-fatal |
| `sayThis` (238-279) | `text` (or `say`)*; `voiceId` (optional override). Nothing else (no volume) | Live ElevenLabs TTS, then jaw-synced playback if the character's jaw is enabled with a servo, else one-shot `mpg123`/`pw-play`. Blocks until audio ends (bounded 15 s-300 s by clip length, `serverPlaybackService.js:46-...`). Logged to the speech log | non-fatal; a TTS failure (e.g. `quota_exceeded`) throws, is recorded, and the line is silent |
| `askAI` (281-342) | `question` (or `text`)*; `voiceId` | Asks the character's ElevenLabs agent (live session or a one-shot socket, `elevenLabsWebSocketService.js:2629`) for an LLM reply. Falls back to canned "I heard your question..." if no agent or reply. The reply is then TTS'd and played like `sayThis`. Non-deterministic content | non-fatal |
| `goblin-video` (344-408; alias `goblin`) | `goblinId*` (registry id from `data/goblins.json`); `videoId*` (**a filename on that Goblin's own disk**, exact match, spaces included); `loop` (bool, default false; legacy `options.loop` also read); `requireLock` (bool) | Does not wait for the clip to end; returns after about 1.5 s plus HTTP (see 2.4) | non-fatal for `goblin-video`; the alias `goblin` is **fatal** |
| `wait` / `delay` (230-236) | `duration` or `durationMs` (ms, default 0). `delay` is a Studio-era alias | Plain `setTimeout`, no cap | both are in no non-fatal set (can't really fail) |
| `sensor` (590-681) | `sensorId` or `partId`* (part type must be `motion_sensor` with a `pin`); `waitForMotion` (default false); `timeout` (default 30000, polled every 500 ms); `threshold` (bool compared to `motionDetected`) | Waits up to `timeout` | **fatal**: a timeout aborts the scene |
| `pose` (173-181) | `poseId*` (`parseInt`); `options` (passed through to `poseEngine`: `jitter:false`, `jitterDeg`, `transitionDurationMs`, `skipHealthCheck`, `allowBrokenParts`) | See 2.6 | non-fatal |
| `hardware` (683-758) | Legacy: `action` (`move_servo`, `move_motor`, `move_actuator`, `turn_light`/`set_light`, or any other action passed straight to `controlPart`); `params` (`partId`/`channel`, `position`/`angle`, `duration`, `speed`, `direction`, `state`, `brightness`) | Quirks: `move_servo` falls back to the hard-coded part `'63'`; `move_actuator` ignores `position`. Avoid | non-fatal |
| `jaw-animation` (760-787) | `action` (`enable` default; anything else is a no-op "disable") | **Only reads the jaw config and pre-warms the daemon**; it never toggles anything. Jaw follows speech and audio automatically whenever the jaw config is enabled | always returns success (warning if unconfigured) |
| `head-tracking` (789-834) | `action` (`start` default, or `stop`); `webcamId` (default `webcam-auto`); `params` | Calls `startMotionTracking`/`stopMotionTracking` with a mock req/res. `start` stays on after the scene ends | always returns success (warning on failure) |
| `part` (216-228) | `partId*`, `action*`, `params` | Direct `controlPart`. Not in the schema | fatal |

### 2.2 `concurrent` (lines 947-992)
- Truthy `step.concurrent` fires the step and does not await it (`emit concurrent-started`). **All following steps proceed immediately**, not just the next one. Consecutive concurrent steps all run in parallel.
- Sequential steps are awaited in order.
- After the loop, `Promise.allSettled` waits for every background step, so a trailing concurrent audio step holds the scene open until it settles (up to its 30 s timeout).
- A concurrent failure never throws. It is pushed as `{success:false,error,index,stepType}` (`:961-967`) and shows up in the scene result.
- If a fatal sequential step throws, `executeScene` rethrows (`:1040-1059`) and background steps already launched are not awaited. They keep running.
- Nothing can abort a running scene: `armedModeService.js:207` itself notes Node can't abort an in-flight `executeScene`. Queue `stop`, `skip` and `emergency-stop` only prevent the next scene.
- There is no scene-level or step-level timeout, only the per-subprocess ones below.

### 2.3 How audio and TTS play
- **Library resolution** (`resolveAudioFile`, 145-171): a path beginning `/` or `./` is used as given. Otherwise the root `data/audio-library/library.json` is searched for `id === audioId` and `files/<filename>` is used. If there is no id match, `files/<audioId>` is tried directly. So both `"04 - Windstorm & Thunder"` (the library id) and `"04 - Windstorm & Thunder.mp3"` (the filename) work. The Studio writes `s.filename || s.id` (`views/scenes/studio.ejs:1060-1070`).
- Mina's scene 100 uses `audioFile` (not `audioId`), so its audio step has always thrown "audio.step requires audioId" (non-fatal) [data + src].
- **TTS**: `getTTSConfigForCharacter` (all six characters use `eleven_v3`, so audio tags like `[whispers]` are honored) then `elevenLabsTTSService.generateSpeech` (`services/elevenLabsTTSService.js:172-250`). The buffer stays in memory. **No disk cache anywhere** (grep for any TTS cache found nothing). `os.tmpdir()/mb_tts_*` is written only in the last-resort speaker_cli fallback (`serverPlaybackService.js:122-128,737`) and never cleaned. Every play repeats the API call.
- In `MB_TEST_MODE=1`, `generateSpeech` returns a stub and playback is simulated (`serverPlaybackService.js:~527-541`), but queue-run scenes ignore test mode because they pass no options (`sceneQueue.js:143,154,161`).
- **Jaw state**: enabled with a servo on Dragomir (jaw part 2) [live], and on Mina per the repo copy (jaw part 1; Mina unreachable). Disabled on Orlok [live and repo], char 1 and char 6 (no jaw servo), and char 5 (no `super-powers.json` in the repo; [live] jaw off).
- `playWithJawSync` (`services/jawAnimationSuperPowerService.js:1553-1722`) pre-analyzes the whole clip with ffmpeg, starts the one-shot player un-awaited, and resolves when the jaw timeline finishes. **An `audio` step on a jaw-enabled character is jaw-animated unless `jawSync:false`**, which includes music beds.

### 2.4 `goblin-video`
Implementation: `/home/remote/MonsterBox/services/goblinManagerService.js`.
- `goblinId` must be a registry id. `data/goblins.json` has `goblin-192-168-8-40` (Goblin 1, offline), `-106` (Goblin 2, online), `-14` (Goblin 3, online), `-244` (Goblin 4, Pi 3B, offline). `config/animatronics.json` `goblins[]` (`chestwound` .160, `goblin2` .161) are phantom devices that tests say do not exist.
- `getGoblin` is checked, then `playVideoOnGoblin` (713-733). `_onlineGoblin` (509-520) pings before declaring a Goblin offline.
- Presence check: `GET /media`, then a 60 s `/api/videos/scan` fallback (632-641). A missing file returns `notOnGoblin` ("deploy it first").
- **Non-loop (default):** `POST /api/video/play-immediate {filename, returnToQueue:true}`, then sleep 1.5 s and `GET /playback-status` (`_confirmPlaying`, 830-844). Success requires `mpvRunning && currentVideo === filename`. The Goblin then returns to its own queue. The step does not wait for the clip to end, so add a `wait`. A real recorded failure: "Goblin accepted Skullfire.mp4 but mpv is showing Hugeskelly.mp4" (scene 113, 2026-10-09).
- **`loop:true`:** `/stop-all`, `/queue/clear`, `/queue/add`, `/queue/start {loopMode:'queue'}` (742-768). It replaces the Goblin's whole queue and stays until something stops it.
- Which files exist [live]: Goblins 2 and 3 each list the same 72 files: 38 numbered `NNN Jb Hd.mp4`, 17 `Pha <Creature> <Name> Win H.mp4`, and `Batattack, Bigskull, Firepumpkin, Floatinglady, Greenskull, Hugeskelly, Monstergoop, Moon, Sauron, Scary Face, Skellycrawler, Skellyskrape, Skullfire, Skullfloor, Stumblingelectricsman` (.mp4). Goblin 3 has its own looping queue (`Hugeskelly.mp4`); Goblin 2's queue is empty.
- Goblins 1 and 4 are offline and were not queried.
- The Studio lists a Goblin's real files through `GET /video-library/api/goblins/:id/videos` (`studio.ejs:1132-1148`).

### 2.5 Hardware errors, fault skipping, dry run
- `controlPart` (`services/hardwareService/index.js:2146-2406`) **never throws**; it returns `{success:false,error}` for: part not found, no controller, unsupported action, wrapper failure, or servo-daemon channel denial (`deniedByPhysicalFaults`). Step functions throw when `!r.success`.
- Sequential steps in `NON_FATAL_STEP_TYPES` (`sceneExecutor.js:937-945`: servo, motor, linear-actuator, light, led, pose, hardware, jaw-animation, head-tracking, goblin-video, audio, sayThis, askAI) are caught, logged, emitted as `step-failed` and recorded. Anything else is **fatal**: sensor, wait, delay, part, goblin, unknown or `linear_actuator`.
- Scene `success` is false if any recorded result has `success:false`. The queue and lurk ignore it.
- `/scenes/api/:id/play` returns `success:true` at the HTTP level regardless of `result.success` (`api.js:394`).
- **Physical-fault skip** (`:861-874`): if `step.partId` is listed `status:"broken"` in `/home/remote/MonsterBox/config/physical-faults.json` (checked via `getPhysicalFault`), the step is skipped with `{success:true,skipped:true}`. This counts as success and emits `status:'skipped'`. It applies only to steps carrying `partId` and not in dryRun. The pose engine also drops those parts (`poseEngine.js:72-95`), and the servo daemon vetoes their configured channels.
  - Current list: char 1 part 5 (PIR); char 3 parts 2 (Left Arm), 3 (Bow), 4 (Elbow), 5 (Forearm); char 5 part 1 (wiper motor). Char 6 has none.
  - Repo-copy scenes affected: Orlok 109 steps 3 and 6 (part 3), 102 step 1 (part 3), 107 step 0 (part 2); Groundbreaker scene 1 step 0.
  - Orlok poses touching a broken part: 1, 6, 20, 23, 26, 32 (all part 4).
- Per-part software safety limits are retired (`config/hardware-safety.json` has `"characters": {}`), so nothing is clamped or refused except the faults above.
- dryRun (`:839-849`) returns success for **every** step type with no validation. Only `wait` sleeps `min(d,50)` ms. Analytics are skipped. `/play` forces dryRun only when the server process has `MB_TEST_MODE=1`. `/play-stream`, `/test-step` and every queue path honor only `?dryRun=1` or nothing.

### 2.6 `pose` steps
`executePoseStep` does `parseInt(step.poseId)` and `poseEngine.executePose({characterId, poseId, options})`. The pose is loaded from `data/character-<that character>/poses.json` (`poseRepository.getPose`, strict `===`). Poses are never resolved by name. A missing pose returns `{success:false,error:"Pose N not found for character C"}`, so the step throws and is recorded (non-fatal).

`poseEngine.js:20-284`:
- Servo parts with `target.angleDeg` go in one batch. With `transitionDurationMs > 0` (pose field or `options`) they are eased at about 50 Hz through `transitionEngine` using `transitionProfile`, and the step blocks for that duration (`:115-125`). Without it, `batchMoveServos` sends targets once and returns.
- Other parts run concurrently, each blocking for its own duration: linear_actuator `target.{direction|distance,speed,durationMs|duration}` through `jog`; motor `{speed,direction,duration}`; light/led `{action|state,brightness,duration}`.
- Servo `target.continuous` is supported. Any other part type returns "Unsupported part type" for that part.
- Per-pose `jitterDeg` is clamped inside the calibrated window, with `MAX_JITTER_DEG = 15` (`options.jitter:false` disables it).
- Overall `success` requires zero failed parts; if all parts are dropped as broken it still reports success with 0 executed.
- No part of the pose engine or executor calls `claimServo` (grep found nothing in `services/scenes` or `services/poses`), although idle, head-tracking and speech co-expression comments say they yield to `PRIORITY.SCENE`. I found no mechanism by which a running scene holds a servo against them.

---

## 3. Queue, loop, lurk, schedules, and every store of scene ids

### 3.1 Queue (`/home/remote/MonsterBox/services/scenes/sceneQueue.js`, `queueLibrary.js`)
- The queue is in-memory per character and resets on restart (`sceneQueue.js:4-24`). Modes are `sequential` and `loop_queue`. In loop mode an empty queue refills from `originalItems` (`:180-182`). Between iterations of the lifecycle loops there is a 250 ms floor (`:127`).
- `POST /scenes/api/queue/start-config` (`routes/scenes/api.js:157-166`) calls `validateQueueDefinition` (`queueLibrary.js:63-86`). It requires at least one scene (400 otherwise). Each item is `{scene_id}` or `{id}`, with an optional `lifecycle` of `run_once`, `run_for_duration {duration}` or `loop_until_disabled {max_duration}`, both capped at 48 h (`:42-61`). `startWithConfig` (`sceneQueue.js:239-267`) loads **that character's** scenes. Ids not found are **silently skipped**. If none match, the loop exits immediately.
- `enqueue` (`:47-55`) and `insertPriority` (`:110-117`), and `queueTemplates.enqueueTemplate`, call `loadScenes()` with **no characterId**, which means the node's selected character.
- `/queue/reorder` reorders in-memory queue indices; `/scenes/api/reorder` (`api.js:278-297`) persists library order into scenes.json (lock-aware write). The dashboard calls the latter on every drag (`dashboard.js:1895-1902`) and the one-tap deck lists scenes in file order.
- A scene that throws does not stop the queue (`:195-203`). `stop`/`skip` are checked only between scenes.
- Fleet "Start Loops": `orchestrationService.startAllQueueLoops` (`services/orchestrationService.js:620-679`, `defaultSceneId` at 631) POSTs `/scenes/api/queue/clear`, then `/enqueue {sceneId: defaultSceneId}`, then `/start {mode:'loop_queue'}` per controllable node. It uses `axiosHttps` directly rather than `httpNode`, so the egress test-mode guard at `:139` does not cover it. Per `config/animatronics.json:11,23,34,45,56,68`: PumpkinHead null, Mina 1, Orlok 109, Dragomir 1, Groundbreaker 1, Renfield 1. **Dragomir's id 1 is already dangling** (his scenes are 401-403).
- A running queue silences callouts, background music and lurk scenes (all gate on `queueRunning`).
- `scripts/start-all-loops.sh` hard-codes ids (Dragomir 9, Groundbreaker 9007, PumpkinHead 2, local 29). None exist now.

### 3.2 Lurk scenes (`/home/remote/MonsterBox/services/lurkSceneService.js`)
- State file `data/character-N/lurk-scenes-state.json` `{enabled, sceneIds[], intervalMs (60 s-24 h, default 240000), jitterPct, quietHours {23:00-08:00}}` (`:31-74`). `sceneIds` are normalized to strings (max 50).
- `playNext` picks `nextSceneId` round-robin (`:123-127`, `:337`), then `playScene` calls `queue.startWithConfig(charId, {mode:'sequential', scenes:[{scene_id}]})` (`:202-209`). A missing id gives `success:false`, reason `scene-missing` (`:340-346`) and the rotation moves on.
- Gates (`:107-120`): enabled, has scenes, quiet hours, mute, lurking (lurk mode or PIR watcher armed), no guests, no conversation, no callout, no queue running, no recent audio.
- Endpoints, all working on locked characters: `GET`/`POST /conversation/api/lurk-scenes` and `POST .../lurk-scenes/test` (`routes/conversation.js:1536,1548,1564`). Boot apply at `server.js:1152`.
- [live] right now: char 1 disabled `[]`; char 3 enabled `["112","113","114","115","116","111"]` (running, last 113); char 4 enabled `["401","402","403"]` (running); char 5 enabled `["1".."5"]`; char 6 enabled `["1".."5"]`; char 2 unreachable. All queues idle. Repo: only `data/character-3/lurk-scenes-state.json` exists, untracked.

### 3.3 Everything that stores or dials scene ids outside scenes.json
- `lurk-scenes-state.json` per node (above). Node-local, deploy-excluded; update through the lurk endpoint (works while locked).
- `config/animatronics.json` `defaultSceneId` (deploys; read by fleet Start Loops; merged into node discovery at `services/nodeDiscoveryService.js:247`).
- `scene-queues.json` and `scene-queue-templates.json` (none canonical; the legacy "Test Story 1" above).
- Cron "scene" actions: `services/scheduleService.js:226-232` builds `curl -sk -X POST https://localhost:3000/scenes/api/<id>/play?characterId=<n>` in the managed crontab block; the form lists the current character's scenes (`routes/scheduleRoutes.js:84`). **Orlok's crontab has no scene action**: only `@reboot start-audio.sh`, the Dusk Ceremony (`30 18 31 10`), Thomas (`47 20 31 10`) and the night-memory harvest (`0 2 1 11`). Peer crontabs were not read.
- Dusk ceremony (`scripts/yard-theater/moments/dusk-ceremony.json`, `perform.mjs`): drives the orchestration `say` and `play-audio` endpoints by node id and audio **filename** (resolved to each node's `audioId`). **No scene ids.** It wants `dusk-theme.mp3`, which is not in `data/audio-library/files` or `library.json`; the README says those steps skip.
- Armed mode: in-memory playlist (`armedModeService.js`), nothing persisted.
- `data/scene-analytics.json`: runtime, gitignored, keyed by id. Reused ids inherit old counters.
- "Goblin weaves": **not found** anywhere in code, data or docs (one unrelated prose hit in a conversation sample). Goblin playlists (`data/goblin-playlists.json`, `goblin/playlists/*.json`) reference video filenames and goblin ids only (the former uses a stale id `goblin-three`), no scene ids.
- Not found: callouts, ElevenLabs agent configs (`config/elevenlabs`), UI code and `manual-controls-layout.json` hold no scene ids. Poses referenced from `super-powers.json`: none (`followOrders.commands` are empty, but pose NAMES, categories and tags are matched live by follow-orders, `followOrdersSuperPowerService.js:152`).
- Other consumers of poses.json beyond scenes: idle loop (`services/movement/poseLibrary.js:143-180`, **only poses tagged `idle`**, uses `weight`, `holdVariance`, `transitionDurationMs`), random poses (`services/randomPoseService.js:133-160`, categories `subtle|moderate|idle`), follow-orders and the gesture engine (`step.pose`). With zero poses these are silent no-ops. Orlok's idle loop is currently disabled in `movement-config.json`.

---

## 4. Save paths

### Scenes (`/home/remote/MonsterBox/routes/scenes/api.js`)
- **Create** `POST /scenes/api` (`:312-328`): requires `name` only (400 otherwise). Steps are accepted unvalidated. id = `max(parseInt id)+1`, computed under a per-file lock (`scenesService.mutateScenes`, `scenesService.js:51-59`). A client `id` is ignored. Adds `created`. After a full delete ids restart at 1.
- **Update** `PUT /:id` (`:330-345`): replaces `name` and `steps` only, sets `updated`. **Delete** `DELETE /:id` (`:347-359`), 404 if missing.
- **Import** `POST /import` (`:526-561`), see section 5. Others: `duplicate` (480-505), `from-template` (451-478, copies legacy template steps verbatim), `test-step` (361-379, **real hardware unless `?dryRun=1`**).
- All writes go `scenesService.saveScenes` then `writeJsonAtomic` (atomic temp-file rename, lock-aware, `services/atomicStore.js:26-40`). The target is `data/character-<id>/scenes.json` where the id comes from `?characterId=` first, then params, then the selected character (`services/characterContext.js:55-68`). Any digit string is accepted, so any node can write any `character-N` dir on its own disk.
- **Route shadowing [src, not executed]:** `GET /:id` is registered at `:300`, before `GET /templates` (`:442`), `GET /export` (`:508`) and `GET /analytics` (`:564`). Those three would be matched by `/:id` (`parseInt` gives NaN) and return 404 "Scene not found". `analytics/popular` and `analytics/:sceneId` are reachable.
- The Studio uses: `POST /scenes/api`, `PUT /:id`, `DELETE`, `/:id/play`, `/queue/*`, `/queue/library`, `/queue/start-config` (with `scene_id`), `/test-step`, plus `/setup/poses/api/poses` for the pose list.
- The Studio writes (`views/scenes/studio.ejs:953-1245`): `partId` (string), `usePreset`, `presetName`, `angle`, `duration`, `direction`, `speed`, `state`, `brightness`, `audioId`, `volume`, `text`, `question`, `poseId` (a **string** from the `<select>`), `goblinId`, `videoId`, `loop`, `action`, `timeout`, `concurrent`. Defaults on add (`:1248-1265`): servo angle 90/1000, motor forward/50/1000, actuator extend/75/3000, light on/100, wait 1000, sensor timeout 5000 + `waitForMotion:true`, audio volume 80, goblin `loop:false`.

### Poses
- Pose Editor `/poses/editor` (`routes/poses/index.js:20-33`) saves through `POST /poses` (201) and `PUT /poses/:id` (`poses-editor.js:524-538`).
- `/setup/poses/api/poses[...]` is the same controller (`routes/setup/poses.js:15-22`). Execute: `POST /poses/:id/execute` or `/setup/poses/api/poses/:id/test`.
- `controllers/posesController.js`: `validatePose` first (400 on failure, `:77-101`). Id assignment in `poseRepository.addPose` (`:102-124`): `{id: max+1, ...poseData, created}`. **The spread comes after `id`, so a client-supplied `id` overrides the assigned id, and uniqueness is not checked.** Update keeps the id (`:143-148`). Delete is by id and does not touch scenes that reference it.
- Editor payload: `{name, category (default 'custom'), description, concurrent, parts:[{partId:Number, type, target}], transitionDurationMs?, transitionProfile?, jitterDeg? (max 15), notes?}`. Targets: servo `{angleDeg}`; motor and linear_actuator `{direction,speed,duration}`; light `{state,brightness}` (`poses-editor.js:358-405`).
- Hand-authored fields the editor never writes: `tags`, `weight`, `holdVariance`.
- Templates: `getTemplates` merges defaults `elbow` and `head` with the file's `templates`, so `/poses/templates` is never empty (`poseRepository.js:19-38,181-193`).

### Lock behavior at these routes
- Locked write gives scenes: **HTTP 500** with `{success:false,error:"<Name> (character N) is LOCKED — configuration is frozen and writing scenes.json was refused. Reason: ... Unlock deliberately with: node scripts/character-lock.mjs unlock N"}`. Poses: create and update **400**, delete **500**.
- The unit test pins 423 only on the thrown error object (`character-config-lock.test.js:83-93`).
- Escape hatch `MB_ALLOW_LOCKED_CHARACTER_WRITES=1` exists, but `tests/helpers/lockAware.js` records that it once wiped a locked `parts.json` from 233 to 5 lines.
- Lock CLI (`scripts/character-lock.mjs`): `status`, `lock`, `refresh`, `unlock`, `verify` (reports drift, never fails). The lock list is read from **each node's own** `config/character-locks.json` (mtime-cached), and that file is **not** deploy-excluded, so an unlock done on one node does not unlock another, and a later deploy can restore the old list.

---

## 5. How scenes travel between nodes

### 5.1 `/home/remote/MonsterBox/scripts/deploy-to-animatronic.sh` (rsync `-avz --delete`, line 162)
- **Excluded (lines 163-204):**
  - Locked characters' whole dirs (`data/character-<id>/`, 150-160, built from `config/character-locks.json` on the DEPLOYER, currently 1 and 4).
  - Per character: `parts.json` (165), `poses.json` (166), `servo_calibrations.json` (167), `super-powers.json` (168), `lurk-mode-state.json`, `motion-armed-state.json` and any `*-state.json` (169-171), `microphones.json`, `audio-config.json`, `ai_agent_state.json` (172-174), `movement-config.json` (175), **`scenes.json` (176), `gestures.json` (177), `scene-queues.json` (178), `scene-queue-templates.json` (179)**.
  - Global: `data/calibration_profiles.json`, `actuator-positions.json`, `speaker-state.json`, `monsterbox.pid`, `manual-nodes.json`, `startup-health.json`, `performance-history.json`, `scene-analytics.json` (180-187), `config/app-config.json` (188), `/data/ai-config/`, `/certs/`, `.git`, logs and similar.
  - `--delete` does not remove excluded files on the receiver.
- **Not excluded, so they travel:** `data/audio-library/**` (files and `library.json`), `data/video-library/**`, `data/goblins.json`, `data/goblin-playlists.json`, `data/scene-templates.json`, `data/characters.json`, `config/animatronics.json` (including `defaultSceneId`), `config/character-locks.json`, `config/physical-faults.json`, `config/hardware-safety.json`. Per character: `ai-config/`, `images/`, `models/`, `linear_actuator_calibrations.json`, `servos.json`, `simple_calibrations.json`, `manual-controls-layout.json`, and the nested legacy `character-N/character-N/` files.
- While a character is unlocked on the deployer, a deploy would also push those not-excluded per-character files (TTS config, images, models, calibration stubs) over the node's.
- Audio assets must exist in the deployer's `data/audio-library/files/` to arrive, and a node-only upload is deleted by the next deploy (`--delete`).
- `scripts/deploy-all.sh:36-66` just enumerates `config/animatronics.json` nodes that have an `ip` and runs this script per node in parallel. It is the only `deploy-all.*` file. `npm run deploy:all` maps to it (`package.json:75`).
- `scripts/bringup-animatronic.sh:59-65` is different. It uses `--delete` and excludes only `parts.json`, `poses.json` and `servo_calibrations.json`. It **would push the deployer's `scenes.json`, `gestures.json`, queue files, `super-powers.json` and `movement-config.json`**, and does not honor locks. Treat it as a hazard, or a deliberate push route.

### 5.2 Ways to get new scenes onto a node
- `POST https://<node>:3000/scenes/api/import[?characterId=N]` with `{scenes:[...], overwrite?:bool}` (`routes/scenes/api.js:526-561`). It matches existing scenes by `parseInt(id)`. With `overwrite:true` it replaces matching ids; otherwise it skips them. Unmatched scenes are appended as given (ids preserved). **It deletes nothing, validates nothing (not even `id`, `name` or step types), and a scene with no id is appended without one.** A wholesale replace is therefore per-scene `DELETE /scenes/api/:id` followed by `POST /import`.
- `GET /scenes/api/export` is shadowed by `/:id` (per code order, not executed), so there is no working export route.
- Poses: no import or bulk endpoint. Use `POST /poses` per pose (id is `max+1` unless you pass `id`; see section 4), or copy the file.
- Direct file copy (scp/rsync of `scenes.json` and `poses.json` into `data/character-N/` on the node) works without a restart, since scenes and poses are read from disk per request (`scenesService.loadScenes`, `poseRepository.loadPoses`, `poseLibrary.loadPoses`; no caching found). It bypasses the lock (`lock:verify` will show drift).
- Locked chars 1 and 4: unlock on that node's own lock file, write, then `refresh` or relock and commit. Lurk rotations can still be updated while locked. Background music is `POST /api/audio-loop/background[?characterId=N]` (`routes/api/audioLoopRoutes.js:215-237`, answers 423 when locked).
- No orchestration endpoint ingests scenes (`/api/orchestration/*`: `update-config` and `deploy-code` are broadcasts with no scene payload).
- There is no `/scenes/api` bulk "replace" and no character-level import/clone route (`routes/setup/characters.js`).

---

## 6. Current inventory (repo copy, this node's working tree) with live drift

### Scenes (25 in the repo copy)
- **Char 1 PumpkinHead (locked): 0 scenes.** (`[]`; a 2026-09-07 changelog entry records an earlier deliberate erase.)
- **Char 2 Mina: 4.** 1 "Coffin Awakening" (linear-actuator part 4 x2, sayThis, servo x2); 2 "Interactive Conversation" [askAI]; 3 "Full Performance Spectacular" [askAI x2; light part 5, actuator part 4 8500 ms]; 100 "Halloween Audio Loop - Coffin" [audio step uses `audioFile`, so it never plays; then delay 277000; scene-level `loop:true` is read by nothing]. Mina's live copy was unreachable.
- **Char 3 Orlok: 13 (file order).**
  - 109 "A Blessing" [askAI; actuator part 3 x2 skipped as broken; jaw-animation; sayThis x2].
  - 110 "Kiley's Jump" [audio "04 - Windstorm & Thunder.mp3" concurrent; actuator part 1 10000 ms].
  - 102 "Linear Actuator Test" [part 3 skipped].
  - 103 "Audio & Light Test" [audio "07 - The Coffin.mp3"].
  - 104 "AI Voice Test - Say This & Ask AI" [askAI].
  - 107 "Left Arm & Goblin Video Test" [part 2 skipped; goblin-video `goblin-192-168-8-14` with **no videoId, so it throws**].
  - 108 "Pose Test" [pose "1"].
  - 111 "Arc 1" [audio x2 (Windstorm 233 s, Snarling Werewolves 125 s: both exceed 30 s); servo `usePreset __MIN__/__MAX__`; actuator 13000 ms x2; light x3].
  - 112 "Lurk: The Count Wakes" [poses 31,30,28,35].
  - 113 "Lurk: Fire of Wallachia" [audio Windstorm; poses 21,27,28,22; goblin `goblin-192-168-8-14`/`Skullfire.mp4`].
  - 114 "Lurk: The Moon Spell" [poses 7,21,27,28,22; goblin `-106`/`Moon.mp4`].
  - 115 "Lurk: Roll Call of the Castle" [poses 17,18,19].
  - 116 "Lurk: The Invitation" [poses 33,25,35].
- **Char 4 Sir Dragomir (locked): 3.** 401 "Riddle of the Magic Box - The Clock", 402 "... The Piano", 403 "... The Candle" (each 10 steps: jaw-animation, servo x5 on part 1 head at 372/406° and part 3 box at 20/174°, sayThis x3, wait 9000).
- **Char 5 Groundbreaker: 1 in repo.** 1 "Groundbreaker Insult Loop" [motor part 1 100% 2000 ms concurrent (**part broken, skipped**), sayThis, wait 30000]. **Live: 5**: 1 "Lurk: Hello Down There", 2 "Lurk: Skull Friend" (goblin `-14`/`Bigskull.mp4`), 3 "Lurk: Rock War", 4 "Lurk: Costume Parade", 5 "Lurk: Castle Friends".
- **Char 6 Renfield: 4 in repo.** 1 "Lurk: Scribbling Transactions" (servo part 7 x4, motor part 1), 2 "Lurk: The Gifts", 3 "Lurk: Giggle and Shake", 4 "Lurk: Correspondence". **Live: 5**: adds 5 "Lurk: Permit for a Bonfire" (jaw-animation, sayThis x3, servo x3, motor, goblin `-14`/`Firepumpkin.mp4`).

Scenes using askAI: Mina 2 and 3; Orlok 104 and 109. Scenes using audio: Mina 100; Orlok 103, 110, 111, 113. Scenes using goblin-video: Orlok 107, 113, 114 (live: char 5 scene 2, char 6 scene 5). Scenes using pose: Orlok 108, 112-116.

### Poses (43 in repo)
- **Char 1: 2.** 1 "Body Sway (left)", 2 "Body Sway (right)" (motor part 1; the lock reason says motor above 40% browns out his Pi).
- **Char 2: 6.** 1 Rest, 2 Listening At The Wall, 3 Speaking Softly, 4 Whisper, 5 The Long Breath, 6 Startled (servo parts 1 and 2).
- **Char 3: 35** (parts used: head servo 15, right-arm actuator 1, elbow servo 4 (broken), lamp 8). 1 Neutral Standing[15,4,8]; 2 Glance Left; 3 Glance Right; 4 Arm Raise Slight[1,15]; 5 Forearm Twist; 6 Menacing Lean[15,4]; 7 Slow Scan; 8 Hand Glow[8,15]; 9 Idle Drift Left; 10 Idle Drift Right; 11 Idle Settle Center; 12 Idle Watch Left; 13 Idle Watch Right; 14 Idle Micro Twitch; 15 Idle Long Stare Left; 16 Idle Long Stare Right; 17 Slow Turn — Seek Left; 18 Slow Turn — Seek Right; 19 Snap to Center; 20 Menacing Lean Deep[15,4]; 21 Arm Raise Full[15,1]; 22 Arm Lower[15,1]; 23 Elbow Home[4]; 24 Right Arm Reach[1,15]; 25 Right Arm Withdraw[1,15]; 26 Startle Recoil[15,4]; 27 Hand of Azura On[8]; 28 Hand of Azura Off[8]; 29 Lamp Accent Flash[8]; 30 Lurking Glow[15,8]; 31 Fragment — Notice and Turn; 32 Fragment — Rise and Point[15,4]; 33 Fragment — Reach for the Guest[1,15]; 34 Fragment — Recede to Shadow[15,8,1]; 35 Neutral Home (Head). (Unbracketed poses are servo 15 only.)
- **Chars 4 and 6: 0** (`{characterId, poses:[], templates:{}}`). **Char 5: 0 in repo; live 1** (id 1 "elbow - Half Bend", servo part 1, which is actually that node's motor part).

### Parts (all `parts.json` ids are strings; scenes can drive servo, motor, linear_actuator, light/led and read motion_sensor)
- **1:** motor 1 Body Shakes (MDD10A); led_ring 9 eyes (speech-reactive only); PIR 5 broken; speaker 7, mic 8, webcam 6.
- **2:** servo 1 Jaw (ch11), 2 Neck (ch7), 3 Eye (ch3); light 10 laser (PCA ch15), 5 Burning Rose (GPIO 16); linear_actuator 4 Coffin Door; PIR 9.
- **3:** linear_actuator 1 Right Arm (working), 2 Left Arm (broken), 3 Bow (broken); servo 4 Elbow (broken), 5 Forearm (broken), 10 Jaw (ch3), 15 Head (ch0); light 8 Hand of Azura (relay, GPIO 16); PIR 14.
- **4:** servo 1 Head (multi-turn, `rotationRangeDeg` 900, ch7), 2 Jaw (ch3), 3 Magic Box (ch11); PIR 7.
- **5:** motor 1 (BTS7960, broken); webcam, speaker, mic only. No `super-powers.json` in repo.
- **6:** motor 1 shake (BTS7960); servo 7 Writing Pen (GPIO 26, range 180); led_ring 5 eye rings (speech-reactive only); PIR 6.

---

## 7. Test coupling

### 7.1 What the validators do with new scene files
- `npm run validate:schemas` ([ran] passes now): scenes.json must be an array. Each scene needs `id` (string|number) and `name`. If `steps` exists it must be an array of objects whose `type` is in the 17-value enum. No other field is checked. poses.json must be an object with numeric `characterId` and an array `poses`; items need `id`, `name`, `parts` (array). `transitionProfile` is checked against its enum if present. A missing file passes. `[]` passes.
- Pact (`/home/remote/MonsterBox/tests/pact/character-contract.test.mjs`): iterates `data/characters.json`. `:37-42` `KNOWN_STEP_TYPES` is the same 17 types (it lacks `goblin` and `part`); `:98-108` fails on any other type; `:110-114` requires `poses.characterId === registry id`. It also asserts parts and ai-config invariants.
- Gate (`scripts/gate.mjs`): validate:schemas, audit:resolver, audit:independence, audit:design-system, test:smoke (= unit), test:pact.
- **Neither validator nor pact checks that referenced pose ids, part ids, audio ids, goblin ids or videos exist; that a part is not on the broken list; field spelling (`audioFile` passes); clip length; `linear_actuator` dispatchability; integer ids; or `steps` presence.** A scene set can pass every gate and still fail at runtime. No test cross-references scene steps to poses or parts, and the only data-driven checks are the pact ones above.
- `audit:independence` (`scripts/audit-character-independence.mjs:30-36`, ratchet against `tests/baseline/character-independence-allowlist.json`, 22 entries, may only shrink) fails any NEW `.js`/`.mjs`/`.ejs` containing `orlok` (case-insensitive), `characterId: 3`, `char_id: 3`, the node IPs .120/.130/.140/.150/.200, or `=== 'Orlok|Mina|PumpkinHead|Sir Dragomir|Groundbreaker'`. New per-character tests must loop over the registry like the pact suite. JSON data is not scanned.

### 7.2 Tests that read real scene/pose data or hit live scene/pose APIs

| file:line | assumption | effect of wholesale replacement |
|---|---|---|
| `tests/unit/pose-jitter-health.test.js:302-314` | loads every character's real `poses.json` and `evaluatePoseHealth`s each pose without throwing | new poses must be structurally valid (`partId`, `type`, `target`); empty passes |
| `tests/unit/movement.test.js:739-790` | real char 3 idle-tagged poses; every assertion is guarded by `poses.length > 0`; `pose.weight > 0` | passes if char 3 has no idle poses; poses tagged `idle` need weight > 0 |
| `tests/unit/gesture-engine.test.js:300-402` | real `data/character-3/gestures.json` (gestures, not scenes/poses; steps use `partId`) | unaffected unless gestures change |
| `tests/system/ai-motion.test.js:65,83-112` | builds its fixture from the first two poses of the selected character; with 0 poses the fixture is null; with poses it writes and deletes a gestures.json capability | activates for chars with poses; the capability write is a lock-refused config write on locked chars |
| `tests/system/dashboard-api.test.js:249-264` | `GET /scenes/api/` returns an array; `scenes[0]` has `id`, `name`, `steps` (array) | every new scene needs a `steps` array |
| `tests/system/dashboard-api.test.js:266-276` | `if scenes.length > 1`, POST `/scenes/api/reorder` with the listed ids and expect 200; it writes scenes.json | char 1 has 0 scenes, so this is skipped today; 10 new scenes activate it and on a locked node it returns 500, failing. Same on Dragomir's node today (3 scenes, locked) |
| `tests/system/dashboard-api.test.js:294-299`, `tests/basic.test.js:48-57`, `tests/system/follow-orders.test.js:140-144` | poses list is an array | none |
| `tests/basic.test.js:69-112` | creates and deletes a pose from the first template with a hard-coded `partId:'30'`; skipped via `skipIfLocked` | none (templates are never empty) |
| `tests/browser/scene-concurrency.spec.js:19-47` | plays `scenes[0]` (**first in file order**) with `?dryRun=1`; skips if no scenes | char 1 goes from skip to run (dry only) |
| `tests/browser/scenes.spec.js:145-175` | Play button starts disabled; clicking the first `.scene-item`/`[data-scene-id]` enables it | needs scenes to render `.scene-item`/`data-scene-id` |
| `tests/browser/actual-usage-testing.spec.js:196-226` | clicks `#btnLoopAll` (a no-op today because of the 400, see 0.5), then clicks the **first scene tile, which POSTs `/scenes/api/:id/play` without `dryRun`** (`public/js/dashboard-v2.js:177`). Its comment says the server runs it dry under `MB_TEST_MODE`, but the recommended `MB_USE_RUNNING_SERVER=1 BASE_URL=:3100` target is not in test mode | a real show plays on the node under test. If someone fixes the Loop All payload, `#btnLoopAll` also starts a real loop (queue ignores test mode) |
| `tests/browser/exhaustive-system-test.spec.js:298-330, 544-571` | Loop All and Stop click (`:318`); **scene CRUD**: POST `/scenes/api/` with a wait step, PUT, DELETE, each `expect 200`. `:3.3` posts a pose with `parts:{}` (400, status only logged) | fails on locked nodes (500). Create-then-delete reuses ids |
| `tests/browser/studio-goblin-step.spec.js:19-75` | needs an online Goblin; creates scene "ZZ Studio Goblin Step <ts>" through the Studio, saves, reloads, deletes it | fails on locked nodes; reuses ids; asserts the saved step shape `{type:'goblin-video', goblinId, videoId, loop:false}` |
| `tests/browser/mcp-comprehensive.spec.js:238-250,320-324,447-472` | pose editor form fill only (no save); scenes API log; deck and Loop All presence | none |
| `tests/browser/panel-sortable.spec.js:144-190`, `conversation-refactor.spec.js:130-165` | deck tabs show tiles or an honest empty state | none |
| `tests/unit/character-config-lock.test.js:36-43, 45-52, 75-81, 83-93` | char 1 **must** be locked; every other unlocked; `assertConfigPathWritable` refuses char-1 `scenes.json`/`poses.json`; the error carries status 423 | unlocking char 1 without relocking fails 36 and 75 |
| `tests/system/orchestration.test.js:343-348` | `POST /start-all-queue-loops` expects 200 | **real fleet fan-out** against the :3100 listener (service env has no `MB_TEST_MODE`; route guard at `orchestrationRoutes.js:490`). KNOWN-BUGS documents that only the "Scene not found" data mismatch prevented real playback before. After replacement, valid `defaultSceneId`s mean the test truly starts loops, and the next test truly stops them |

### 7.3 Executor-source-pinned and synthetic tests (not tied to scene data)
- Source regex pins: `tests/unit/scene-step-resilience.test.js:19-52` (NON_FATAL set contents, the try/catch shape, `sceneSuccess`), `tests/unit/fleet-honesty.test.js:55-108` (`start(characterId, options={})`, loop refill, queue try/catch, NON_FATAL), `tests/unit/atomic-json-writers.test.js:50-60` (`recordSceneExecution`), `tests/unit/pose-engine-targets.test.js` (poseEngine key handling), `tests/unit/multiturn-editor-range.test.js:77-110` (reads `studio.ejs`). These break if the executor or Studio source is edited, not if data is replaced.
- Synthetic: `tests/unit/lurk-scenes.test.js:36-112` (ids `10`, `11`, `gone`), `tests/unit/queue-library-path.test.js` (character 99017), `tests/unit/goblin-orchestration-targets.test.js:96-130` (stubbed manager, pins `loop` default false and `returnToQueue`), `tests/unit/background-music.test.js`, `tests/unit/callouts.test.js`, `tests/system/scenes.test.js` (inline scenes through `bulletproofExecutor`, which **no production code uses**; plus `:91-106` reads `data/scene-templates.json[0].id/steps`), `tests/system/animation-studio.test.js:22-109` (`executeStep` with char 3 for jaw-animation and head-tracking, plus "unknown step type must throw").
- Old names and ids appear only as inline fixtures: `tests/unit/order-matcher.test.js:37-40,175-190` (pose ids 1/21/22 "Neutral Standing", "Arm Raise Full", "Arm Lower"), `follow-orders-arm-phrasing.test.js:158` (31), `body-role-interpreter.test.js:207` (7), `body-state.test.js:84`. No assertion on a scene or pose count exists anywhere; counts are only logged or used as `> 0`/`> 1` guards. `tests/ai/*` has no scene or pose coupling.
- `scripts/clean-test-artifacts.js:47-51` deletes scenes and poses whose name matches `/^Test/i`, `/Playwright/i` or `/^PW\b/i` in kept characters. Avoid those names.

### 7.4 `tests/hardware/` coverage today
`continuous-servo-calibration.test.js` and `linear-actuator-calibration.test.js` exercise the unified calibration API against throwaway stores and command no motion. `microphone-crud-mocha.test.js` enumerates inputs and levels via `/setup/audio/api` (hard-coded 127.0.0.1:3100). `stepper.test.js` skips unless the character has a stepper part. `test-hardware-timing.js` is a stale standalone script (it only runs when invoked directly, and calls a non-existent `/api/scenes/execute-step`). There is **no hardware test of scene or pose execution**.

### 7.5 Environment facts for running suites
- The service (pid 1018) runs `NODE_ENV=production`, `PORT=3000`, no `MB_TEST_MODE` [live /proc]. The always-on :3100 listener is the same app, so `MB_TEST_MODE` set on the mocha client does not protect real hardware or fleet fan-out.
- Browser tests and system tests write the node's real `data/character-<selected>/scenes.json` and `poses.json` (no sandbox); `tests/setup.js` sandboxes only the calibration and actuator-position files.

---

## 8. Audio library and TTS

- Files: `/home/remote/MonsterBox/data/audio-library/files/` (80 mp3s, all on disk) and `/home/remote/MonsterBox/data/audio-library/library.json` (`{version,created,lastModified,totalFiles,totalSize,categories,tags,audio[80]}`). Entry keys: `id, title, description, filename, originalFilename, format, duration, fileSize, sampleRate, channels, bitrate, tags, category, artist, album, genre, year, uploadedAt, lastModified, waveformGenerated, favorite, playCount, lastPlayed`. `data/audio-library/backup/` and `waveforms/` also exist.
- Registration: `audioLibraryService.rescanLibrary()` (`services/audioLibraryService.js:109-232`, run on service init) adds any file in `files/` with `id = base filename without extension` and category `other`, or a genre-derived one. Uploads go through `POST /audio-library/api/upload` (multipart `audioFiles`, up to 10; `routes/audioLibrary.js:123`). `GET /api/sounds` feeds the Studio and deck (`id, title, filename, duration, format`). `rescan` is a service-start behavior; I did not find an HTTP rescan endpoint.
- Id versus filename: scenes may use either, and an absolute or `./` path; the Studio saves the filename. The orchestration `play-audio` endpoint and the yard-theater scripts require the library `audioId` (README of yard-theater). 38 unique tracks sit behind 80 entries (many UUID duplicates of the numbered tracks).
- Music: there is **no music flag**. All entries are category `other` (one carries tags `yard-theater/halloween`), although `categories` lists `music`. Background music is configured per character in `super-powers.json` `backgroundMusic {enabled, tracks[audio ids or filenames], volume (default 35), shuffle, resumeDelayMs, quietHours}` (`services/backgroundMusicService.js`; Orlok has 8 tracks, `super-powers.json:169`). It pauses for conversations, any running scene queue, other audio, mute and quiet hours. Edit it with `POST /api/audio-loop/background`. A scene `audio` step is the only scene-side playback, hence the 30 s limit.
- **Clips safe for an `audio` step on a non-jaw node (under 28 s):** Thomas Whisper 1.2 s; Replica Studios Audio 2.0/5.0/25.1 s (ids `6700e722-…`, `54ef9d8c-…`, `ba5adb09-…`); old wardrobe door squeaking 3.3 s; rake jumpscare 3.3 s; castle thunder 3.9 s; creepy evil laughter 4.6 s; So Many Screams 5.7 s; spooky ghost uuuh 6.1 s; suspenseful violin 7.4 s; Introductions Igor 9.5 s; distant vibrating 10.6 s; Don't Leave Now 11.8 s; Something To Show You 12.1 s; creepy piano 12.9 s; Introductions One Good Eye 13.8 s; Introductions Good Evening 16.1 s. Everything else is 33-277 s (ambiences and the numbered 04-12 tracks), which will time out, except through the jaw-sync path on jaw-enabled characters (then the jaw animates to it).
- sayThis cache: **none** (see 2.3). Voices: `data/character-N/ai-config/tts-config.json`, all `eleven_v3` with `speed` values 0.75-1.05 that the code says v3 does not honor. Recorded `quota_exceeded` failures (credits exhausted) appear in analytics on 2026-08-19 and 2026-09-26.

---

## 9. Doc drift and items not verified

- CLAUDE.md:99 says `GET /api/parts` returns a raw array; [live] it returns `{success, parts}`. CLAUDE.md:104 and `docs/api/api-documentation.md:83` document the `{sceneId}` start-config shape that the server rejects. `CHARACTER-CONFIG-LOCKS.md` lists the wrong locks and says the app answers 423 for scene writes.
- Not read: Mina's live data (node unreachable); peers' crontabs and their `physical-faults`/`character-locks` copies; Goblin 1 and 4 file lists; the full ElevenLabs agent timeout path; `routes/api/orchestrationRoutes.js` beyond the routes listed; the `scripts/halloween-judges`, `fleet-audio`, `night-memory` and `bench` directories for scene-id use (grep over `scripts/` for `scenes/api`, `scene_id`, `sceneId` found only `start-all-loops.sh`).
- [inferred, not executed]: that a 30-second SIGKILL of the python wrapper leaves its `mpg123` child playing to the end of the file; that the Studio's `GET /templates`, `/export` and `/analytics` routes are unreachable; that the dashboard Loop All fails with HTTP 400 in the browser (the validation itself was run).