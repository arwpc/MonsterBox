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

- **K1. Jaw is physically on ch1** (operator moved it 2026-08-22 as the swap-in-known-good
  test: ch0 measured GOOD at +29 dB on 2026-08-19; the dead-channel suspect is the HEAD on
  ch4). Land the config on the node and get the verdict:
  ```bash
  curl -sk -X POST "https://192.168.8.130:3000/setup/calibration/api/parts/2/overrides" \
    -H 'Content-Type: application/json' -d '{"overrides":{"channel":1}}'
  curl -sk -X POST "https://192.168.8.130:3000/api/calibration/2/nudge" \
    -H 'Content-Type: application/json' -d '{"dir":"max","scale":"med"}'
  ```
  Jaw turns → **ch1 + V+ good; the head servo (part 1, ch4) is the dead element** → add a
  char-"4" entry for part "1" to `config/physical-faults.json` (copy the shape of the
  existing char-"3" entries in that file), commit, and deploy so automated code stops
  choosing it. Jaw does not turn → the ch1 channel/harness/power is the fault; meter V+ at
  the ch1 header pin against ch0's (they should match).
- **K2. Do NOT drive or calibrate the head (part 1)** until its 0–180-vs-900° scale bug is
  fixed — one UI degree is five real degrees; a sweep can wrap the head cabling
  (OPERATOR-TODO §C, second half).

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
