# Bench handoff — 2026-08-22 evening session → fresh session

**For the next session (or any orchestrator, e.g. Agent Master Manager): this file is the
complete brief. Point a session at it and it has everything.** One hard requirement: the
next session MUST run on a machine with LAN access to 192.168.8.x (the operator's own
machine / a node) — the outgoing session ran in a cloud container with **no route to the
fleet**, which is why every node command tonight was operator copy-paste. A local session
can `ssh remote@<ip>` directly (`MONSTERBOX_SSH_PASSWORD` env; `ssh` lands in
`/home/remote`, so `cd /home/remote/MonsterBox` first).

## The one command that resumes the bench

From any machine on the LAN (or a session with shell there):

```bash
ssh remote@192.168.8.130 'cd /home/remote/MonsterBox \
  && git fetch origin main \
  && git checkout origin/main -- server services routes views public python_wrappers scripts tests \
  && sudo systemctl restart monsterbox.service \
  && bash scripts/bench/knight-finish.sh'
```

`scripts/bench/knight-finish.sh` is idempotent: it asserts the operator's confirmed
channel map exactly once (jaw = ch7, head = ch11 multi-turn 0–900 — **the operator has
said to stop reassigning pins; this map is law**), verifies what landed, self-heals the
head's calibration profile, and prints the remaining hands-on steps.

## Sir Dragomir (Knight, char 4, 192.168.8.130) — where things stand

**Working, proven at the bench:** jaw (drove on the page), magic box (moves; its
open/closed mapping needs Set Min/Set Max), speaker (new XVF3800; operator heard TTS,
`voiceFallback:false`), new camera (picture confirmed by eye), mixer normalized
(`'PCM',1` = 0 dB proven), default source = the array.

**Head servo (part 1):** ALIVE. The night's "totally unresponsive" chain, fully
root-caused: (1) the servo lead was physically unplugged; (2) when replugged it snapped
to the channel's stale held pulse and sat powered at an unsafe spot — released with the
new Release control; (3) the node config drifted repeatedly (channel 7/11 flips, a stray
`servoType: continuous`) while override curls failed silently against a restarting
server. All the software gaps that surfaced are fixed and pushed (see "shipped tonight").
**Remaining: run the one command above, then the script's steps 2–3 — first move with
eyes on it, nudge to the safe ends, Set Min / Set Max, flip Calibrated.** Then remove the
char-4 part-1 entry from `config/physical-faults.json`, commit, deploy.

**Box collision risk:** part 3's config was last seen on channel 11 — the head's channel.
The script prints all three configs; if commanding the box moves the head, land the box's
real pin (one overrides curl on part 3) — only a human at the rig can name it.

**Open item — capture (the array's mic):** zero frames through every path (default,
by-name, stereo; watchdog-proven, ~18 s each). Speaker side of the same unit works.
Suspects, in order: card profile not `output:analog-stereo+input:analog-stereo`
(`pactl list cards`), USB error in `dmesg`, a physical replug of the array, and last the
unit's firmware vs Orlok's (decisive test: swap arrays between nodes). Full trap list:
`docs/hardware/RESPEAKER-XVF3800.md` (new "trap zero": a hw-pinning `/etc/asound.conf` —
already found and removed on this node; install.sh now neutralizes it at provisioning).
Capture blocks STT/conversation only — scenes, TTS, jaw sync all work without it.

**Volume canon:** node runs 0.55 tuned for the OLD speaker. Operator heard the new one
fine; if it needs retuning: `wpctl set-volume @DEFAULT_AUDIO_SINK@ <v>` by ear → write
`sinkVolume` for id 4 in `config/animatronics.json` → commit → deploy.

## Mina (char 2, 192.168.8.140) — rebuild in progress, server DOWN

Operator re-pinned her harness: **eye = ch3, neck = ch7, jaw = ch11, laser = ch15**
(part ids unchanged: eye 3, neck 2, jaw 1, laser 10). Recorded in
`docs/hardware/PCA9685-CHANNEL-MAP-MINA.md`, `docs/character_mina.md`,
`docs/hardware/MINA-REBUILD.md`. **Her restored backup will carry the OLD channels —
`MINA-REBUILD.md` §3a has the four override curls to run the moment her server answers**
(they were attempted tonight and died silently because she was down — they have NOT
landed). Full rebuild/acceptance runbook: `docs/hardware/MINA-REBUILD.md` (§1 backup
FIRST if the SD is touched).

## Orlok (char 3, 192.168.8.120) — untouched tonight, items pending

BENCH-CHECKLIST O1 (Bow ×3, ≥15 min apart), O3 (head window 3–169 + Calibrated stamp),
O4 (watchdog install per node), O5 (mic gain persistence). All with exact commands and
pass lines in `docs/hardware/BENCH-CHECKLIST.md`.

## Shipped tonight (all on `main` AND `claude/monsterbox-v11-production-5gntng`, CI green)

- `e99841f` multi-turn real degrees end to end (capability.maxAngleDeg; UI 0–900; one
  wrapper-scale conversion seam; 8 unit tests)
- `d52df26` verifier round: pose/idle batch path can no longer slam the head through the
  daemon's 0–180 mapping; measured profiles never silently re-scoped; markers accept the
  real range
- `fd06ddd` record_wav hard watchdog (capture can never hang a terminal or child again)
- `a8f6bd8` hw-pinning asound.conf trap: documented + neutralized in install.sh
- `afa093f` Mina channel-map rewire in every record
- `1859172` multi-turn drives through the servo daemon (ms per command, no more backlog);
  deadband-proof nudge steps (10/25/75 real on 900°)
- `7eea15f` Release control (de-energize a channel before plugging/unplugging a lead)
- (this commit) re-typing a part rebuilds its PLACEHOLDER profile kind — the stray
  `continuous` click can't wedge angle commands again; this handoff + bench script

## Rules that bind the next session (from CLAUDE.md + operator, unchanged)

- **Never drive on your own initiative:** Orlok parts 3/4/5, and now-calibrated-or-not
  the Knight's head only under operator eyes until its window is stamped.
- **Release before plugging/unplugging any servo lead** — a live channel slams a newly
  plugged servo to its stale pulse (learned on the head tonight).
- Node-local files (`data/character-*/parts.json` etc.) never land in commits; channels
  travel by overrides curls / the bench script, never by git.
- A success field is not proof. Motion is proven by eyes, audio by ear-check, capture by
  FRAMES (bytes + RMS). Failure reasons live in `/var/log/monsterbox.err`.
- Code reaches nodes by rsync deploy (`npm run deploy:all`) or the code-paths-only git
  checkout used above — never a bare `git pull` on a node.

## Ready-made prompt for the follow-up session (operator-requested)

> Mission: harden Sir Dragomir (the Knight) once and for all — every hardware part's
> declared type matches physical reality, and every page and drive path behaves per
> that type. I am at the bench and can answer physical questions and press buttons;
> you have LAN access and do the rest yourself over SSH and HTTP.
>
> Repo: github.com/arwpc/MonsterBox, branch main (also mirror pushes to
> claude/monsterbox-v11-production-5gntng). Read these FIRST, in order:
> 1. docs/development/BENCH-HANDOFF-2026-08-22.md — complete state of last night
> 2. CLAUDE.md + the monsterbox-hardware and monsterbox-fleet skills
> 3. docs/hardware/BENCH-CHECKLIST.md (K-section) and docs/character_sir_dragomir.md
>
> Ground truth from me, the operator (this map is law — do not reassign pins):
> - Node: sirdragomir, 192.168.8.130, char 4. SSH: remote@192.168.8.130,
>   lands in /home/remote, repo at /home/remote/MonsterBox.
> - PCA9685 0x40: jaw = ch7 (standard 180°), head = ch11 (goBILDA Stingray-2,
>   MULTI-TURN 900° real — never continuous), magic box = part 3 (VERIFY its real
>   channel and its real kind with me by driving it: it may be a standard servo or
>   a linear actuator — its config was last seen colliding on ch11).
> - Start by running: bash scripts/bench/knight-finish.sh ON the node (idempotent;
>   asserts the map, heals the head profile, prints status).
>
> The job, end to end:
> 1. TYPE TRUTH: for each Knight part (jaw, head, magic box, camera, mic, speaker),
>    confirm the physical kind with me, then make parts.json config (servoType /
>    rotationRangeDeg / actuator fields), the calibration profile capability, and
>    the model entry agree. Fix mismatches through the overrides API — never by
>    committing node-local data files.
> 2. SURFACE AUDIT: on the calibration page, pose editor, and scene/movement pages,
>    verify each part renders the controls its type demands (standard servo:
>    0-180 angle; multi-turn: real-degree range with its full span; continuous:
>    CW/stop/CCW + speed/duration, never an angle slider; linear actuator:
>    position 0-1 + extend/retract jog). Where a page shows the wrong control for
>    a type, fix the code, add a regression test, push.
> 3. CALIBRATE with me: head — first move eyes-on, nudge to safe ends, Set Min /
>    Set Max with cable margin, flip Calibrated, then remove the char-4 part-1
>    entry from config/physical-faults.json, commit, deploy. Box — resolve its
>    channel/type, then Set Min (closed) / Set Max (open). Jaw — verify its window.
> 4. PROVE IT: drive each part once through its RUNTIME path (a pose or scene
>    step, not the calibration page) and I confirm motion by eye. Run
>    npm run test:unit and the gate before every push; keep CI green.
>
> Binding rules: a success field is never proof — motion is proven by my eyes,
> audio by ear-check, capture by frames; failure reasons are in
> /var/log/monsterbox.err, not .log. RELEASE a channel (Release button or
> POST /api/calibration/<partId>/release) before any servo lead is plugged or
> unplugged. Code reaches the node by rsync deploy or code-paths-only git
> checkout — never a bare git pull on a node. Never drive Orlok parts 3/4/5.
> Ask me before any head move until its window is stamped Calibrated.
>
> Done means: every Knight part's type/config/profile/UI/drive-path agree, head
> and box calibrated and stamped, faults entry removed, all fixes tested, pushed,
> CI green, and BENCH-CHECKLIST + character sheet updated to match reality.
