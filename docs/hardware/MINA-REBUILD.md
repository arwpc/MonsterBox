# Mina Rebuild Runbook — tear-down, rebuild, and acceptance

Mina (char 2, hostname `mina`, 192.168.8.140) is being rebuilt (operator decision,
2026-08-22). This runbook makes the rebuild lossless and makes "Mina is back" a proven
state, not an impression. Run it in order.

## 1. BEFORE tear-down — back up the node-local data (DO THIS FIRST)

Mina's calibration, poses, part configs and voice identity exist ONLY on her SD card —
they are not in git and not on any other node. If the rebuild touches the SD card or
reimages the OS, this backup is the only thing standing between the rebuild and
re-measuring every servo from scratch.

From any LAN machine (or on Mina herself with a USB stick as the destination):

```bash
BACKUP=~/mina-backup-$(date +%Y%m%d)
mkdir -p "$BACKUP"

# The node-local operational state. scripts/deploy-to-animatronic.sh's exclusion list
# is the authority on what is per-node; this backup takes everything on it EXCEPT the
# disposable telemetry files (startup-health / performance-history / scene-analytics),
# which regenerate on their own and are deliberately not backed up:
scp -r remote@192.168.8.140:/home/remote/MonsterBox/data/character-2 "$BACKUP/"
scp remote@192.168.8.140:/home/remote/MonsterBox/data/calibration_profiles.json "$BACKUP/" 
scp remote@192.168.8.140:/home/remote/MonsterBox/data/actuator-positions.json "$BACKUP/" || true
scp remote@192.168.8.140:/home/remote/MonsterBox/data/manual-nodes.json "$BACKUP/" || true
scp remote@192.168.8.140:/home/remote/MonsterBox/data/speaker-state.json "$BACKUP/" || true
scp remote@192.168.8.140:/home/remote/MonsterBox/config/app-config.json "$BACKUP/"

# Secrets + system-level state that live OUTSIDE the repo:
ssh remote@192.168.8.140 'sudo cat /etc/monsterbox/env' > "$BACKUP/etc-monsterbox-env"   # API keys, SSH password
ssh remote@192.168.8.140 'crontab -l' > "$BACKUP/crontab.txt" || true
ssh remote@192.168.8.140 'cat /etc/default/monsterbox-cam 2>/dev/null' > "$BACKUP/monsterbox-cam" || true

ls -la "$BACKUP"   # eyeball it: character-2/ must contain parts.json, poses.json, super-powers.json, ai-config/
```

The backup is complete when `character-2/ai-config/tts-config.json` is present (her VOICE
IDENTITY — losing it means she refuses to speak rather than borrowing another voice) and
`calibration_profiles.json` is non-empty.

## 2. During the rebuild — hardware items to close while she is open

These are her standing hardware faults; the rebuild is the one time fixing them is cheap:

1. **USB 5 V rail over-current** (OPERATOR-TODO §4) — her rail has tripped repeatedly.
   The 2026-08-20 plan: remove the USB hub, plug camera and XVF3800 straight into the Pi
   (or fit a POWERED hub). Whatever the wiring ends up as, note it in OPERATOR-TODO.
2. **Neck ch8 + eye ch11 — treat as ONE shared V+/harness branch** (OPERATOR-TODO §E).
   ch8 receives correct, changing PWM and does not move; her eye laser proves nothing
   about V+ (it is a 3 V relay off the signal pin). With the harness exposed: meter V+
   at the neck/eye branch **against the jaw's V+ pin** (the jaw is proven powered) —
   pass = within ~0.2 V of it. If in doubt, move the known-good jaw servo PLUG to ch8,
   then ch11, and drive each channel through the part that owns it (server running on
   Mina; **neck = part 2, eye = part 3**):

   ```bash
   # jaw plug parked on ch8 → drive the NECK part:
   curl -sk -X POST https://192.168.8.140:3000/api/calibration/2/nudge \
     -H 'Content-Type: application/json' -d '{"dir":"max","scale":"med"}'
   # jaw plug parked on ch11 → drive the EYE part:
   curl -sk -X POST https://192.168.8.140:3000/api/calibration/3/nudge \
     -H 'Content-Type: application/json' -d '{"dir":"max","scale":"med"}'
   ```

   Pass = the known-good servo physically turns on that channel (same method that
   settled the Knight's channels). Put the jaw plug back on ch4 afterwards.
3. **Speaker `audioDeviceId` drift** — her node copy had drifted to `"default"` from the
   explicit XVF3800 sink (2026-08-21 finding). When restoring `parts.json`, set the
   speaker part's `audioDeviceId` back to the explicit sink name
   (`alsa_output.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_<SERIAL>-00.analog-stereo`).
   The `<SERIAL>` differs per unit — read the exact name off the node itself with
   `wpctl status` (Sinks section) or `pactl list short sinks`; copy it verbatim.

## 3. Fresh provisioning (if the OS/SD is reimaged)

1. Hostname MUST be `mina` — server startup maps hostname → character 2 through
   `config/animatronics.json`; a wrong hostname makes her boot as the wrong character.
2. Clone and install:

   ```bash
   git clone https://github.com/arwpc/MonsterBox /home/remote/MonsterBox
   cd /home/remote/MonsterBox && sudo bash install.sh
   ```

   The current install.sh provisions everything that used to be hand-applied: journald
   caps, logrotate, the liveness watchdog timer (UP-5), the WirePlumber no-suspend rule,
   and — new for this rebuild — **XVF3800 mixer normalization** (`'PCM',1` → 0 dB; the
   array ships at −20 dB, which made her "inaudible" with every software layer reading
   healthy). Pass = install.sh prints
   `XVF3800 card <n>: mono DAC ('PCM',1) normalized to 0 dB`; verify after with
   `amixer -c <card> sget 'PCM',1` showing `[100%]` / `[0.00dB]`.
3. Restore the §1 backup to the same paths (repo data files, `/etc/monsterbox/env`,
   crontab). `chown -R remote:remote` the restored data files.
4. `sudo systemctl restart monsterbox.service`.

## 4. Post-rebuild acceptance — run BENCH-CHECKLIST with these Mina-specific additions

Run `docs/hardware/BENCH-CHECKLIST.md` §1 and §2 for `192.168.8.140`, plus:

1. **Boot identity**: `/health` answers, and the boot log shows the hostname mapping —
   `grep 'Hostname' /var/log/monsterbox.log` must show `mina` mapping to character 2, and
   `curl -sk https://192.168.8.140:3000/setup/characters/api/current` must report
   `selectedCharacter` = **2**.
2. **USB rail verdict**: `journalctl -k -b | grep -c over-current` → **0** after ≥1 h up
   with camera + array attached. Nonzero = §2.1 is not actually fixed.
3. **Capture proof (XVF3800 traps doc applies)**: probe with the app's own path and
   judge on FRAMES. On the node:

   ```bash
   cd /home/remote/MonsterBox
   python3 python_wrappers/microphone_cli.py record_wav default 16000 1 3 > /tmp/mic-test.wav
   ls -la /tmp/mic-test.wav
   python3 -c "import wave,audioop; w=wave.open('/tmp/mic-test.wav');
   d=w.readframes(w.getnframes()); print('bytes:',len(d),'rms:',audioop.rms(d,2))"
   ```

   PASS = ~96 KB file (3 s × 16 kHz × 2 bytes) AND rms > 0 while you speak at it.
   A ~44-byte file is a WAV header with ZERO frames — capture failure, whatever
   the exit code said. `parec`/`ffmpeg`/`arecord` opening the device proves nothing.
4. **Ear-check**: from Orlok, `npm run earcheck`; her transcript should be word-legible
   as it was on 2026-08-20 ("Mina here, testing my voice…").
5. **Sink volume re-tune BY EAR**: her canonical 1.0 was set while the DAC was −20 dB.
   With the mixer normalized, 1.0 may now be too loud. While a line plays, adjust live
   with `wpctl set-volume @DEFAULT_AUDIO_SINK@ <v>` (e.g. `0.65`) until it sounds right;
   then write that value into `sinkVolume` for Mina in the MAIN repo's
   `config/animatronics.json`, commit, and `npm run deploy:all` (config/ deploys) —
   startup and the canonical-restore endpoints will hold her to it from then on.
6. **Neck/eye verdict** (§2.2): record moved/did-not-move per channel in OPERATOR-TODO §E
   — proven fixed, proven broken, or intermittent with its trigger. No "appears to work".
7. Sign her column off in BENCH-CHECKLIST §4.

## 5. While she is down

- The fleet treats her as offline; orchestration fan-outs time out against her by design
  and continue (verified behavior). No config change needed to "remove" her temporarily.
- Do not delete or edit her rows in `config/animatronics.json` — hostname mapping and her
  (re-tuned) canonical volume are needed the moment she is back.
