# Bench Checklist — proving all three animatronics stable, end to end

Purpose: a repeatable procedure to verify every live animatronic against the actual machine,
so "stable" is something anyone can re-establish without rediscovering the method. Run it
top to bottom at the bench (or over the LAN); it is also the closure procedure for the open
items from the 2026-08-21/22 v11 sessions.

Nodes: **Orlok** char 3 → `192.168.8.120` · **Sir Dragomir (Knight)** char 4 → `192.168.8.130` ·
**Mina** char 2 → `192.168.8.140`. All commands work from any machine on the LAN; `ssh remote@<ip>`
lands in `/home/remote`, so remote shell commands need `cd /home/remote/MonsterBox` first.

## 0. Ground rules — what counts as proof

- **A success field is not proof.** Proof is: the part moved (eyes on it), audio was heard
  (ear-check: record + transcribe), frames flowed (non-zero bytes AND non-zero RMS / a real
  JPEG with size > 0).
- **Grep the node, not the version string.** A node "running the fix" is proven by
  `cd /home/remote/MonsterBox && git rev-parse --short HEAD` and grepping for the changed symbol.
- **The failure reason lives in `.err`.** `tail -50 /var/log/monsterbox.err` after anything
  surprising; `/var/log/monsterbox.log` alone reads healthy while a part is refused.
- **Never drive on their own initiative:** Orlok parts 4+5 (shared fuse rail, has blown) and
  the Knight's 900° head (cable wrap). Operator direction only, and see §3-K2 before ANY
  head-servo motion.

## 1. Per-node basics (run for each of .120 / .130 / .140)

```bash
IP=192.168.8.120   # repeat with .130, .140
curl -sk "https://$IP:3000/health"                         # → status OK + version
curl -sk "https://$IP:3000/api/system/info" | head -c 300  # → uptime, hostname
ssh remote@$IP 'cd /home/remote/MonsterBox && git rev-parse --short HEAD && sudo systemctl show monsterbox -p NRestarts'
ssh remote@$IP 'vcgencmd get_throttled'                    # 0x0 = clean power history
ssh remote@$IP 'journalctl -k -b | grep -c "over-current"' # USB rail health; >0 = rail trouble
curl -sk "https://$IP:3000/conversation/api/speaker-mute"  # → {"muted":false} — MUST be false
ssh remote@$IP 'wpctl get-volume @DEFAULT_AUDIO_SINK@'     # vs canon: Orlok 1.30, Mina 1.00, Dragomir 0.55
```

Fix a drifted volume with the node's own canon (no restart needed):
`curl -sk -X POST "https://$IP:3000/api/system/volume/canonical"` — or fleet-wide from any node:
`curl -sk -X POST "https://<any>:3000/api/orchestration/volume/restore-canonical"`.

## 2. Per-node motion + voice proof

1. **Servo proof** — pick a part `config/physical-faults.json` does NOT list, then:
   `curl -sk -X POST "https://$IP:3000/api/calibration/<partId>/nudge" -H 'Content-Type: application/json' -d '{"dir":"max","scale":"fine"}'`
   Eyes on the part: it must physically move. (`fine` is a small step; repeat with `dir:"min"` to return.)
2. **Ear-check** — `cd /home/remote/MonsterBox && npm run earcheck` from **Orlok** (the node
   holding fleet SSH trust). A node scored `OFFLINE — no ssh` while `curl -sk https://<ip>:3000/health`
   answers is an earcheck artifact, not a down node.
3. **Jaw sync** — play a short say-line on the node's dashboard; jaw should LEAD by ≲150 ms warm.
   Tune with `audioLeadTimeMs` (positive = delay the jaw) via
   `POST /setup/jaw-animation/api/jaw-animation/<charId>` — it must land on the ACTIVE config.
4. **Camera (Orlok)** — `curl -s -o /tmp/f.jpg -w '%{http_code} %{size_download}\n' 'http://localhost:8090/?action=snapshot'`
   on the node. Proof is `200` AND `size_download > 0`. A clean 15fps start log with zero frames is
   the documented USB-power failure (OPERATOR-TODO §A) — the powered hub is the fix, not a restart.

## 3. Open items this checklist closes (2026-08-22)

### K — Sir Dragomir (Knight)

- **K1. Jaw is now physically on ch1** (operator moved it 2026-08-22; docs + repo config updated).
  Land it on the node and prove it:
  ```bash
  curl -sk -X POST "https://192.168.8.130:3000/setup/calibration/api/parts/2/overrides" \
    -H 'Content-Type: application/json' -d '{"overrides":{"channel":1}}'
  curl -sk -X POST "https://192.168.8.130:3000/api/calibration/2/nudge" \
    -H 'Content-Type: application/json' -d '{"dir":"max","scale":"med"}'
  ```
  Jaw turns → **record: ch1 + V+ good; head servo (ch4) is the dead element** → add a char-4
  entry to `config/physical-faults.json` for the head part so automated code stops choosing it.
  Jaw does not turn → the ch1 channel/harness/power is the fault; meter V+ at ch1 vs ch0.
- **K2. Do NOT calibrate the head** until its 0–180-vs-900° scale bug is fixed — one UI degree is
  five real degrees; a sweep will wrap the head cabling (OPERATOR-TODO §C, second half).

### O — Orlok

- **O1. Bow At The Waist ("back bend")** — operator saw it working 2026-08-22 ("he's bent over
  right now"). It is listed broken in `config/physical-faults.json` (char 3, part 3), and its
  wiring record self-contradicts (RPWM/LPWM swapped between description and data fields), so
  'extend' may physically retract. Prove it with SHORT jogs both directions from the Parts page,
  eyes on the mechanism, THEN:
  - Works both directions across 3 separate attempts ≥10 min apart → remove the part-3 entry
    from `config/physical-faults.json` (commit that; the file deploys) and fix whichever of the
    two wiring records is wrong.
  - Works sometimes → it is INTERMITTENT: leave the faults entry, and write down what preceded
    each failure (which command, how long powered, rail voltage if metered).
- **O2. Elbow (4) / Forearm (5)** stay broken-listed and hands-off (fused rail, blown twice).
- **O3. Head window 3–169°** — confirm at the rig (doc-sourced restore; OPERATOR-TODO §F), then
  stamp it Calibrated on the calibration page (the stamp switch is on the main page now).
- **O4. Liveness watchdog** — `sudo bash /home/remote/MonsterBox/scripts/install-monsterbox-watchdog.sh`,
  then `sudo systemctl start monsterbox-watchdog.service && journalctl -u monsterbox-watchdog -n 5`
  (silent run = healthy). Repeat per node. (OPERATOR-TODO §G.)
- **O5. Mic input gain** — set Gain on the calibration page, `sudo systemctl restart monsterbox`,
  confirm `wpctl` shows the source volume restored (the F7 fix; first hardware run).

### M — Mina — UNDER REBUILD (operator decision, 2026-08-22)

**Mina is being rebuilt. Do not run this section against her until the rebuild lands —
run `docs/hardware/MINA-REBUILD.md` instead** (pre-teardown backup FIRST, hardware items
to close while she is open, provisioning, and her acceptance run, which loops back to
this checklist). Her sign-off column stays blank until the acceptance run passes.

The triage below remains for reference / for the next time she is "reachable but
questionable" without a rebuild. In order, capture output as you go:
```bash
ssh remote@192.168.8.140 'vcgencmd get_throttled; journalctl -k -b | grep -c over-current; uptime'
ssh remote@192.168.8.140 'sudo systemctl show monsterbox -p NRestarts,ActiveEnterTimestamp'
ssh remote@192.168.8.140 'tail -80 /var/log/monsterbox.err'
curl -sk "https://192.168.8.140:3000/api/system/info"
```
- Her known fault class is the **USB 5 V rail tripping over-current** (OPERATOR-TODO §4) — a
  nonzero over-current count after this boot means the reboot fixed nothing and the §4 hardware
  work is still the answer.
- If she hangs again: **capture first** (`journalctl -b -1 -e`, `.err` tail, over-current count),
  reboot second. "A reboot fixes her and nothing else does" is itself the finding — write down
  what preceded the hang.

### F — Fleet, after all nodes pass

```bash
cd /home/remote/MonsterBox && npm run check:discovery     # who-sees-whom matrix
npm run earcheck                                          # from Orlok only
npm run test:system                                       # on the node — must leave mute OFF and volume at canon
wpctl get-volume @DEFAULT_AUDIO_SINK@                     # canon survived the suite = the capture/restore fix holds
```

## 4. Sign-off

| Check | Orlok (.120) | Dragomir (.130) | Mina (.140) |
|---|---|---|---|
| health + version + commit | | | |
| power history clean (throttled=0x0, over-current=0) | | | |
| mute OFF, volume at canon | | | |
| servo proof (eyes on motion) | | | |
| ear-check heard | | | |
| jaw sync acceptable | | | |
| node-specific items (K/O/M above) | | | |

Date/initials per cell. A blank cell is an open item, not an assumed pass.
