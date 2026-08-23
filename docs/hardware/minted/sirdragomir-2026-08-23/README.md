# MINTED: Sir Dragomir hardware config — 2026-08-23

Operator-directed permanent record ("mint this config so that we never have
these issues with him again"). This is the KNOWN-GOOD state of the knight's
node-local hardware files, captured from the live node immediately after the
full from-scratch calibration of 2026-08-23, with every part working, every
window measured by eye at the bench, and every stamp flipped.

**This snapshot is the recovery record, not the live state.** The live files
on the node keep drifting (that is their job); this directory is what you
restore FROM when the node's copies are lost or wrecked.

## What is minted

| Part | Channel | Type | Calibrated window | Notes |
|------|---------|------|-------------------|-------|
| 1 Head Servo | **7** | multi-turn, 900° real | **323–491** (168° usable, center preset 390) | cable-safe with margin |
| 2 Jaw Servo | **3** | standard | **27–74** | |
| 3 Magic Box Servo | **11** | standard, **inverted** | **16–178** (min=closed, max=open) | |
| 4 Cam | — | webcam | — | /dev/video0, tuned controls captured |
| 5 Microphone | — | XVF3800 array | — | PyAudio-only capture |
| 6 Speaker | — | XVF3800 out | — | volume 85 |

Channel map law: `docs/hardware/PCA9685-CHANNEL-MAP-DRAGOMIR.md`.

## Restore procedure (node loses its files, SD dies, or state is wrecked)

On the node, from `/home/remote/MonsterBox`:

```bash
# 1. Stop the service so nothing rewrites state mid-restore
sudo systemctl stop monsterbox.service

# 2. Put the minted files in place (parts wholesale; calibration merge-safe)
cp docs/hardware/minted/sirdragomir-2026-08-23/parts.json data/character-4/parts.json
python3 - <<'EOF'
import json, os
minted = json.load(open('docs/hardware/minted/sirdragomir-2026-08-23/calibration_profiles.json'))
path = 'data/calibration_profiles.json'
live = json.load(open(path)) if os.path.exists(path) else {}
live.update(minted)   # only the 4:* keys — other characters' entries untouched
json.dump(live, open(path, 'w'), indent=2)
print('restored keys:', sorted(minted))
EOF

# 3. Start fresh (the server evicts any stale servo daemon on its own)
sudo systemctl start monsterbox.service
```

Then verify on `/setup/calibration`: head reads 0–900 multi-turn with window
323–491 and no "(unmeasured)" suffix; jaw 27–74; box 16–178 inverted; all
three stamped Calibrated. Prove motion by eye, never by the response body.

## Provenance

Captured from the live node readback pasted by the operator at
2026-08-23T01:25Z, minutes after `lastCalibratedAt` stamps of 00:26–00:28Z.
The node had just survived a full-Pi reboot with this state intact — these
files are exactly what the running, verified knight was using.
