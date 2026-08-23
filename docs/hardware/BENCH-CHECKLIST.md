# Bench Checklist — proving all three animatronics stable, end to end

Purpose: a repeatable procedure to verify every live animatronic against the actual machine,
so "stable" is something anyone can re-establish without rediscovering the method. Run it
top to bottom at the bench (or over the LAN); it is also the closure procedure for the open
items from the 2026-08-21/22 v11 sessions. Written to be followed by someone who has never
read this repo: every step names what to do AND what a pass looks like.

Nodes: **Orlok** char 3 → `192.168.8.120` · **Sir Dragomir (Knight)** char 4 → `192.168.8.130` ·
**Mina** char 2 → `192.168.8.140` — **Mina is UNDER REBUILD (see §3-M)**. All commands work
from any machine on the LAN; `ssh remote@<ip>` lands in `/home/remote`, so remote shell
commands need `cd /home/remote/MonsterBox` first. The operator hardware ledger referenced
throughout is `docs/hardware/OPERATOR-TODO.md` (same folder as this file).

## 0. Ground rules — what counts as proof

- **A success field is not proof.** Proof is: the part moved (eyes on it), audio was heard
  (the ear-check's own verdict, not an impression), frames flowed (non-zero bytes AND
  non-zero RMS / a real JPEG with size > 0).
- **Grep the node, not the version string.** A node "running the fix" is proven by
  `cd /home/remote/MonsterBox && git rev-parse --short HEAD` matching the commit you deployed.
- **The failure reason lives in `.err`.** `tail -50 /var/log/monsterbox.err` after anything
  surprising; `/var/log/monsterbox.log` alone reads healthy while a part is refused.
- **Never drive on their own initiative:** Orlok parts 4+5 (shared fuse rail, has blown) and
  the Knight's 900° head (part 1 — its calibration scale bug means one UI degree is five real
  degrees; a move can wrap the head cabling). Operator direction only.

## 1. Per-node basics (run for each live node)

```bash
IP=192.168.8.120   # repeat with .130 (and .140 after Mina's rebuild)
curl -sk "https://$IP:3000/health"
# PASS: {"status":"OK","version":"<X.Y.Z>",...} where version equals the "version" field of
# package.json at the commit you deployed, and ALL nodes report the SAME version.

curl -sk "https://$IP:3000/api/system/info" | head -c 300
# PASS: success true, and "hostname" is the node's canonical name from config/animatronics.json:
# orlok (.120) / sirdragomir (.130) / mina (.140). A wrong hostname boots the wrong CHARACTER.

ssh remote@$IP 'cd /home/remote/MonsterBox && git rev-parse --short HEAD && sudo systemctl show monsterbox -p NRestarts'
# PASS: the hash equals git rev-parse --short HEAD of what you deployed (identical on all
# nodes — deploy is rsync; a differing hash means the deploy did not land), and NRestarts=0.
# Nonzero NRestarts = unexplained crash-restarts: read /var/log/monsterbox.err before continuing.

ssh remote@$IP 'vcgencmd get_throttled'
# PASS: throttled=0x0. Anything else = under-voltage/throttling happened this boot.

ssh remote@$IP 'journalctl -k -b | grep -c "over-current"'
# PASS: 0. Nonzero = the USB 5V rail is tripping (OPERATOR-TODO §A / §4).

curl -sk "https://$IP:3000/conversation/api/speaker-mute"
# PASS: {"muted":false}. true = the show plays silence; clear it:
#   curl -sk -X POST "https://$IP:3000/conversation/api/speaker-mute" -H 'Content-Type: application/json' -d '{"muted":false}'

ssh remote@$IP 'wpctl get-volume @DEFAULT_AUDIO_SINK@'
# PASS: Volume matches the node's canon in config/animatronics.json —
# Orlok 1.30, Dragomir 0.55, Mina 1.00 (Mina's canon gets RE-TUNED at her rebuild acceptance).
# Drifted? Restore without a restart:
#   curl -sk -X POST "https://$IP:3000/api/system/volume/canonical"          # this node
#   curl -sk -X POST "https://$IP:3000/api/orchestration/volume/restore-canonical"  # whole fleet
```

## 2. Per-node motion + voice proof

1. **Servo proof.** List the node's parts and pick a servo that `config/physical-faults.json`
   does NOT list under this node's character (the file is repo-synced — the copy on your
   laptop and on the node are the same; today it lists only Orlok parts 2, 3, 4, 5):
   ```bash
   curl -sk "https://$IP:3000/api/parts" | python3 -m json.tool | grep -E '"id"|"name"|"type"' | head -30
   # each entry's "id" is the <partId>. Known-safe picks: Orlok jaw = 10, Knight jaw = 2.
   curl -sk -X POST "https://$IP:3000/api/calibration/<partId>/nudge" \
     -H 'Content-Type: application/json' -d '{"dir":"max","scale":"fine"}'
   ```
   PASS: the part **physically moves** (eyes on it — the JSON says only that a command was
   sent). Repeat with `{"dir":"min","scale":"fine"}` to return it.
2. **Ear-check** — from **Orlok only** (it holds fleet SSH trust):
   `cd /home/remote/MonsterBox && npm run earcheck`
   PASS per node: its line reads **`VERDICT: AUDIBLE`** (the script's own bar: mic rise ≥4 dB
   over floor AND ≥50% word recall). `SILENT` / `FAINT` / `GARBLED` / `WRONG-VOICE` = fail —
   the per-node output says why. A node scored `OFFLINE — no ssh` while
   `curl -sk https://<ip>:3000/health` answers is an earcheck artifact, not a down node.
3. **Jaw sync.** Play the same short line TWICE through the node's speaker (the second play
   is the "warm" one that matters — the first pays one-shot spawn + sink-resume costs):
   ```bash
   curl -sk -X POST "https://$IP:3000/api/elevenlabs/generate-and-play" \
     -H 'Content-Type: application/json' -d '{"text":"Testing my jaw timing one two three","characterId":<charId>}'
   ```
   PASS (watch the SECOND play): the jaw starts just before the sound — by less than about a
   syllable (≈150 ms). FAIL: the jaw has visibly finished (or mostly finished) before any
   sound starts. Tune by raising `audioLeadTimeMs` (positive = delay the jaw), ~50 ms at a
   time; the endpoint targets the ACTIVE config automatically and needs no restart:
   ```bash
   curl -sk -X POST "https://$IP:3000/setup/jaw-animation/api/jaw-animation/<charId>" \
     -H 'Content-Type: application/json' -d '{"audioLeadTimeMs":120}'
   ```
4. **Camera (Orlok)** — on the node:
   `curl -s -o /tmp/f.jpg -w '%{http_code} %{size_download}\n' 'http://localhost:8090/?action=snapshot'`
   PASS: `200` AND `size_download` > 0 (tens of KB). A clean 15fps start log with 0 bytes is
   the documented USB-power failure (OPERATOR-TODO §A) — the powered hub is the fix.

## 3. Open items this checklist closes (2026-08-22)

### K — Sir Dragomir (Knight)

**CHANNEL MAP IS FINAL (operator ruling 2026-08-22): jaw=3, head=7 (multi-turn 900°), box=11 —
`docs/hardware/PCA9685-CHANNEL-MAP-DRAGOMIR.md`. Channel numbers quoted inside the K-items below
are the history of how we got here, not the map.**

- **K1. ✅ RESOLVED 2026-08-22 (verdict from the bench): NOTHING is electrically dead.**
  Jaw drives great on ch1, the magic box is great, and the head servo is ALIVE on ch4 —
  the operator got it rotating. The 2026-08-19 "+0.4 dB / dead channel" reading is
  closed as a probe artifact (the follow-up multi-scale probe commanded ~4 µs, below the
  deadband). What made the head "occasionally rotate all the way around and stress the
  wires" was the SOFTWARE scale bug, fixed in v10.4.0 — see K3.
- **K2. The head (part 1) stays hands-off until K3 is complete.** The scale bug is fixed
  in software, but no cable-safe window has been measured yet, and the paths that refuse
  it are only the ones that require a measured window (poses, scenes, head tracking) plus
  the `physical-faults.json` advisory that keeps automated pickers away. **Direct API
  commands are NOT refused** — a nudge/goto/test on part 1 WILL drive the head. Only the
  K3 procedure commands it, eyes on the cabling.
- **K3. Calibrate the head — the real-degree path (NEW, requires the v10.4.0 deploy).**
  The software now speaks the Stingray-2's REAL degrees (0–900) end to end: the
  calibration page shows a 0–900 slider tagged "multi-turn: REAL travel", goto/nudge are
  real degrees, and the wrapper conversion happens once, verified by unit test
  (real 450° → `move_to_pca_multi <ch> 900`). Procedure, in order, EYES ON THE CABLING
  THE WHOLE TIME:
  1. Get the code onto the node. The doctrine is rsync deploy (`npm run deploy:all`)
     from a checkout that is already current. A bare `git pull` ON a node will abort
     against its local edits to tracked data files (parts.json is node-local BY DESIGN)
     — when deploying isn't available, take CODE paths only, never `data/`:
     ```bash
     cd /home/remote/MonsterBox
     git fetch origin main
     git checkout origin/main -- server services routes views public python_wrappers \
       scripts tests config/physical-faults.json config/animatronics.json install.sh package.json
     sudo systemctl restart monsterbox.service
     grep -c "maxAngleDeg" server/calibration/router.js   # ≥1 proves the fix landed (HEAD won't move)
     ```
  2. Declare the real range on the node's own part config (parts.json never deploys):
     ```bash
     curl -sk -X POST "https://192.168.8.130:3000/setup/calibration/api/parts/1/overrides" \
       -H 'Content-Type: application/json' -d '{"overrides":{"rotationRangeDeg":900,"servoType":"multi-turn"}}'
     ```
  3. Open `https://192.168.8.130:3000/setup/calibration`, select the Head Servo — the
     control must now read **0–900** with the multi-turn chip. If it still shows 0–180,
     the deploy or step 2 did not land; stop.
  4. FIRST MOVE IS THE RISKY ONE — the software cannot know how many turns in the head
     physically sits, so the first goto may travel up to the full distance to its target.
     Slack the head cabling by hand, pick a target near where the head currently points
     (mid-travel ≈ 450 if it looks centered), send the goto, hand on the power switch.
     **Plug/unplug rule (learned the hard way at this bench): a channel HOLDS its last
     pulse, so plugging a servo lead into a live channel slams the servo to that stale
     position and holds it there under power. Press the Release button on the part (or
     `POST /api/calibration/<partId>/release`) BEFORE connecting or disconnecting any
     servo lead — released, the servo goes limp and plugs in safely; the next move
     re-energizes it.**
  5. From there it is ordinary calibration IN REAL DEGREES: nudge steps scale with
     the range so each press clears the servo's deadband — on the 900° head
     **fine = 10° real, med = 25°, coarse = 75°** (the same pulse step a standard
     servo gets from 2/5/15). Nudge to the safe counter-clockwise limit →
     **Set Min**; nudge to the safe clockwise limit → **Set Max**; keep BOTH limits
     well inside cable slack — the window is the cable guard, so give it margin,
     not maximum travel.
  6. Flip **"Calibrated (trusted by runtime)"**, then remove the char-4 part-1 entry from
     `config/physical-faults.json` in the repo, commit, deploy.
  PASS: the head jogs in small, predictable real-degree steps, reaches both window ends
  without cable strain, refuses to move past them without `calibrationOverride`, and the
  panel shows the measured window with no "(unmeasured)" suffix.
  Two cautions that came out of the adversarial code review (both fixed, both worth
  knowing): any preset, pose, or scene step authored for part 1 BEFORE v10.4.0 is in
  stale units — delete rather than trust it (none are known to exist); and the manual
  Move control on the calibration page sends `calibrationOverride` with a default of
  mid-travel (450) — type your target before pressing Move, never press it blind.
- **K4. New XVF3800 mic + speaker (installed 2026-08-22, same array model as Orlok's) —
  audio bring-up.** The array ships its mono DAC at −20 dB and only PyAudio can capture
  from it; every trap has a known fix:
  1. **Mixer normalization FIRST** (the "inaudible with every layer healthy" trap):
     ```bash
     ssh remote@192.168.8.130
     for card in $(aplay -l | awk -F'[ :]' '/reSpeaker XVF3800/ {print $2}' | sort -u); do
       amixer -c "$card" -q sset 'PCM',1 100% unmute; done
     sudo alsactl store
     bash /home/remote/MonsterBox/scripts/configure-wireplumber.sh remote   # no-suspend rule
     ```
     PASS: `amixer -c <card> sget 'PCM',1` shows `[100%] [0.00dB]`.
  2. **Point the speaker part at the explicit sink** (read the exact name with
     `wpctl status` — serial differs per unit), and the mic part at the array:
     ```bash
     curl -sk -X POST "https://192.168.8.130:3000/setup/calibration/api/parts/6/overrides" \
       -H 'Content-Type: application/json' \
       -d '{"overrides":{"audioDeviceId":"<exact sink name from wpctl status>"}}'
     ```
  3. **Capture proof — FRAMES, not device-open** (on the node):
     ```bash
     cd /home/remote/MonsterBox
     python3 python_wrappers/microphone_cli.py record_wav default 16000 1 3 > /tmp/mic-test.wav
     ls -la /tmp/mic-test.wav   # PASS ≈96 KB; ~44 bytes = header only = zero frames = FAIL
     ```
  4. **Speaker + ear-check**: `generate-and-play` a line (§2.3 curl with charId 4), then
     from Orlok `npm run earcheck`. PASS: Sir Dragomir's line reads `VERDICT: AUDIBLE`.
  5. **Re-tune the canon BY EAR**: his `sinkVolume: 0.55` in `config/animatronics.json`
     was tuned for the OLD speaker. While a line plays:
     `wpctl set-volume @DEFAULT_AUDIO_SINK@ <v>` until right, then write the new value
     into the MAIN repo's `config/animatronics.json`, commit, `npm run deploy:all`.
- **K5. New camera (installed 2026-08-22, picture confirmed by eye).** Proof beyond the
  eyeball: MJPEG snapshot on the node —
  `curl -s -o /tmp/f.jpg -w '%{http_code} %{size_download}\n' 'http://localhost:8090/?action=snapshot'`
  PASS: `200` + tens of KB. Then confirm the Fleet Command Center card streams it
  (`/api/orchestration/animatronic/4/webcam-stream`).

### O — Orlok

- **O1. Bow At The Waist ("back bend")** — operator saw it working 2026-08-22 ("he's bent
  over right now"). It is listed broken in `config/physical-faults.json` (char 3, part 3),
  and its wiring records CONTRADICT each other: the part's description says RPWM=21/LPWM=19
  while its data fields say `rpwmPin:19 / lpwmPin:21` (both in `data/character-3/parts.json`
  ON THE NODE) — the swap inverts direction, so "extend" may physically retract.
  Test: open `https://192.168.8.120:3000/setup/calibration`, select **Bow At The Waist** in
  the device list, Controls tab → set the duration box to **300 ms** → press **Extend**,
  watch the mechanism, then **Retract** (these use jog-raw: NO position limits — keep the
  pulses short and eyes on it).
  - PASS (working): Extend physically extends AND Retract physically retracts, on **3
    attempts ≥15 min apart** (≥30 min span). Then: remove the part-3 entry from
    `config/physical-faults.json` in the repo, fix whichever wiring record the meter proves
    wrong in the NODE's `data/character-3/parts.json`, commit the faults change, and run
    `npm run deploy:all` from Orlok (the faults file travels by deploy, parts.json does not).
  - INTERMITTENT (works sometimes): leave the faults entry; write down in OPERATOR-TODO what
    preceded each failure (command, time powered, rail voltage if metered).
  - Direction inverted (extend retracts): the wiring-record contradiction is live — meter
    which record is true, correct the other, retest before any pass.
- **O2. Elbow (4) / Forearm (5)** stay broken-listed and hands-off (fused rail, blown twice).
- **O3. Head window 3–169°** — on `https://192.168.8.120:3000/setup/calibration`, select the
  head servo (part 15): jog to the window minimum, then the maximum. PASS: the head
  physically reaches both ends WITHOUT touching a hard stop or binding, and the panel shows
  Min 3° / Max 169° without an "(unmeasured)" suffix. Then flip the **"Calibrated (trusted
  by runtime)"** switch in the same calibration panel (below the Sweep Test button).
- **O4. Liveness watchdog** —
  `sudo bash /home/remote/MonsterBox/scripts/install-monsterbox-watchdog.sh`, then
  `sudo systemctl start monsterbox-watchdog.service && journalctl -u monsterbox-watchdog -n 10`.
  PASS: only systemd `Starting`/`Finished` lines. ANY line prefixed `[monsterbox-watchdog]`
  is a finding — `/health check failed (N/3)` means probes are failing;
  `restarting monsterbox.service` means it already fired. Repeat per node (OPERATOR-TODO §G).
- **O5. Mic input gain — first hardware run of the F7 fix.** On
  `https://192.168.8.120:3000/setup/calibration`, select the microphone part, move the
  **Input Gain** slider to a value you'll recognize (say **70%**) — the status line must say
  "saved", not "NOT saved". Then `sudo systemctl restart monsterbox` and check both:
  `grep "input gain restored" /var/log/monsterbox.log` → must show
  `Mic input gain restored to 70% (<mic name>)`, and
  `wpctl get-volume @DEFAULT_AUDIO_SOURCE@` → must read `Volume: 0.70`.
  A value that silently reverted = the fix failed on hardware; capture `.err` and report.

### M — Mina — UNDER REBUILD (operator decision, 2026-08-22)

**Do not run this checklist against Mina until the rebuild lands — run
`docs/hardware/MINA-REBUILD.md` instead** (pre-teardown backup FIRST, hardware items to
close while she is open, provisioning, and her acceptance run, which loops back here). Her
sign-off column stays blank until the acceptance run passes.

Reference triage for a future "reachable but questionable" state (not for the rebuild):
```bash
ssh remote@192.168.8.140 'vcgencmd get_throttled; journalctl -k -b | grep -c over-current; uptime'
ssh remote@192.168.8.140 'sudo systemctl show monsterbox -p NRestarts,ActiveEnterTimestamp'
ssh remote@192.168.8.140 'tail -80 /var/log/monsterbox.err'
```
If she hangs: capture first (`journalctl -b -1 -e`, `.err` tail, over-current count), reboot
second — "a reboot fixes her and nothing else does" is itself the finding.

### F — Fleet, after all live nodes pass

```bash
cd /home/remote/MonsterBox
npm run check:discovery
# PASS: the summary line "✓ Every node is reachable and discovered by its peers."
# EXCEPTION while Mina is under rebuild: her row reading Unreachable is expected;
# every other cell must be ✓.

npm run earcheck        # from Orlok only — PASS per §2.2: VERDICT: AUDIBLE per live node

npm run test:system     # run ON EACH live node being signed off (it exercises that node's own audio/hardware state)
# PASS: mocha reports 0 failing. Tolerated only if green on a re-run: the three documented
# intermittents (VU meter, jaw animation save config, calibration timeout — CLAUDE.md).
# Any other failure is a real regression and blocks sign-off.

wpctl get-volume @DEFAULT_AUDIO_SINK@
# PASS on the node that ran the suite: still at that node's canon (the suite's
# capture/restore hooks are what this proves), and speaker-mute still false (§1).
```

## 4. Sign-off

| Check | Orlok (.120) | Dragomir (.130) | Mina (.140) |
|---|---|---|---|
| §1 basics all PASS (version+commit match, throttled 0x0, over-current 0) | | | UNDER REBUILD |
| mute false, sink at canon | | | |
| servo proof: part physically moved, eyes on | | | |
| ear-check `VERDICT: AUDIBLE` | | | |
| jaw sync: leads ≤ ~150 ms on the warm play (§2.3) | | | |
| node items (K1/K2 · O1–O5 · MINA-REBUILD §4) | | | |

Date/initials per cell. A blank cell is an open item, not an assumed pass.
