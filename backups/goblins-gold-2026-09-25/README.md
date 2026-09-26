# Goblin gold snapshot — 2026-09-25

A restorable, git-tracked snapshot of the three Goblin video nodes as they were running on
2026-09-25, when the operator declared them "running and working perfectly", plus the
MonsterBox-side Goblin configuration and Orlok's own OS provisioning. Taken from Orlok with
`scripts/backup-goblins.sh` (first pass 2026-09-26T01:37Z, refreshed 01:45Z with device logs,
unit journals and runtime network config). Prove it is intact at any time with:

```bash
scripts/backup-goblins.sh --verify backups/goblins-gold-2026-09-25
```

## What was captured

| Dir | Registry name | Host | Hardware | OS | node / mpv | Videos on disk | Queue at snapshot |
|---|---|---|---|---|---|---|---|
| `goblin-192-168-8-40` | Goblin One | goblin1 | Pi 3B+ Rev 1.4 | Debian 12 bookworm | 18.20.8 / 0.35.1 | 72 videos (+3 .gcode), 707 MB | `Pha Poltergeist Ampedup Win H.mp4`, loop `none`, idle |
| `goblin-192-168-8-106` | Goblin Two | goblin2 | Pi 3B+ Rev 1.4 | Debian 13 trixie | 20.19.2 / 0.40.0 | 72 videos, 594 MB | `Sauron.mp4`, loop `none`, idle |
| `goblin-192-168-8-14` | Goblin Three | goblin3 | Pi 3B+ Rev 1.4 | Debian 13 trixie | 20.19.2 / 0.40.0 | 72 videos (+3 .gcode), 707 MB | `307 Jb Hd.mp4`, loop `queue`, **playing** |

Each Goblin directory holds:

- `os/` — `config.txt`, `cmdline.txt`, `os-release`, `dpkg-selections.txt`, `apt-manual.txt`,
  `versions.txt`, every locally administered systemd unit and drop-in under `os/systemd/` with
  the enabled list, live state and last journal lines, the helper scripts from
  `/usr/local/bin/`, network config with secrets redacted, `sudoers.d`, display (DRM) and
  audio state, throttling flags, CPU governor.
- `app/` — the deployed `/home/remote/goblin` minus `node_modules`, `logs`, `cache`, `media`:
  `server.js`, `src/`, `systemd/`, `package.json` + `package-lock.json`, the live `queue.json`,
  the last 150 lines of each device log, `npm ls`.
- `home/` — the operator's own scripts and archives in `/home/remote` (`goblin-gold.tar.gz`,
  `goblin-load-halloween.sh`, `goblin-queue-setup.sh`, `run-queue-add.sh`), listings of the
  leftover `goblin-system/` and `goblin.backup.*` directories, mpv user config.
- `state/` — the six API responses (`/health`, `/api/status`, `/queue`, `/media`,
  `/api/videos/scan`, `/playback-status`) pretty-printed.
- `videos.manifest.tsv` — every video: name, bytes, sha256, codec, resolution, fps, duration.
  `videos.listing.tsv` is the cheap name+size listing the manifest is checked against.

`monsterbox/` holds Orlok's side: `goblins.json` (the live registry), `goblin-playlists.json`,
`video-library.json`, `animatronics.json`, `app-config.json`, the git tree of `goblin/` at this
commit, sha256 of the local video files, and `os/` with Orlok's provisioning (systemd unit and
drop-ins, avahi, journald, logrotate, WirePlumber rules, crontab, package lists, audio/I²C/USB
inventory; `/etc/monsterbox/env` by key name only).

`SNAPSHOT.json` is the index; `MANIFEST.sha256` covers every file.

## What is deliberately NOT here

- The video files (about 2 GB). The manifest carries their sha256, so a restore is proven with
  `sha256sum -c`. All three Goblins hold the same 72 videos (byte-identical); Goblin One and
  Goblin Three additionally carry three stray 3D-printer files (`BearHead 1.0.gcode`,
  `Bear Head Bits 2nd.gcode`, `Left Forearm.gcode`, 119 MB) in the media directory that the
  player ignores and that need not be restored.
- The MonsterNet Wi-Fi PSK (redacted; the SSID `MonsterNet` is hidden), the values in
  `/etc/monsterbox/env`, SSH keys, shell history, `node_modules` (`npm ci` rebuilds it from the
  lockfile).

## What this snapshot preserved that the repo did not hold

- **The devices run the "goblin-gold" build, and its unit lives only on the devices.** The
  installed `/etc/systemd/system/goblin.service` ("MonsterBox Goblin Gold Media Player") starts
  `/home/remote/goblin/server.js` with `ExecStartPre=+/usr/local/bin/goblin-setup.sh`,
  `ExecStartPost=/usr/local/bin/goblin-autostart.sh`, real-time scheduling
  (`CPUSchedulingPolicy=rr`, `Nice=-20`, `IOSchedulingClass=realtime`) and the whole MPV tuning
  line in `GOBLIN_MPV_EXTRA_ARGS`. It is identical on all three. The repo's
  `goblin/systemd/goblin.service` is a different, older unit (`src/server.js`, `WatchdogSec=60`,
  `MONSTERBOX_URL` pointing at Mina) — **restore from `os/systemd/goblin.service` and
  `os/usr-local-bin/`, never from `goblin/systemd/`.**
- `server.js` and `src/queueManager.js` on all three devices are byte-identical to the repo's
  `goblin/` copies; `src/mpvController.js` differs only by trailing whitespace; the device
  `package.json` is named `goblin-gold` and lacks the repo's `qs` override.
- Goblin One is the odd one out: bookworm, node 18, mpv 0.35, `playlists/` and
  `scripts/goblin-setup-fixed.sh` inside the app dir, and its installed `goblin-setup.sh` has
  the `pkill mpv`/`pkill vlc` lines commented out.
- **Debris, recorded and left alone:** Goblin One and Two have `monsterbox-goblin.service`
  enabled and crash-looping every 10 s (its `ExecStart` is `src/server.js`, which does not
  exist — restart counter 284 fifty minutes after boot on Goblin One). Goblin One also loops
  `goblin-autoqueue.service` (`bin/autoqueue.sh` missing) and `goblin-hide-console.service`
  fails once per boot. Goblin Three has none of these. `lightdm` is enabled but inactive on all
  three. Throttle flags at snapshot: One `0x50000` (under-voltage occurred since boot), Two
  `0x80008` (soft temperature limit active), Three `0x0`.

## Changed on the devices AFTER this snapshot (2026-09-26)

- **Audio is on.** `/home/remote/goblin/src/mpvController.js` on Goblin Two and Three (and
  Goblin One once it is reachable again) is the repo's `goblin/src/mpvController.js` from
  commit "Goblin displays play audio": `--no-audio` is gone; mpv runs `--audio=auto --ao=alsa
  --audio-device=alsa/sysdefault:CARD=<the HDMI card from /proc/asound/cards>`. Restoring
  `app/src/mpvController.js` from this snapshot silences them again. `GOBLIN_AUDIO=off` in the
  unit environment restores the silent display without a file change.
- Still as snapshotted: the systemd unit, `server.js`, the queues. Goblin Two's HDMI mixer
  (`amixer -c 0 sget PCM`) reads 78% / -19.88 dB from the OS image; `amixer -c 0 sset PCM 100%
  && sudo alsactl store` is the operator's to run.

## Restore a Goblin from this snapshot

Start from a fresh Raspberry Pi OS Lite of the same release as `os/os-release.txt`, then:

1. Hostname from `os/hostname.txt`; user `remote` with the NOPASSWD sudo drop-in in
   `os/sudoers.d.txt`; Wi-Fi `MonsterNet` (hidden; PSK from the operator); keep the router's
   DHCP reservation so the IP, and therefore the registry id `goblin-<ip-with-dashes>`, stays.
2. Packages: `apt-mark showmanual` in `os/apt-manual.txt` is the manual set (mpv, ffmpeg,
   nodejs …); match the majors in `os/versions.txt`.
3. `/boot/firmware/config.txt` ← `os/config.txt`. Take `os/cmdline.txt` as reference only — its
   `root=PARTUUID=` belongs to the old card.
4. App: `cp -r app/. /home/remote/goblin/ && cd /home/remote/goblin && npm ci`.
   `queue.json` comes back with it.
5. Helpers and units: `os/usr-local-bin/*` → `/usr/local/bin/` (executable);
   `os/systemd/goblin.service` and `os/systemd/console-blanker.service` →
   `/etc/systemd/system/`; the `getty@tty1.service.d` drop-in too; then
   `systemctl daemon-reload && systemctl enable --now console-blanker goblin`.
   Do not install `monsterbox-goblin`, `goblin-autoqueue`, `goblin-hide-console` or
   `goblin-xserver` — see Debris above. The operator scripts in `home/` are history, not
   provisioning: `goblin-load-halloween.sh` queues MonsterBox-library UUID files that exist on
   no Goblin, and the JSON bodies in all three lack quotes.
6. Videos → `/home/remote/media/video/` from the operator's USB sticks or by `rsync` from a
   sibling Goblin, then prove them:
   `cut -f3,1 videos.manifest.tsv | tail -n +2 | awk -F'\t' '{print $1"  "$2}' | (cd /home/remote/media/video && sha256sum -c)`.
7. `goblin-autostart.sh` starts the queue in loop mode on boot. MonsterBox re-discovers the
   node by IP; `POST /goblin-management/api/register` if it does not.
8. `curl http://<ip>:3001/health` must answer `ok:true`; compare with `state/health.json`.

## Re-taking it

```bash
MONSTERBOX_SSH_PASSWORD=… scripts/backup-goblins.sh goblins-gold-<date>
SKIP_MANIFEST=1 MONSTERBOX_SSH_PASSWORD=… scripts/backup-goblins.sh goblins-gold-<date>   # reuse hashes
```

Goblins are read from `data/goblins.json`, so a new unit is picked up automatically. Hashing
about 700 MB per Goblin takes a few minutes on a Pi 3B+ and competes with playback; run it
outside show hours.
