# MonsterBox v11 Uptime & Performance Hardening — Findings (Orlok node, 2026-08-21)

Read-only audit. Every claim below is backed by a tool result from this session.
Baseline at audit time: service active since 00:05:28, NRestarts=0, load ~0.35,
1.7/7.6GB RAM, 17/115GB disk, mjpg_streamer up 45+ min at 0.1% CPU.

## SHOW-STOPPERS

### 1. "Apply device" button destroys the webcam self-healing launcher
- controllers/webcamController.js:556-575 — `applyDeviceToService` writes
  /etc/systemd/system/mjpg-streamer.service.d/override.conf containing
  `ExecStart=` + a full mjpg_streamer command with a BARE devicePath
  (falls back to `/dev/video0`), then daemon-reloads and restarts the unit.
- scripts/mjpg-launcher.sh exists precisely because a USB re-enumeration moved
  the camera to /dev/video1 and crash-looped the unit 42+ times (comment in the
  script, 2026-08-17). The override REPLACES that launcher entirely.
- Also inconsistent geometry: apply path defaults q85 (line 554), launcher q60.
- Failure scenario: operator clicks Apply in the webcam setup page once; weeks
  later a USB blip re-enumerates the camera mid-show; mjpg-streamer crash-loops
  against a dead /dev/videoN and the monitoring feed is gone until a human
  edits systemd files.
- Fix: make applyDeviceToService write /etc/default/monsterbox-cam
  (MB_CAM_DEV/MB_CAM_RES/MB_CAM_FPS/MB_CAM_Q — the launcher already sources it,
  launcher lines 16-24) and restart the unit; never emit ExecStart=. Verified
  no override.conf exists on Orlok today (`systemctl cat mjpg-streamer` shows
  only 10-priority.conf), so fixing the writer now prevents the regression.

### 2. Head-tracking servo claim leaks/blocks — head can freeze for the night
Two verified defects in controllers/motionTrackingController.js:
- a) Crash leak: `tracker.on('exit')` (lines 424-428) only deletes
  activeTrackers/trackingStatus — it does NOT releaseServo. The release was
  added only to stopMotionTrackingInternal (lines 347-352), whose own comment
  describes the exact failure: "with the tracker dead nothing can drive the
  servo OR release the claim... the pan servo was frozen out of all
  idle/ambient motion... until head tracking was explicitly disabled or the
  server restarted." A python tracker crash (camera unplug, OpenCV error,
  OOM) reproduces it because only the exit handler runs.
- b) Claims while refusing to drive: maybeDriveHead claims the pan servo
  (lines 663-670) before the calibrated-window guardrail check; with no usable
  window it warns "refusing to drive it until it is calibrated" (line 591 —
  610 occurrences in /var/log/monsterbox.err) while holding the pri-80 claim.
  Log evidence of the blockage: 1,828 `DENIED claim on servo 15 by "idle-loop"`
  + 1,826 `[IdleLoop] All servos preempted ... pausing` lines in monsterbox.log.
  Result on show night: head neither tracks nor does idle motion — a statue —
  and .log reads healthy (the refusal is only in .err).
- Fix: releaseServo in the tracker 'exit' handler; check guardrails (or at
  least cached null-guardrails) before claiming.

## MAJOR

### 3. Video resolution has no single source of truth (Aaron's consistency ask)
Four independent geometry declarations disagree:
- scripts/mjpg-launcher.sh: 640x480@15 q60 (operator's 2026-08-17 spec,
  git-tracked, actually running: ps shows mjpg_streamer `-r 640x480 -f 15 -q 60`).
- data/models/webcam_models.json `arducam-b0205` defaults: 1920x1080@30 q90 —
  Orlok's camera IS this model, so the UI advertises 1080p30 while the stream
  is VGA15.
- controllers/webcamController.js:552-554: part.config or 640x480@15 **q85**.
- data/character-5/parts.json:33-34: webcam baked at 1920x1080@30.
- goblin/goblin-pi.js:222: ffplay `-vf scale=1920:1080` — upscales every video
  on a Pi3B (software scale per frame, the weakest board in the fleet).
Measured cost of the current canonical path: 3 jiffies over a 5 s actively
streamed window = ~0.6% of one core at VGA15 (native MJPEG passthrough).
1080p30 q90 would multiply USB bandwidth ~9x for a phone-viewed stream with no
operational benefit.
RECOMMENDATION (canonical): 640x480@15 q60, single source of truth =
scripts/mjpg-launcher.sh defaults (in git, reaches all six characters via
`npm run deploy:all`, including the four offline nodes on their next deploy),
per-node override only via /etc/default/monsterbox-cam. Align to it in-code:
webcam_models.json arducam defaults -> 640x480/15/60; webcamController apply
path -> writes /etc/default/monsterbox-cam (see finding 1) with q60 default;
character-5 parts.json webcam config -> 640x480/15; goblin-pi.js -> drop the
scale filter (ffplay renders native; fullscreen scaling is free in the sink).

### 4. performance-history.json: ~427 MB/day of SD writes, non-atomic
- services/systemService.js:120-142 `recordPerformanceSnapshot` reads the whole
  file, appends, rewrites the WHOLE file with plain fs.writeFile; server.js:885
  schedules it every 300,000 ms.
- Measured: data/performance-history.json = 1,483,408 bytes now, retention 30
  days (still growing). 1.48 MB x 288 rewrites/day ≈ 427 MB/day today, rising
  with the retention window — this single path out-writes all logging combined
  and is the largest SD-wear source found. Non-atomic too (power cut mid-write
  truncates it; it is only perf data, but the read path returns [] silently).
- Fix: append-mode NDJSON with periodic compaction, or write via
  services/atomicStore.js and cut retention/cadence; or keep history in RAM and
  flush hourly.

### 5. Wedged-but-alive process is unrecoverable without a human
- server.js:74-80 swallows ALL uncaughtException and unhandledRejection
  (log-and-continue by design), so the process never crash-exits.
- /etc/systemd/system/monsterbox.service.d/10-priority.conf silently downgrades
  the base unit's Restart=always to Restart=on-failure (systemctl show:
  Restart=on-failure), and no WatchdogSec exists in any drop-in (grep: 0 hits).
- Failure scenario: a swallowed exception corrupts state or blocks the event
  loop at hour nine; the process stays "active (running)", systemd never
  restarts it, health endpoints time out, show is dead until someone SSHes in.
- Fix: add WatchdogSec + sd_notify keepalive (or a systemd timer that curls
  /health and `systemctl restart` on failure), and decide Restart= once —
  on-failure is fine only WITH a watchdog.

### 6. Power-loss-unsafe JSON writers for operator-critical files
services/atomicStore.js (temp+rename) exists and IS used by parts.json,
poses.json, scenes.json, app-config, jaw config — good. Still raw
`fs.writeFile` (torn file on power cut — Mina has already had hard power-loss
events):
- services/characterService.js:136 — characters.json, the fleet registry.
- services/aiConfigStore.js:36 — the tts-config file class (also the file class
  with the live "clobber" bug; a torn write would present as the same symptom).
- services/characterService.js:181,193 — audio config, microphones.json.
- services/nodeDiscoveryService.js:131, goblinManagerService.js:82,
  goblinPlaylistService.js:48, sceneAnalyticsService.js:195 (lower value).
Fix: route all of these through writeJsonAtomic.

## MINOR

### 7. Per-servo-move logging is 53% of the log and continuous SD writes
- 41,097 of 77,273 lines in the current /var/log/monsterbox.log are the trio
  logged on EVERY servo command (13,699 each): services/hardwareService/index.js:696
  ("🦷 Servo route: ...") plus the two moveToAngle lines. PriorityManager
  churn adds ~5,700 more. Idle loop + head tracking emit these all night.
- Bounded by logrotate (10M x5) but it is steady small-block SD wear and buries
  real failures. Fix: demote per-move logs behind MB_DEBUG_SERVO.

### 8. /tmp is on the SD card and crontab backups accumulate forever
- findmnt: no tmpfs on /tmp (root ext4). services/scheduleService.js:99 writes
  monsterbox-crontab-<ts>.bak on every crontab change, never deletes: 140 files
  present now, plus /tmp/dl.mp3. Small but unbounded.
- Fix: keep last N backups; better, add tmpfs /tmp (8GB RAM, 1.7 used).

### 9. Motion-tracker churn: 144 spawn/kill cycles, ~2.4s CPU each
- 143 "exited with code 0" + 1 "code null" in the current log window; measured
  `python3 -c "import cv2"` = 2.4 s CPU on this Pi, paid on every restart, plus
  background-subtractor relearn. Cycles correlate with lurk sleep/wake (115
  sleep / 113 wake lines). Not fatal; if wake-to-tracking latency matters,
  keep the tracker warm and pause frame processing instead of killing it.

### 10. express.json/urlencoded limit '50mb' (server.js:242-243)
- A single LAN POST of 50 MB JSON is buffered and parsed on the event loop of a
  4-core Pi mid-show. Reduce to 1-5 MB; audio uploads use multipart paths.

### 11. ExecStart=/usr/bin/npm start wastes ~60 MB and adds a signal layer
- ps: npm wrapper PID 27346 RSS 60,176 KB alive next to node server.js
  (124 MB). Exec node directly in the unit; one less signal-forwarding hop for
  gracefulShutdown (server.js:958+ handles SIGTERM correctly).

### 12. Goblin reconnect loop runs forever against storage nodes
- services/goblinManagerService.js:536+ heartbeat + 30 s reconnect attempts;
  605 throttled "Attempting to reconnect 3 offline goblins" lines. Offline is
  EXPECTED for PumpkinHead/Groundbreaker — add an expectedOffline flag to stop
  the network attempts and log churn.

## VERIFIED HEALTHY (no action, worth recording)
- PID guard (services/resource/singleInstance.js) handles pre-boot stale files
  via mtime-vs-boot-time, PID reuse via /proc/<pid>/cmdline check, and the
  vanished-process race. Correct in every case examined.
- journald caps ARE live (SystemMaxUse=64M, usage 66.9M) and logrotate.d/
  monsterbox exists (10M x5, copytruncate). The memory note that these are
  "not in git" is STALE: install.sh:489-496 now provisions both. Reimage-safe.
- Outbound fleet HTTP: orchestrationService uses AbortController + timeouts on
  every audited call (lines 100-143, 303-612).
- mpg123/pw-play spawns clean their map entries on exit
  (serverPlaybackService.js:295-299, 392-396); MJPEG proxy tears down upstream
  on req 'close' (routes/api/orchestrationRoutes.js:686).
- hardwareService/exec.js: 30 s timeout + SIGKILL, stdout/stderr drained.
- mjpg-streamer unit: Restart=on-failure RestartSec=2, launcher resolves
  /dev/v4l/by-id at each start — self-healing as designed (while finding 1
  stays unfixed, one UI click removes it).

## NOT VERIFIED / OPEN
- Camera CPU at 1080p30 was not measured (would require changing the live stream).
- goblin-pi.js runs on offline Pi3B goblin nodes; behavior verified by code only.
- Whether any production path can deliver SIGHUP/exit-0 (which with
  Restart=on-failure leaves the service down) — no source found, low probability.
- Exact steady-state size of performance-history.json at 30-day retention
  (currently 1.48 MB and growing).
