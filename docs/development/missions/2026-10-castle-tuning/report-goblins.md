# Report: goblin engineer (decision D5)

Worker report (saved by the lead); work ran 2026-10-09 21:05 → 2026-10-10 11:10 CDT across the reboot and the
power loss. Headline: Goblins 2 and 3 are looping their new reels and are proven; the keep-alive runs on Orlok and
has acted twice with proof; Goblins 1 and 4 are off the network with their reel staged, and the keep-alive copies
and starts it when they return.

## Result

| Goblin | Window | Staged show (`role: "show"`) | State at 11:04 on 10-10 |
|---|---|---|---|
| Goblin 1 (.40) | most noticeable, clearest | `reel-goblin1-showcase.mp4`, 495.3 s, 155.8 MB, 17 clips | off the network; staged |
| Goblin 2 (.106) | big picture window | `reel-goblin2-window.mp4`, 230.7 s, 69.0 MB, 12 clips | looping, proven |
| Goblin 3 (.14) | small vertical roof window | `reel-goblin3-roof-strip.mp4`, 206.9 s, 62.6 MB, 12 clips, 9:16 centre strip | looping, proven |
| Goblin 4 (.244) | not recorded | showcase reel (same file as Goblin 1) | off the network; staged |

Reel spec: 1280x720, H.264 High@4.0, 30 fps constant, ≈2.5 Mbit/s (3.5 peak), 2 s keyframe interval, no audio,
0.4 s fades at the joins. One file per Goblin plays as a one-file queue in loop mode (one `mpv --loop`). The 72
original clips stay on every unit. Reels and per-reel manifests: `/home/remote/goblin-reels/reels/`; build plan
`/home/remote/goblin-reels/reel-plan.json`; source clips (594 MB, checksums identical to the gold manifest) kept in
`/home/remote/goblin-reels/source` until Goblin 3's orientation is settled.

## Reels and why each clip is there

Clips measured with `scripts/goblins/clip-metrics.mjs` (brightness, contrast, motion, detail, black fraction,
subject centre → `/home/remote/goblin-reels/clip-metrics.json`). Bigskull excluded everywhere (black in 100 % of
samples).

- **Goblin 2** (bold faces and silhouettes that read from the street): Wraith Faceofdeath, Scary Face, Hugeskelly,
  Firepumpkin, Spinster Startlescare, Greenskull, Poltergeist Startlescare, Moon, Siren Startlescare, Skullfloor,
  Wraith Startlescare, Stumblingelectricsman; window-ghost clips trimmed of their black lead-in and tail.
- **Goblin 3** (centre strip): a 9:16 strip cut around the measured subject centre, scaled to full height, centred
  on black: Faceofdeath, Stumblingelectricsman, Spinster Startlescare, Greenskull, Poltergeist Startlescare, Moon,
  Siren Startlescare, Skullfire, Wraith Startlescare, 497 vortex, Hugeskelly, Scary Face (the Spinster's raised arm
  leaves the strip).
- **Goblin 1** (showcase: long ghost scenes interleaved with the most detailed, highest-motion clips):
  Riseofthewraiths, 553 fire, Floatinglady, 688 red lightning, Seaofsirens, Monstergoop, 497 vortex, Skellycrawler,
  Poltergeist Ampedup, 558 fire, Scary Face, Spinster Teafortwo, 689 gold lightning, Skellyskrape, Batattack,
  Soulseeker, 312 water. **Goblin 4** gets the showcase reel (placement not recorded).
- If Goblin 3's TV is physically portrait: add `"transpose":"cw"` (or `"ccw"`) to its reel in the plan, rebuild
  with `node scripts/goblins/build-reels.mjs --plan /home/remote/goblin-reels/reel-plan.json --only reel-goblin3-roof-strip.mp4`,
  restart its show (`POST /video-library/api/goblins/goblin3/show` or the film button on Video Control).

## Deploy proof

- Goblin 2 (22:46, hardened playlist deploy): rsync 69,032,809 B in 27 s; zero new spawns; reads at 22:47:32 and
  22:47:45 both mpv on the reel, loop `queue`, playCount `[1]`; one ssh session: `pgrep -c mpv` = 1, on-device
  sha256 `d26289b1…0149` equals the build.
- Goblin 3 (22:57): the preflight ssh found an orphan mpv (PID 170729, 27.8 h old, 236 % CPU) the Goblin server had
  lost track of (left over from the respawn storm); SIGTERM, exited in ≈2 s, `pgrep` 0. Deploy: rsync 62,614,501 B
  in 24 s, zero new spawns; reads at 22:58:19 and 22:58:31 both the reel, playCount `[1]`; `pgrep -c mpv` = 1;
  sha256 `da5f7f41…d870` matches.
- This morning: both reels still looping at 10:29; after the keep-alive's starts Goblin 2 at 10:31 `pgrep` = 1,
  Goblin 3 at 11:04:15 and 11:04:28 playCount `[2]` both times, `pgrep` = 1.

## Keep-alive

Runs only on the node named by `controllerHost` in `data/goblin-keepalive.json` (Orlok, `enabled:true`, every
tuning key commented). Override env `MB_GOBLIN_KEEPALIVE=on|off`; toggle `POST /video-library/api/goblins/keepalive
{enabled}` (GET for status). Every 30 s per Goblin (`/playback-status` + `/health`): a non-empty queue that is down
is started again after two looks, then proven like a deploy; a queue someone stopped (playing flag down) is held
dark 10 min from the first look (a Video Control Stop holds for its `holdMinutes`, 0 = no hold); a Goblin that
returns, restarts, or shows an empty queue with a staged show gets that show, with the reel copied from this node
first if the unit lacks it. Limits: never restarts goblin.service or reboots; at most one start per Goblin per
minute (floor not configurable lower); never during a cast, within 20 s of one, or while another command holds
that Goblin; stands down on a respawn storm and on a start that cannot hold the display (that start is stopped);
otherwise backs off 2–30 min. Stop bookkeeping persists in `data/goblin-keepalive-state.json`.

Evidence: (1) unprompted — Goblin 2's queue was found stopped after this morning's boot (flag down since ≈23:00,
cause unknown; Orlok was down overnight): `held after a stop until 10:09`, `queue of 1 stopped for 601 s; starting
its queue again`, `✅ resume proven … spawn count steady over 8 s`, `pgrep` = 1. (2) deliberate — Goblin 3 stopped
at 10:32 with `holdMinutes:0`; restarts at 10:33 and 10:37 and a cast at 10:52 exposed two flaws (bookkeeping not
persisted; dark-since clock followed mpv instead of the queue), both fixed and unit-tested; afterwards `restored
stop bookkeeping for 2 Goblin(s)`, at 11:03 `queue of 1 stopped for 619 s; starting…`, `✅ resume proven`, two
reads + `pgrep` = 1. Device quirk: a cast to a Goblin whose queue is stopped does not return to the queue; the
keep-alive covers it after the hold.

## Resolver API

In process `goblinManagerService.resolveGoblin(nameOrId)`: exact id, then name case-insensitively, then name with
spaces/punctuation ignored (`goblin3`, the hostname) → `{success, goblin, id, matchedBy}`; ambiguous →
`{success:false, ambiguous, candidates}`. All manager entry points resolve names; the scene executor's
`resolveGoblinRef` uses it. HTTP: `GET /video-library/api/goblins/resolve?name=…` (404 / 409);
`POST /video-library/api/goblins/control` and the playlist deploy accept names in `goblinIds`.

**Resume call for the fleet-event runner:** `POST /video-library/api/goblins/<id or name>/resume`, or
`POST /video-library/api/goblins/control {"action":"resume","goblinIds":["Goblin 2","Goblin 3"]}`; in process
`goblinManagerService.resumeGoblinQueue(nameOrId)`. It restarts the Goblin's own queue in its loop mode, does
nothing if already playing, is serialized, proven by two reads, and ends any keep-alive hold. To re-apply the
staged show: `POST /video-library/api/goblins/<id or name>/show`.

## Display hints and the Video Control board

`data/goblins.json` records `location`, `placement`, `orientation` (`landscape|portrait-cw|portrait-ccw|unknown`)
and `readsFrom` for all four (set through `PUT /goblin-management/api/goblin/:id/display`, survive
re-registration; Goblin 3's orientation `unknown`). Each Video Control card shows the hints with a Placement
editor, the staged show and whether it is on screen, the keep-alive's decision and last action, and a film button
that puts the Goblin back on its show; cards in order 1–4.

## Hardened deploy

`applyPlaylistToGoblin` (used by `deployPlaylist`, `/show` and the keep-alive): pings the device; checks every file
against the device's `/media` listing (rescanning on a miss), copying a missing file from its `source` on this node
or refusing before the queue is touched; per-Goblin lock (a second caller gets `busy`); stops safely, clears, adds,
starts (device loop modes `none|single|queue` only); proves with two reads 8 s apart; a failed start that left the
device retrying is stopped. `deployed` lists only proven Goblins. Video Control / Goblin Management stops and the
old page's "Play now" go through the manager.

## Playlists, manifests, scripts, tests

- `data/goblin-playlists.json`: `show-goblin-1`..`4` with the reel's bytes, sha256, source path, clip list; the 69
  junk playlists archived in `data/goblin-playlists.archive-2026-10-09.json`.
- Manifests `data/goblin-manifests/<goblinId>.json` for all four (`{clips:[{filename, bytes, duration, resolution,
  fps, codec, audio}]}`): Goblins 2 and 3 from the live listing including their reels (73 files each); Goblin 1 from
  its gold manifest; Goblin 4 assumed = Goblin 3's 72 clips (provisioned from it, checksums verified); staged reels
  under `staged`. Republish: `node scripts/goblins/publish-manifests.mjs --assume "Goblin 4=Goblin 3"`.
- Scripts `scripts/goblins/clip-metrics.mjs`, `build-reels.mjs`, `publish-manifests.mjs` (hosts from the registry).
- Tests `tests/unit/goblin-resolver-keepalive.test.js`, `goblin-playlist-hardening.test.js`: 49 Goblin tests pass.
  `audit:independence` has no hits in Goblin files.
- Service restarted twice today (10:48, 10:57) for the persistence fixes; healthy both times.

## For the operator

1. Revive Goblins 1 and 4 (power, PSU, SD, Wi-Fi): within about a minute of a unit answering, the keep-alive copies
   the 156 MB reel and starts it; then check `pgrep -c mpv` = 1 on the unit.
2. Confirm Goblin 3's orientation and record it on its card; rebuild with `transpose` if portrait-mounted.
3. Say where Goblin 4 stands so it can get a fitted reel.
4. Goblin 2 is running hot: 79.5 °C, throttled=0xa0008 at 10:31 (soft temperature limit active, ARM clock capped)
   — heatsink or fan; also check whether its TV negotiated 1080p (only Goblin 4 has the 720p `GOBLIN_DRM_MODE` drop-in).
5. Something stopped Goblin 2 at about 23:00 on 10-09; cause not found in the logs; the keep-alive now covers it.
