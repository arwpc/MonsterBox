# Goblin video displays: read-only recon (MonsterBox repo plus live curl)

Observed 2026-10-09 20:35 to 20:50 CDT (-05:00), repo HEAD `86c9bb0e` (v10.6.0), working tree dirty.

**The scratchpad file was NOT written.** This role is read-only (no Write tool, file creation prohibited). Please persist this message to `/tmp/claude-1000/-home-remote-MonsterBox/26c4c0b3-31c7-4df4-abb0-d653712a3390/scratchpad/recon-goblins.md` yourself.

**Everything I did to the Goblins was a plain GET.**
- Calls: `/health`, `/playback-status`, `/queue`, `/media`.
- ICMP ping to .40 and .244, local `ip neigh`, local `getent`.
- No POST, no ssh, no restarts.
- `data/goblins.json` mtime is unchanged (2026-10-09 16:24:51).
- `GET /media` can refresh the device's 5-minute listing cache (`goblin/server.js:309-322`). That is a cheap directory stat, but not strictly zero-cost.

Tags used below:
- `[obs]` observed live.
- `[read]` read in code or data.
- `[doc]` stated in repo docs.
- `[mem]` stated only in the operator memory note `~/.claude/projects/-home-remote-MonsterBox/memory/goblin-fleet-truth.md` (outside the repo).
- `[inf]` my inference, not proven.

---

## 0. Headline findings

1. **No Goblin is showing video right now.** Two answer HTTP and two are off the network.
   - Goblin 3 (.14): up, one-clip queue, `playing:false`, `mpvRunning:false`.
   - Goblin 2 (.106): up, EMPTY queue, nothing playing.
   - Goblin 1 (.40) and Goblin 4 (.244): do not answer ARP, ping or TCP.
2. **Goblin 1 is the operator's "most noticeable" display and it is the unit that is physically unreachable.** Its last registry `lastSeen` is 2026-09-26T22:14Z. `[doc]` KNOWN-BUGS:2110-2123 and 2161-2167 record a stalled-boot history, an under-voltage flag, and a re-image on 09-26. It needs hands.
3. **Orlok's log shows a fleet Emergency Stop before 20:01 CDT today.** `/var/log/monsterbox.log:112171` reads `📡 Broadcasting to all Goblins: stop-video`. Nothing in the repo auto-resumes Goblin loops afterwards. The all-clear is a manual `POST /video-library/api/goblins/:id/resume`. This matches Goblin 3's state (queue intact, stopped) `[inf]`.
4. **There is no usable Goblin playlist anywhere.**
   - `data/goblin-playlists.json` holds 69 test artefacts, all with `goblinId:"goblin-three"`, an id no registered Goblin has.
   - `GET /goblin-management/api/playlists` returns 69. `?goblinId=goblin-192-168-8-14` returns 0 `[obs]`.
   - No page in the UI calls the playlist API (grep).
   - `goblin/playlists/*.json` are unused samples naming files that exist on no device.
5. **The registry holds no display hints.** `location` is `""` for all four. `description` is only `"TV label N · hostname goblinN · IP"`. The operator's placement and orientation notes are recorded nowhere in the repo. Not found.
6. **The show library is 72 clips, identical on .14 and .106.** The live `/media` names and bytes equal the 2026-09-25 gold manifest. All clips are landscape and none is portrait. 24 carry audio `[doc]`. Audio is OFF by default on the devices.
7. **The MonsterBox video library is not the show library.** It holds 5 files, 2 of them 4K, 1 of them a corrupt 16-byte fixture, and records no durations.
8. **Scenes cast by `goblinId` (an IP-derived id) plus `videoId` (a device filename).** There is no name-to-id resolver in the code.
   - Three goblin-video steps exist, all in Orlok scenes (107, 113, 114).
   - The scene 113 cast to Goblin 3 failed its device proof on 2026-10-08 (`/var/log/monsterbox.err:110722`).
9. **The device queue code has a double-mpv race `[inf]`, consistent with the documented respawn storm `[doc]`.** Details in section 7.

---

## 1. Live state `[obs]`

### Per-unit results

| Unit | `/health` | `/playback-status` | `/queue` | `/media` |
|---|---|---|---|---|
| **.14 Goblin 3** | 20:38:17, 200 in 0.115 s, `ok:true`, `uptime 368187.757` s | 20:38:37: `playing:false, currentVideo:null, mpvRunning:false`, `queue.playing:false` | 20:38:38: one entry `Hugeskelly.mp4` (id 1791504339919, addedAt 2026-10-09T00:05:39.919Z, **playCount 42680**), `currentIndex 0`, `loopMode:"queue"`, `playing:false` | 20:38:52: 72 files, 622,179,984 B, 1.31 s |
| **.106 Goblin 2** | 20:38:17, 200 in 0.22 s, `uptime 24592.87` s | 20:38:37: `playing:false`, `mpvRunning:false` | 20:38:38: `videos:[]`, `currentIndex 0`, `loopMode:"none"`, `playing:false` (default empty queue) | 20:38:54: 72 files, same bytes, 2.66 s |
| **.40 Goblin 1** | 20:38:17 curl exit 7 after 3.06 s ("Couldn't connect") | 20:45:31 exit 7 | 20:45:34 exit 7 | 20:45:37 exit 7 |
| **.244 Goblin 4** | 20:38:17 curl exit 7 after 3.08 s | 20:45:40 exit 7 | 20:45:43 exit 7 | 20:45:46 exit 7 |

### Supporting observations

- **Second sample at 20:45:49 and 20:45:50.** Both online Goblins are unchanged. Uptimes advanced by wall-clock (.14: 368187.8 to 368640.2, .106: 24592.9 to 25045.7), so there was no restart. Hugeskelly `playCount` stayed at 42680, so nothing is respawning right now.
- **Service start times derived from uptime.** .14's `goblin.service` started about 2026-10-05 14:20 CDT. .106's started about 2026-10-09 13:48 CDT.
- **.40 and .244 are off the network.**
  - `ip neigh` shows `FAILED` for both.
  - Ping lost 2/2 at 20:39:05 (.40) and 20:39:08 (.244).
  - `goblin1.local` and `goblin4.local` give no mDNS answer. `goblin2.local` resolves to .106 and `goblin3.local` to .14.
  - Orlok's own Wi-Fi is fine: the router (.1), .14 and .106 are all REACHABLE.
- **Board `GET https://localhost:3000/video-library/api/goblins/board` at 20:39:22.** HTTP 200 in 0.64 s, `success:true, online:2`.
  - Goblin 3 and Goblin 2: `online:true, playback.playing:false, mpvRunning:false`, 72 file entries each.
  - Goblin 4 and Goblin 1: `status:"offline"`, `online:false`, `error:"Goblin N is not online"`.
  - The board can persist a registry status transition to `data/goblins.json` (`pingGoblin` saves on offline→online, `goblinManagerService.js:864-867`). It did not, because nothing transitioned.
- **`GET /goblin-management/api/goblins` at 20:49:08.** Four goblins, online 2. In-memory `lastSeen` for the online pair is 2026-10-10T01:47:20Z.
- **Orlok context.**
  - `GET /conversation/api/lurk-scenes` at 20:48:10: lurk rotation is running with scenes [112, 113, 114, 115, 116, 111], about every 240 s plus 0-25%, quiet hours 23:00-08:00. The last result was `played:false, reason:"muted"` at 20:48:02.
  - `data/speaker-state.json` has `speakerMuted:true` (updated 19:52:12 CDT).
  - Scenes 113 and 114 are the ones that cast to Goblins 3 and 2.
- **Emergency-stop evidence `[inf]`.** The log lines near `monsterbox.log:112171` carry no timestamps. The stop precedes a chat session whose id decodes to 20:01:16 CDT. `emergencyStop()` with no node subset calls `broadcastToGoblins('stop-video')` (`orchestrationService.js:834-845`), which calls `stopGoblin()` and so device `/stop-all`. That sets `queue.playing=false` (persisted).
- **The Goblin 3 playCount is physically impossible for a healthy loop `[inf]`.**
  - 42,680 spawns in at most 25.5 h since the entry was created is one spawn per 2.2 s or faster. Hugeskelly is a 6.03 s clip.
  - A healthy `--loop` counts 1. Even respawn-per-clip would cap near 15,300.
  - So mpv was repeatedly dying a couple of seconds after spawn, the documented "MPV exited with code 2" storm (KNOWN-BUGS:2010-2013, 2199-2204).
  - Possible causes, unproven: the TV off or on another input (an HDMI connector that is not connected makes mpv exit at spawn, as documented for Goblin 4), or a stale `queueManager` without the one-clip fix.
- **`/var/log/monsterbox.err:110722`**, from 2026-10-08 about 20:45-21:03 CDT: `Background step 6 (goblin-video) failed: … Goblin accepted "Skullfire.mp4" but mpv is showing "Hugeskelly.mp4" — the file is probably unplayable`. That is scene 113's cast to Goblin 3.

---

## 2. Registry `data/goblins.json` (98 lines)

| id (line) | name | endpoint | registry status / lastSeen | platform | description | settings |
|---|---|---|---|---|---|---|
| `goblin-192-168-8-40` (:3) | Goblin 1 | http://192.168.8.40:3001 | offline / 2026-09-26T22:14:20.850Z | unknown | TV label 1 · hostname goblin1 · 192.168.8.40 | audio/video true, volume 80, autoLock false |
| `goblin-192-168-8-106` (:27) | Goblin 2 | …106:3001 | online / 2026-10-09T21:24:50.507Z | unknown | TV label 2 · hostname goblin2 · … | same |
| `goblin-192-168-8-14` (:51) | Goblin 3 | …14:3001 | online / 2026-10-09T21:24:51.235Z | unknown | TV label 3 · hostname goblin3 · … | same |
| `goblin-192-168-8-244` (:75) | Goblin 4 | …244:3001 | offline / 2026-10-08T00:47:27.669Z | raspberry-pi-3b | TV label 4 · hostname goblin4 · … · Pi 3B Rev 1.2 | volume 100 |

- All four have `capabilities:["video","audio"]`, `version "1.0.0"`, `location ""`, `lockedBy null`, and no `expectedOffline` flag.
- The file is tracked in git and dirty only from runtime churn. HEAD has Goblin 4 `online`.
- **Names equal TV labels equal hostnames.** The operator set this on 2026-09-26 12:15, after two wrong inferred mappings. Repo guidance is "ask the operator, identify a unit by hostname" (KNOWN-BUGS:2124-2129). Confirm the position mapping with him before assigning content by position.
- **The registry is an in-memory Map loaded once.** `loadGoblins()` forces every Goblin to `status:'offline'` at load (`goblinManagerService.js:147-173`, `:155`). A hand edit of the file needs a MonsterBox restart `[mem]`.
- **Stale phantom list.** `config/animatronics.json:74` lists chestwound .160 and goblin2 .161. Orchestration now ignores it (`orchestrationService.js:194-204`).
- **IDs embed the IP.** Re-addressing a Goblin changes its id and breaks scenes that name it.
- **Writers of the registry.** `registerGoblin` (:186), `unregisterGoblin`, `updateGoblinSettings`, lock/unlock, the 30 s monitor, and `pingGoblin` on a transition. All use `writeJsonAtomic`.

---

## 3. Code map

### 3.1 Device app (`goblin/`), what the Goblins run

**Deployed versus repo**
- The deployed `server.js` equals the repo `goblin/server.js` (byte-identical to the gold snapshot of .14, which I diffed).
- `queueManager.js` differs by the post-snapshot one-clip-loop fix (`queueManager.js:121-126`). `mpvController.js` differs by the post-snapshot audio block (`:21-51`).
- Which version each live device runs today is not determinable without ssh.
- Everything in `goblin/server.js` is plain HTTP with no auth and CORS `*` (`:110-118`).
- The repo `goblin/systemd/goblin.service` is **not** what runs. It points at an absent `src/server.js` (`:26`), has `WatchdogSec=60` (`:49`) and `MONSTERBOX_URL` pointing at Mina (`:16`).
- The deployed unit is the "goblin-gold" unit, kept only in `backups/goblins-gold-2026-09-25/<goblin>/os/systemd/goblin.service`.
  - `ExecStartPre=+/usr/local/bin/goblin-setup.sh` (:21)
  - `ExecStart=/usr/bin/node /home/remote/goblin/server.js` (:22)
  - `ExecStartPost=/usr/local/bin/goblin-autostart.sh` (:23)
  - `Environment=GOBLIN_DRM_CONNECTOR=HDMI-A-1` (:14)
  - `Restart=always RestartSec=5`, real-time scheduling
- Same unit on all three, confirmed by diff.
- **The unit's `Environment=GOBLIN_MPV_EXTRA_ARGS=…` line (:20) is unquoted, so systemd keeps only its first token (`--no-config`).** The gold journals log `Invalid environment assignment, ignoring: --no-audio`, `--no-osc` and the rest.
  - So the `--no-audio` and tuning flags in that line are not in effect.
  - Audio is governed only by `GOBLIN_AUDIO`.
- Goblin 4 additionally has a drop-in `goblin.service.d/display-720p.conf` with `GOBLIN_DRM_MODE=1280x720` (KNOWN-BUGS:2014-2018).

**HTTP API on :3001** (`goblin/server.js`; port line 10)

| Endpoint | Request | Response |
|---|---|---|
| `GET /health` (:136) | – | `{ok:true, uptime, status:{videos[], currentIndex, currentVideo\|null, loopMode, playing, mpvRunning}}`. Here `mpvRunning = !!mpv.process` (:133). |
| `GET /playback-status` (:383), `GET /api/status` (:399) | – | `{success, playing:!!mpv.currentVideo, currentVideo:<string\|null>, mpvRunning:!!mpv.process, queue:{videos,currentIndex,loopMode,playing}}`. `currentVideo` is a FULL PATH when the queue started it, e.g. `/home/remote/media/video/X.mp4`. It is the name as given when started by `/play-video` or play-immediate. |
| `GET /queue` (:179) | – | `{success, queue:{videos,currentIndex,loopMode,playing}, currentVideo:<queue entry object>, mpvRunning}`. Entries are `{id:Date.now() string, filename, addedAt, playCount}`. |
| `GET /media` (:309) | – | `{success, videos:[{filename, path, size, duration:0, resolution:'1280x720', fps:30}]}`. Recursive scan of `/home/remote/media/video` for `.mp4/.mov/.avi/.mkv` (regex :73). Cached 5 min. **duration, resolution and fps are hard-coded placeholders** (:78-84), not probed. |
| `GET /api/videos/scan` (:325) | – | Forced rescan: `{success, videos, count}`. |
| `POST /api/video/play-immediate` (:335) | `{filename, returnToQueue=false}` | `{success, playing, interrupted, willReturnToQueue}`. `returnToQueue` only takes effect if `queue.playing` was true at call time (`wasPlaying`, :345-369). It sets `queue.playing=false`, plays once, and a one-shot `mpv.onEnd` sets `playing=true` and `playNext()` at the same `currentIndex`. The success flag returns right after spawn, before mpv can fail. |
| `POST /play-video` (:141) | `{filename, loop?}` or query `?filename=&loop=true` | `{success, nowPlaying}`. Bypasses the queue, with no file-exists check. `loop:true` runs mpv `--loop` forever. |
| `POST /stop-all` (:173) | – | `{success}`. Calls `mpv.stop()` then `queue.stop()`. |
| `POST /queue/add` (:194) | `{filename, position?}` or query | `{success, video}`. `position` `'next'` inserts after the current entry; any other value appends. |
| `POST /queue/enqueue` (:216) | `{filename}` | Alias of add-at-end. |
| `POST /queue/enqueue-priority` (:230) | `{filename}` | Calls `add(…,'start')`. `'start'` is unrecognised, so it appends (documented bug, KNOWN-BUGS:2203). Then, if the queue is not playing, it starts with `loopMode:'none'`. Returns `{success, video, playing:true}`. |
| `DELETE /queue/remove/:id` (:251) | – | `{success, removed}` |
| `POST /queue/clear` (:256) | – | Stops (kills mpv) and empties: `{success}` |
| `POST /queue/start` (:261) | `{loopMode?}` body or query, default `'none'`; valid `none\|single\|queue` | `{success, status}`. Returns HTTP 500 `{error:'Queue is empty'}` if empty (`queueManager.js:97`). |
| `POST /queue/stop` (:277), `/queue/skip` (:282) | – | `{success}`. Skip is a no-op if not playing. |
| `POST /queue/pause` (:287) | – | Same as stop: `{success, paused:true}` |
| `POST /queue/resume` (:297) | – | Starts with the persisted loopMode: `{success, resumed:true}` |

**Not served by the device** (not found in `server.js`):
- No thumbnail, loop or resume endpoint. "Loop" is `/queue/start {loopMode}` or `/play-video {loop}`. Resume is `/queue/resume` or `/queue/start`.
- No `/info`, `/status`, `/settings`, `/upload-video`, `/play-audio` or `/audio/*`. `goblin/README.md` is stale on this: it describes a Docker, upload and WebSocket design that was never built (KNOWN-BUGS:2182-2184).
- Thumbnails are made by MonsterBox over ssh with ffmpeg on the device.
- There is no volume control, and no temperature or throttle readout over HTTP.

**Persistence and boot**
- Queue file: `/home/remote/goblin/queue.json`, shape `{videos[], currentIndex, loopMode, playing}` (`queueManager.js:15-18`).
- Saves are debounced 75 ms and non-atomic (`:45-55`). A parse failure at load silently writes the default empty queue (`:35-43`).
- Boot: `goblin-autostart.sh:5-18` (identical in repo and gold) sleeps 8 s, then retries up to 10 times (2 s apart) a `POST /queue/start {"loopMode":"queue"}`, until `/health` contains `"mpvRunning":true`. It then exits 0 and never retries.
- **An empty `queue.json` therefore means a blank screen on a "healthy" unit.** This is documented for Goblin 2 (KNOWN-BUGS:2174-2176), observed now, and follows from `queueManager.js:97`.
- Loop semantics (`queueManager.js:121-143`):
  - `single`, or `queue` with exactly 1 video, runs one mpv `--loop` (the 2026-09-26 fix).
  - A multi-clip `queue` respawns mpv per clip, with a black flash per respawn. `none` stops at the end.
  - Values `sequential` and `continuous`, used by the docs and the `goblin/playlists` samples, are not understood by the device.

**mpv** (`mpvController.js:53-67`, `play` 101-170)
- Args: `--vo=drm --hwdec=v4l2m2m-copy --fs`, audio args, `--video-sync=display-resample --interpolation=no --no-osc --no-osd-bar`, env extras, `--loop` if looping, `--drm-connector=$GOBLIN_DRM_CONNECTOR`, `--drm-mode=$GOBLIN_DRM_MODE` (:127-132).
- Audio: `--no-audio` unless `GOBLIN_AUDIO=on` (:48-51). When on: `--audio=auto --ao=alsa --audio-device=alsa/sysdefault:CARD=<hdmi card from /proc/asound/cards>`.
- `stop()` is SIGTERM only, with a 1 s wait (:172-209). The code comments warn that SIGKILL and killing a dead process caused kernel panics.
- No rotation or portrait support: grep for `video-rotate`, `display_rotate` and `transpose` finds nothing in `goblin/`, `scripts/`, `backups/` or `docs/`.

**Other device-side files**
- `goblin/goblin-pi.js` is an unused legacy launcher (`chestwound-window-1`).
- `goblin/goblin-setup.sh:31-32` has live `pkill -f mpv` and `pkill -f vlc`. The deployed copies comment those two lines out. Never copy the repo's version to a Goblin.
- `goblin-setup.sh:30` is `lsof -ti:3001 | xargs -r kill -9` (SIGKILL of the old server at each service start).

### 3.2 MonsterBox services

| File | Role and key lines |
|---|---|
| `services/goblinManagerService.js` | Registry plus all device calls. |
| | `sanitizeGoblinFilename` :50-55 (basename, strip control chars, reject dotfiles, must end `.mp4/.mov/.avi/.mkv`, regex :30). |
| | `rsyncToGoblin` :62-82: `rsync -t -s --partial --inplace --timeout=90 --stats -e "sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8"` to `remote@host:/home/remote/media/video/<name>`. |
| | `grabFrameOnGoblin` :88-114 (ssh + ffmpeg on the device). |
| | `_onlineGoblin` :509-520 (pings before refusing). |
| | `listGoblinVideos` :537; `getGoblinThumbnail` :559-607. |
| | `getGoblinPlayback` :613-630 (normalises `currentVideo` to basename). |
| | `_isOnGoblin` :632-640 (`/media`, then a forced `/api/videos/scan` on a miss). |
| | `deployVideoToGoblin` :656-705. |
| | `playVideoOnGoblin` :713-735. |
| | `loopVideoOnGoblin` :742-772: `/stop-all`, `/queue/clear`, `/queue/add`, `/queue/start {loopMode:'queue'}`, then `_confirmPlaying` and requires `queue.loopMode==='queue'`. This replaces the Goblin's whole queue with one clip. |
| | `stopGoblin` :775-793. |
| | `resumeGoblinQueue` :802-828 (starts the Goblin's own queue in its carried loopMode; fails on an empty queue). |
| | `_confirmPlaying` :830-844 (sleep 1.5 s, then `mpvRunning && currentVideo===filename`). |
| | `pingGoblin` :846-875; `startHeartbeatMonitor` :930-980. |
| `services/goblinPlaylistService.js` | Playlist CRUD plus `deployPlaylist` (:200-283). See section 4. |
| `services/goblinVideoService.js` | Thin axios wrapper. `scanGoblinVideos` :20-61 (`/api/videos/scan`), `playVideoImmediate` :142-173 (play-immediate, **no proof or presence check**), `getPlaybackStatus` :180-206 (`/api/status`), `stopPlayback` :213-239. |
| `services/goblinDeploymentService.js` | "Facehugger" SSH deploy (`deployToHost` :34-115): stops `monsterbox-goblin`, copies `goblin/src` and `server.js`, installs a NEW unit named `monsterbox-goblin` (:237-268, service name :27). **Never aim it at an existing Goblin.** It would create a second server on :3001, the same name as the crash-looping debris unit (KNOWN-BUGS:2185-2193). |
| `services/goblinService.js` | Dead legacy VLC and WebSocket design in CommonJS inside an ESM project. Nothing imports it (grep). |
| `services/videoLibraryService.js` | MonsterBox-side library, `data/video-library/` (:78-92). The `ffprobe` and `ffprobe-static` npm modules are not installed, so `extractVideoMetadata` returns `duration:0, resolution:'unknown'` for every upload (:322-347). `supportedFormats` includes `.wmv/.flv/.webm/.m4v` (:85), which `sanitizeGoblinFilename` rejects. |
| `services/orchestrationService.js` | `goblins` getter over the registry :516-532. `broadcastToGoblins` :537-572 (optional `params.ids`). `executeOnGoblin` :582-614 (commands: `reboot`, `play-video`, `stop`/`stop-video`, `health-check`). `rebootDevice` :288-301 (ssh `sudo reboot`). `emergencyStop` :777-846 (also broadcasts `stop-video` to Goblins when run fleet-wide). |

### 3.3 Routes

Mounts: `server.js:595` `/video-library`, `:596` `/goblin-management`, `:682` `/api/orchestration`. `server.js:693-722` add aliases `POST /api/goblins/register`, `POST /api/goblins/:id/heartbeat` and `GET /api/goblins`. No authentication anywhere (`docs/api/routes.md:4`).

**`routes/videoLibrary.js`** (the Video Control page and API)
- Read-only and safe:
  - `GET /api/goblins/board[?playbackOnly=1]` (:518)
  - `GET /api/goblins/:id/playback` (:469)
  - `GET /api/goblins/:id/videos` (:455)
  - `GET /api/library`, `GET /api/videos`, `GET /api/video/:id` and its `/stream`, `/download`, `/thumbnail`, `GET /api/stats` (:79-:642)
- Caution:
  - `GET /api/goblins/:id/videos?rescan=1` forces a device directory rescan.
  - `GET /api/goblins/:id/thumbnail?filename=` is served from the cache `data/video-library/goblin-thumbnails/`. For an uncached filename it SSHes the Goblin. All 72 show clips are cached locally (computed: 72/72, 18 of those are near-black frames).
- State-changing (never call in this recon):
  - `POST /api/goblins/control {action:'play'|'loop'|'stop'|'resume', filename?, goblinIds:[…]}` (:555)
  - `POST /api/goblins/:id/play {filename, mode:'once'|'loop'}` (:483)
  - `POST /api/goblins/:id/stop` (:502)
  - `POST /api/goblins/:id/resume` (:610)
  - `POST /api/deploy {videoId, goblinId}` (:131)
  - `POST /api/video/:id/deploy` (:356)
  - `POST /api/video/:id/play-on-goblin {goblinId, mode, deploy}` (:376)
  - `POST /api/upload`, and `PUT`/`DELETE /api/video/:id`

**`routes/goblinManagement.js`** (the older page)
- Read-only:
  - `GET /api/goblins` (:109)
  - `GET /api/goblin/:id` (:133)
  - `GET /api/goblin/:id/status` (:311, device `/health` live)
  - `GET /api/stats` (:377)
  - `GET /api/playlists[?goblinId=&search=]` (:562)
  - `GET /api/playlists/:id` (:580)
  - `GET /api/goblins/:id/videos` (:488, cached)
  - `GET /api/videos/all` (:506)
  - `GET /api/goblins/:id/status` (:547)
- Changes the registry or playlist file only: `POST /api/register` (:28), `DELETE /api/goblin/:id` (:91), `PUT /api/goblin/:id/settings` (:151), lock, unlock, heartbeat, and playlist POST/PUT/DELETE (:598, :616, :634).
- Touches a Goblin:
  - `POST /api/goblins/:id/scan-videos` (:457) and `POST /api/goblins/scan-all-videos` (:475) force device rescans.
  - `POST /api/goblin/:id/deploy-video` (:236) rsyncs over ssh.
  - `POST /api/goblin/:id/play-video` (:254) is device-proven.
  - `POST /api/goblins/:id/play-video` (:519) is unproven.
  - `POST /api/goblin/:id/stop-all` (:278).
  - `POST /api/playlists/:id/deploy` (:652).
- **Dangerous:**
  - `POST /api/broadcast` (:390) POSTs `${endpoint}/${command}` to every available Goblin, i.e. an arbitrary device route such as `queue/clear` or `stop-all`.
  - `POST /api/deploy-and-register` (:47) is the facehugger SSH deploy.

**`routes/api/orchestrationRoutes.js`**
- `POST /api/orchestration/broadcast/goblins {command, params}` (:126)
- `POST /api/orchestration/reboot/goblins` (:224). **With no `ids` it ssh-reboots EVERY Goblin.**
- `POST /api/orchestration/emergency-stop` stops all Goblins.

**Browser behaviour that destroys a loop.** The goblin-management queue modal's per-video "Play" (`public/js/goblin-management.js:1390-1440`) calls the Goblin directly and runs `/queue/stop`, `/queue/clear`, `/queue/enqueue-priority`, then `/queue/start` with no loopMode. The loop is replaced by one non-looping clip. If the queue was not playing, `enqueue-priority` already starts it, so two starts fire back to back. Use Video Control instead.

---

## 4. Playlists

**What one is.** A MonsterBox-side record in `data/goblin-playlists.json`, loaded at `goblinPlaylistService.js:15`. Shape `{id (uuid), name, description, goblinId (a registry id or "all"), videos:[{filename, order, duration}], loopMode, createdAt, updatedAt, lastDeployed}`. `createPlaylist` is at :62-94 and the default `loopMode` is `'queue'` (:64). It validates only that name, goblinId and a videos array are present. It does not check that the Goblin or the filenames exist.

**Three other "playlist-like" things are not the same:**
- The device queue `queue.json` (the real source of truth).
- `goblin/playlists/{Fire,Poltergeist,Spinster}.json` are unused samples (nothing reads them, grep). Their names such as `541_Fire_Idle_H.mp4` and `Poltergeist/PHA_…` exist on no device, and their loopModes `continuous`/`sequential` are not understood by the device.
- `routes/scenes/armed-mode.js` has an unrelated scene playlist.

**Assigned to a Goblin by deploy only.** The registry has no assignment field. `playlist.goblinId` is the intended target and `lastDeployed` is the only record. `POST /goblin-management/api/playlists/:id/deploy {goblinIds:[id,…]|'all', startImmediately:true}` runs `deployPlaylist` (:200-283). On the device it sends `/queue/clear`, then `/queue/add {filename}` per video, then `/queue/start {loopMode: playlist.loopMode}`. The device persists this into `queue.json`, so the next boot autostarts it. `GET /queue` is the only truth of what a Goblin holds.

**Known sharp edges in `deployPlaylist` `[read]`**
- It trusts the registry's stored `status` and does not ping (:232-237). It refuses for about 30 s after every MonsterBox restart, and for any Goblin flagged offline.
- There is no presence check against the device's `/media`. A missing file means mpv exit 2 and a respawn storm with no backoff (KNOWN-BUGS:2099-2109, 2199-2204).
- There is no proof of playing. `deployed:[id]` means only that the HTTP calls succeeded.
- `/queue/clear` takes the mpv kill path. An empty `videos` list would make `/queue/start` fail.

**Loop by default** is the combination of:
- `loopMode:'queue'` on the device.
- `goblin-autostart.sh` re-posting `{"loopMode":"queue"}` at boot.
- A non-empty `queue.json`.
- Nothing restores it after Emergency Stop.

**Existing data `[obs]`:** 69 playlists, all `goblin-three`, 47 `queue` and 22 `single`, names like "Test Playlist", "Deploy Test", created 2025-10-21 to 11-01, 13 with a non-null `lastDeployed`. 26 distinct filenames are referenced (mostly `307 Jb Hd.mp4`). KNOWN-BUGS:2194-2198 calls it test artefacts. The 2026-07-17 file is untouched by this session.

**Docs that overstate:** `docs/usage.md:93-97`, `README.md:954-958` and `docs/development/goblin-management.md:91-94, 252-324` describe Save, Load and Distribute playlist buttons. No such UI exists: grep of `views/` and `public/js/` finds no Goblin playlist references.

---

## 5. Video inventory

**On the Goblins** (the real show library). 72 clips plus 3 stray `.gcode` files on the 09-25 snapshots of .40 and .14.
- `[obs]` The live `/media` of .14 and .106 equals the gold manifest exactly (72 names, same sha1 of the sorted names, same total of 622,179,984 B). .40 and .244 are unreachable. .40 and .244 were provisioned from .14, so they should hold the same 72 `[doc]`, but I could not check.
- Source of truth for real metadata: `backups/goblins-gold-2026-09-25/goblin-192-168-8-14/videos.manifest.tsv` (name, bytes, sha256, ffprobe video stream). It records the video stream only, so no audio info.
- Total runtime is about 35.2 min.

| Family | n | Spec |
|---|---|---|
| `NNN Jb Hd.mp4` | 39 | all 1280x720 at 30 fps, 6.4-30 s, 779-14,165 kbps. Silent by content `[mem]`. |
| `Pha … Win H.mp4` | 18 | 1280x720 at 29.97 fps (one is 1280x646), 15-90 s, 21-1,360 kbps. Audio `[mem]`. |
| Singletons | 15 | see below |

The `NNN` clips are 307, 312, 403, 404, 407, 415, 487, 488, 490, 494, 497, 499, 541-560, 682-684, 687-689 and 694. The `Pha` set is Poltergeist x4, Siren x4, Spinster x4, Wraith x5, plus `Pha Buffer Black H` (a 15 s black clip at 21 kbps).

Singletons (resolution, fps, duration, kbps):
- Batattack: 960x540, 23.98, 10.0 s, 1186
- Bigskull: 1280x720, 29.97, 30.4 s, 814
- Firepumpkin: 960x540, 25, 30.0 s, 1051
- Floatinglady: 1280x720, 30, 12.1 s, 1095
- Greenskull: 1280x720, 29.97, 31.0 s, 1338
- Hugeskelly: 1280x720, 30, 6.0 s, 945
- Monstergoop: 1002x720, 24, 10.7 s, 2138
- Moon: 1280x720, 29.97, 30.8 s, 883
- Sauron: 640x360, 25, 58.9 s, 661
- Scary Face: 1280x720, 30, 9.9 s, 2838
- Skellycrawler: 1280x720, 30, 20.3 s, 908
- Skellyskrape: 1280x720, 23.98, 14.0 s, 1097
- Skullfire: 616x510, 24, 6.2 s, 473
- Skullfloor: 1280x710, 24, 30.0 s, 456
- Stumblingelectricsman: 560x540, 30, 32.5 s, 548

**Orientation.** Every clip is landscape. There is no portrait clip (h>w: none). The nearest to portrait or square are Stumblingelectricsman (560x540) and Skullfire (616x510). Goblin 3's vertical window would get letterboxed landscape unless clips are pre-rotated or cropped. No rotation is configured anywhere.

**Audio.** `[doc]` `CHANGELOG.md:166`: "24 of the 72 clips carry an audio track". The names are `[mem]` only: all 18 "Pha …" plus Firepumpkin, Skullfloor, Bigskull, Greenskull, Floatinglady and Stumblingelectricsman. 18+6 = 24. I could not re-verify per clip, because the clips are not local and ffprobe over HTTP is impossible. Audio is OFF by default on the devices (`GOBLIN_AUDIO` unset, `mpvController.js:48-51`; CHANGELOG:148-152). The registry's `settings.volume` and `audioEnabled` are inert, since the device has no `/settings` or volume route.

**Heavy or short clips, for playback planning.**
- Highest bitrate: 688 (14.2 Mbps), 683 (9.4), 553 (8.3), 694 (7.6), 404 (7.3).
- Shortest: Hugeskelly 6.0 s, Skullfire 6.2 s, 547 6.4 s, 543 6.7 s.

**MonsterBox library `data/video-library/` (`library.json`).**
- Five entries, all with `duration:0, resolution:"unknown"`. My local ffprobe of the files:
  - `water.mp4`: 3840x2160, 29.97 fps, 6.0 s, no audio, 16.8 MB.
  - `fire.mp4`: 3840x2160, 25 fps, 30.1 s, AAC audio, 59.2 MB.
  - `fire_test.mp4`: 1920x1080, 30 fps, 5 s, no audio.
  - `water_test.mp4`: 1920x1080, 30 fps, 5 s, no audio.
  - `test-video.mp4`: 16 bytes, "moov atom not found", a junk fixture.
- Its `deployments` map records `fire_test.mp4` on .106 and .14 on 09-26, but that file is not on those Goblins now. The map is a stale record, not live truth.
- `data/goblin-videos/` holds 720p60 transcodes of four of those files (made by `scripts/prepare-goblin-videos.sh`, manual).
- The 72 show clips are not in the library. They came from operator USB sticks and were rsynced Goblin to Goblin (KNOWN-BUGS:2004, 2116).

**Deployment path** (library to Goblin)
- `POST /video-library/api/deploy {videoId, goblinId}` uses `deployLibraryVideo` (`routes/videoLibrary.js:30-45`). The target name is `goblinFilenameFor` (:20-25): `originalName` if its extension is library-valid, else `${title}.${format}`, else the UUID name, then `path.basename`, then `sanitizeGoblinFilename`.
- It rsyncs to `/home/remote/media/video/<name>` (`goblinManagerService.js:62-82`), then forces `/api/videos/scan` and reports success only if the device lists the exact name at the source size (:682-694).
- The live MonsterBox process has `MONSTERBOX_SSH_PASSWORD` in its environment `[obs]` (presence check only, value not printed), so rsync and thumbnail ssh will authenticate.
- Constraints:
  - A bare basename with `.mp4/.mov/.avi/.mkv`.
  - No subdirectory targets.
  - There is no transcode step in the deploy path. The player expects 720p-class H.264 (README: 720p30, `prepare-goblin-videos.sh`: 720p60). The library's 4K files would be unsuitable on a Pi 3B.

---

## 6. The scene `goblin-video` step

**Fields.**
- `type:'goblin-video'`, with `'goblin'` accepted as an alias (`sceneExecutor.js:895-897`).
- `goblinId`: the registry id.
- `videoId`: actually a device filename.
- `loop`: boolean, top-level (the Studio writes it); `options.loop` is honoured for legacy scenes (:377).
- `requireLock`: optional, checks the registry lock (:363-369).
- `concurrent`: generic.
- `volume` is inert (removed from the UI).
- Schema: `config/schemas/scenes.schema.json:30` only enumerates the type. Other fields are unconstrained.

**Executor** (`sceneExecutor.js:344-408`)
- `getGoblin(goblinId)` is an exact id lookup. There is no name resolver (grep).
- It then calls `playVideoOnGoblin(goblinId, videoId, {loop, returnToQueue: !loop})` (:378-381).
- The step throws unless the device proof passes, and the result carries `willReturnToQueue`.
- Failure is non-fatal for `goblin-video` (`NON_FATAL_STEP_TYPES`, :937-945). It is fatal for the `goblin` alias.

**Once** (`loop` false or absent)
- Presence check (`/media`, then a forced `/api/videos/scan` on a miss), then `POST /api/video/play-immediate {filename, returnToQueue:true}`.
- After 1.5 s it requires `mpvRunning && currentVideo===filename`. The step does not wait for the clip to end.
- The Goblin returns to its own loop only if its queue was playing at cast time. A stopped or empty queue (both online Goblins right now) means the screen goes blank after the clip.

**Loop** (`loop:true`) calls `loopVideoOnGoblin`: stop-all, clear, add, start `loopMode:'queue'`. That REPLACES the Goblin's own show with that one clip until something else changes it. Nothing restores the original queue.

**Authoring.** `views/scenes/studio.ejs:1150-1185` shows the Goblin by name but stores `g.id`. The video list comes live from the device (`GET /video-library/api/goblins/:id/videos`, :1132-1148). A new step defaults `loop=false` (:1263).

**Existing goblin steps** (Orlok `data/character-3/scenes.json`; 113 and 114 are uncommitted):
- Scene 107, :155-156: `{goblinId:"goblin-192-168-8-14"}` with no `videoId`, so the executor throws "requires videoId" (logged in `monsterbox.err`).
- Scene 113 "Lurk: Fire of Wallachia", :345-347: Goblin 3, `Skullfire.mp4`, `loop:false`, `concurrent:true`.
- Scene 114 "Lurk: The Moon Spell", :414-416: Goblin 2, `Moon.mp4`, same flags.
- Both are in the armed lurk rotation (currently suppressed by the speaker mute).
- Memory notes casts on other nodes' scenes. Those are node-local data, not in this checkout, and I did not verify them.

---

## 7. Hazards

| Hazard | Evidence | Source |
|---|---|---|
| **One-mpv rule.** After ANY stop or restart, `pgrep -c mpv` must equal 1 (needs ssh). A stop that fails to kill mpv puts the server into a one-per-second respawn storm. | KNOWN-BUGS:2099-2109 ("do not stop/restart a playing Goblin unless you can check `pgrep -c mpv` afterwards"), :2008. Code comments `mpvController.js:101-104, 172-188`: SIGTERM only, never SIGKILL. | `[doc]` |
| **Double-spawn race in the device code.** `mpv.play()` while mpv runs and `queue.playing` is true: the old mpv's exit handler fires `onEnd`, then `queue.onVideoEnd` → `playNext` → spawns the queue's next clip. Meanwhile `stop()`'s wait loop sees the new process, waits 1 s, then nulls `this.process`, orphaning it, and the original `play()` spawns a second mpv. This explains the "40 s old mpv beside a 1 s old one". It affects `/play-video`, `/queue/skip`, `/queue/start` while playing, play-immediate with `returnToQueue:false`, and **two overlapping casts to one Goblin**. play-immediate with `returnToQueue:true` avoids it only for the first cast, because the second cast sees `wasPlaying=false`. | `goblin/server.js:335-380`, `mpvController.js:101-209`, `queueManager.js:134-143`. | `[inf]` from the code, not reproduced on a device |
| **Empty-queue blank screen.** `/queue/start` throws on an empty queue and autostart ignores it, so a unit looks healthy but is dark. Seen now on .106. Non-atomic `queue.json` writes (`queueManager.js:45-55`) plus the catch-all load (`:35-43`) mean a power cut mid-save yields an empty queue at next boot. | `queueManager.js:97`, `goblin-autostart.sh:9-18`, KNOWN-BUGS:2174-2176, `[obs]` on .106. The 2026-10-05 write-up is `[mem]`. The power-cut mechanism is `[inf]`. | mixed |
| **No reboots at night.** A reboot can cost a unit. After the 09-26 fleet reboots, one Goblin never rejoined, one was up on the radio but not booted into service, and one stalled at boot. A Goblin not on the network needs a power cycle. The explicit rule ("never reboot a Goblin to verify late at night") is only in the memory note. | KNOWN-BUGS:2130-2138, :2161-2167. `scripts/goblin-os/stabilize-goblin.sh` header ("an upgrade mid-show is a reboot risk"). | `[doc]` symptoms, `[mem]` rule |
| **`GOBLIN_DRM_MODE`.** `hdmi_mode` in `config.txt` is ignored under vc4-kms-v3d. If a TV negotiates 1080p, mpv burns about 300% CPU and a Pi 3B hits 70 °C in 40 s. Pin 720p with a `goblin.service.d` drop-in setting `GOBLIN_DRM_MODE=1280x720`. Only Goblin 4 is documented as having it. | `docs/development/goblin-management.md:341-342`, KNOWN-BUGS:2014-2018, `mpvController.js:127-132`. | `[doc]` |
| **Audio off by default.** `GOBLIN_AUDIO=on` is required in the unit environment (a systemd drop-in, so ssh plus sudo, operator only). HDMI mixer on Goblin 2 reads 78%. The unit's broken `GOBLIN_MPV_EXTRA_ARGS` line does not silence audio (section 3.1). | `mpvController.js:22-51`, CHANGELOG:148-152, `backups/goblins-gold-2026-09-25/README.md:83-93`, KNOWN-BUGS:2168-2173. | `[doc]` |
| **SSH penalty on trixie.** Failed or dropped ssh connections get `kex_exchange_identification: Connection reset by peer`, and sshd resets all connections for about 10 min. Do not probe or hammer ssh; wait. MonsterBox's deploy and thumbnail paths ssh the Goblins (`ConnectTimeout=8`). The mechanism text is only in the memory note. | Symptom: KNOWN-BUGS:2133-2135. Mechanism: memory note. | `[doc]` symptom, `[mem]` mechanism |
| **Fleet Emergency Stop blanks all Goblins and nothing resumes them** (by design). The orchestration system test fires a REAL emergency stop on port 3100, so never run it during a show. | KNOWN-BUGS:2020-2034, `tests/system/orchestration.test.js:75, 144, 354`. | `[doc]` |
| **Repo `goblin/goblin-setup.sh` kills mpv** (`:31-32`, live pkill lines). The deployed copies comment them out. Never copy the repo version over. | diff of repo vs gold | `[read]` |
| **Wrong unit source.** Never restore from the repo `goblin/systemd/` (absent ExecStart, WatchdogSec, MONSTERBOX_URL pointing at Mina). Restore from the gold snapshot (README:58-81). | `backups/goblins-gold-2026-09-25/README.md:58-81` | `[doc]` |
| **Leftover crash-looping units** on .40 and .106 (`monsterbox-goblin`, `goblin-autoqueue`, `goblin-hide-console`). A second server on :3001 appears if `src/server.js` ever shows up. The facehugger deploy would create exactly that. | KNOWN-BUGS:2185-2193 | `[doc]` |
| **Thermal and CPU.** `--vo=drm` costs about 240% CPU. .106 had throttle flag `0x80008` at the 09-25 snapshot, `0x0` on .14. Goblin 4 sits near 71 °C and needs a heatsink or fan. No thermal readout over HTTP. | `backups/…/README.md:80-81`, KNOWN-BUGS:2083-2098, :2016-2018 | `[doc]` |
| **Wi-Fi only.** All Goblins are on `wlan0` and drop off after reboots. | KNOWN-BUGS:2130-2138; the 2026-10-05 repeat is `[mem]` | `[doc]` |
| **Heavy ops on playing units.** Hashing 700 MB per Goblin (`scripts/backup-goblins.sh`) drives load to about 8. Run it outside show hours. | gold README:130-132 | `[doc]` |

---

## 8. What it would take

### (a) Build and assign a new looping playlist per Goblin

**Prerequisites (hands, not API)**
1. Goblin 1 (.40) and Goblin 4 (.244) must be physically revived (power, PSU, SD, Wi-Fi). No HTTP path reaches them. Goblin 1 is the "clearest spot" display.
2. Operator answers:
   - Confirm which physical TV is Goblin 1, 2 and 3.
   - What is Goblin 3's orientation: a portrait-mounted TV, or a landscape TV behind a tall window?
   - Which clips are wanted per Goblin?
   - Is Goblin 3's TV powered and on the right input?
   - Is audio wanted? (Audio is off, and enabling it needs a unit drop-in, so ssh plus sudo.)

**Content**
- All 72 clips are already on .14 and .106, so no deploy is needed unless new or rotated assets are required.
- New assets go through library upload then `POST /video-library/api/deploy` (rsync + ssh), or the operator's USB route. Pre-convert to 720p H.264 first, because the library does not transcode.
- Portrait for Goblin 3 needs pre-rotated or cropped files (`ffmpeg` is on Orlok, 5.1.9). The player has no rotate flag, and adding one needs a corrected, quoted unit drop-in (ssh plus sudo).
- A single pre-concatenated "reel" file per Goblin deployed with the `loop` action gives one mpv `--loop` process. That is the mode the repo proved stable, with no respawn flash and no kill path. A multi-clip queue respawns mpv every clip. This is a recommendation, not an existing feature.

**Records and deploy**
3. Pre-flight per Goblin: `GET /video-library/api/goblins/board?playbackOnly=1`, then `/media`. Every filename must match exactly, including case and spaces.
4. Create playlists with the real `goblinId` (`goblin-192-168-8-14` and so on), `loopMode:'queue'`, and filenames copied from the device list: `POST /goblin-management/api/playlists`.
5. Deploy with `POST /goblin-management/api/playlists/:id/deploy`, or script the same device calls in the order `loopVideoOnGoblin` uses (stop-all, clear, add xN, start `loopMode:'queue'`, verify). `deployPlaylist` needs hardening before it is trusted (section 4). Without it, add your own presence check, ping-first, proof and a per-Goblin serialisation lock.
6. Archive or remove the 69 junk playlists, and note the assignment somewhere (no registry field exists).
7. Add a keep-alive. Nothing restores a loop after an Emergency Stop or a power cut. A watchdog calling `resumeGoblinQueue` when `mpvRunning:false` and `queue.videos.length>0` is not in the repo.
8. Persist display hints (placement, orientation) in the registry. Options: `POST /goblin-management/api/register` (overwrites name, location and description; resets `capabilities`, `platform` and `version` to defaults if omitted; forces `status:'online'`) or `PUT …/settings`.

### (b) Verify each is really playing

**Evidence from HTTP** (two reads at least 10 s apart; one should span a clip boundary for multi-clip lists):
- `/health.ok` true and `uptime` strictly increasing (no restart).
- `/playback-status`:
  - `mpvRunning===true`
  - `playing===true`
  - `basename(currentVideo)` is a playlist member
  - `queue.playing===true`
  - `queue.loopMode==='queue'` (or `single`)
  - `queue.videos[].filename` equals the playlist in order, and `currentIndex` is valid
- `playCount` cadence:
  - single-clip loop under the fixed `queueManager`: Δ=0
  - multi-clip: about +1 per clip length
  - much faster is a respawn storm (as Goblin 3's 42,680)
- MonsterBox single call: `GET /video-library/api/goblins/board?playbackOnly=1` returns `entry.online` plus `playback.*`. The code's own pass rule is `mpvRunning && currentVideo===filename` 1.5 s after the command (`goblinManagerService.js:830-844`), plus `loopMode==='queue'` for loops (:759-766).

**Not proof:**
- Device `success:true` (answers at spawn).
- `deployPlaylist.deployed`.
- Registry `status:'online'`.
- `/health.ok`.
- `queue.playing` alone.
- `lastDeployed`.
- `library.json` `deployments`.

**HTTP cannot see pixels.** No screenshot or HDMI-state endpoint exists on the device. Real proofs need ssh (not allowed in this recon) or a person at the TV:
- `pgrep -c mpv` equals 1.
- `ps -o pcpu -C mpv`.
- `vcgencmd get_throttled`.
- `/sys/class/drm/card0-HDMI-A-1/status`.
- `/proc/asound/card*/pcm0p/sub0/status` (audio).

**Baseline now:** none of the four passes.

### (c) Let scenes cast to a specific Goblin by name

- **Today.** The step stores an IP-derived id. The Studio shows names but writes `goblinId` (`studio.ejs:1153-1156`). There is no resolver. Names are free text and not enforced unique.
- **Resolver.** Add `resolveGoblin(nameOrId)` to `goblinManagerService`: exact id, else case-insensitive name, ambiguity is an error. Call it from `executeGoblinVideoStep` (:344), `orchestrationService.broadcastToGoblins` (`params.ids`), `/video-library/api/goblins/control` (`goblinIds`) and playlist deploy.
- **Step and UI.** The schema does not constrain step fields, so a `goblinName` field (or a name in `goblinId`) needs no schema change. Update the Studio form (:1150-1185, :1224-1226).
- **Name stability.** Names equal hostnames equal TV labels, set by the operator. Keep that invariant, and keep the router's DHCP reservations so ids do not drift.
- **Cast semantics.**
  - The executor default of play-once plus return-to-queue already exists. But "return" works only if the target's queue was playing, so the loops must be healthy and resumed first.
  - Serialise casts per Goblin (the race in section 7). The 6.25 s Skullfire and 30.8 s Moon casts are the exposure.
  - Verify `willReturnToQueue:true` in the step result.
- **Content fit.** The cast clip must exist on that Goblin's disk. A miss costs a forced device rescan. Casting a 16:9 clip to the vertical window needs a portrait asset. Casts are silent while audio is off.
- **Cross-node.** Other nodes' scenes run through their own `goblinManagerService` and their own `data/goblins.json` registry. I could not verify that those registries carry the same ids and names.
- **Offline target.** The manager pings first and returns "is not online" after about 3 s. The goblin-video step is non-fatal, so the scene continues.

---

## 9. Safe and unsafe calls for the next phase

**Safe reads:**
- Device GETs: `/health`, `/playback-status`, `/queue`, `/media`.
- MonsterBox GETs: `/video-library/api/goblins/board?playbackOnly=1`, `/video-library/api/goblins/:id/playback`, `/video-library/api/goblins/:id/videos`, `/goblin-management/api/goblins`, `/api/playlists`, `/goblin-management/api/goblin/:id/status`.
- The board can write a registry status transition when a Goblin returns.

**Do not call without an explicit go-ahead:**
- Any device POST or DELETE.
- Device `GET /api/videos/scan`, and MonsterBox `…/videos?rescan=1`.
- All state-changing video-library and goblin-management routes in section 3.3.
- Specifically dangerous: `POST /goblin-management/api/broadcast`, `POST /goblin-management/api/deploy-and-register`, `POST /api/orchestration/emergency-stop`, `/broadcast/goblins`, `/reboot/goblins`, and `tests/system/orchestration.test.js`.
- Thumbnail requests for uncached names (ssh).
- Anything ssh to a Goblin.

---

## 10. Not found, stale docs, corrections

**Not found**
- Display hints (placement, orientation) for any Goblin.
- A name resolver.
- A playlist UI.
- A post-stop auto-resume or keep-alive.
- A device thumbnail, screenshot, thermal or throttle endpoint.
- Rotation config.
- Per-clip audio flags in the repo (only the count of 24).
- `GOBLIN_DRM_MODE` for Goblins 1-3 (only Goblin 4 is documented).
- Which `queueManager` or `mpvController` version each live device runs.
- Whether `stabilize-goblin.sh` has been run on each device.
- The exact time of the emergency stop.

**Stale docs**
- `goblin/README.md` (Docker, upload, WebSocket design never built).
- `docs/development/goblin-management.md` (loopModes `sequential`/`continuous`, playlist buttons, `deploy-goblin.sh`, `/status`).
- `README.md:960-967` (step example with `goblinId:"goblin-three"` and a step-level `returnToQueue` the executor ignores).
- `README.md` and `docs/networking.md` list Goblin 4 as Operational, but it is not answering now `[obs]`.
- `goblin/playlists/*.json`.
- Legacy scripts use phantom IPs (`scripts/goblin-video-loop.sh` .160, `scripts/play-goblin-videos.sh` .161, `scripts/auto-deploy-goblins.sh` .161/.162).

**Context for the next steps.** The Goblins are Pi 3B/3B+ on Wi-Fi, and it is currently night (20:50 CDT). Anything that restarts, reboots or power-cycles should wait for daylight and an operator present."

