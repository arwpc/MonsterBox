# MonsterBox 5.2 – Operational Handoff (Copy‑Paste Ready)

This handoff is the single source of truth for deploying MonsterBox 5.2 to all five animatronics for Halloween. It includes a copy‑paste deploy script, verification steps, and links to the next‑agent prompt.

## TL;DR (run once from your dev box or Orlok)
1) Install a deploy key to each device (one‑time)
2) Deploy to all devices non‑interactively

```
# One‑time: generate and install key to each device
ssh-keygen -t ed25519 -C "monsterbox-deploy" -f ~/.ssh/monsterbox_deploy -N ""
for ip in 192.168.8.120 192.168.8.140 192.168.8.130 192.168.8.150 192.168.8.200; do 
  ssh-copy-id -i ~/.ssh/monsterbox_deploy.pub remote@$ip; 
  ssh -i ~/.ssh/monsterbox_deploy -o BatchMode=yes remote@$ip true; 
done

# Deploy using centralized config/animatronics.json
./scripts/handoff-device-deploy.sh --apply
```

## Known issues (must be addressed post‑deploy)
- PCA9685 servos are not functioning on Orlok (Character 3)
  - Suspect: I2C bus/addr, wiring, or PCA9685 service path; validate 0x40 address and power rails.
- Orlok’s webcam is not visible in UI
  - Suspect: mjpg‑streamer service down or wrong device; verify service on port 8090 and /dev/video0.

## Device inventory (authoritative)
Defined in config/animatronics.json (no hardcoded IPs in code):
- orlok → 192.168.8.120 (characterId 3)
- coffin → 192.168.8.140 (characterId 2)
- skulltalker → 192.168.8.130 (characterId 4)
- pumpkinhead → 192.168.8.150 (characterId 1)
- groundbreaker → 192.168.8.200 (characterId 5)
- goblin (display) → 192.168.8.160

## Copy‑paste: All‑in‑one handoff deploy script
Paste into your terminal to install the deploy key (if needed) and deploy to all devices using config/animatronics.json. Requires jq.

```
#!/usr/bin/env bash
set -euo pipefail
CONFIG_FILE="$(pwd)/config/animatronics.json"
DEPLOY_KEY="${HOME}/.ssh/monsterbox_deploy"

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq is required (sudo apt-get install -y jq)"; exit 1; fi

# Generate key if missing
if [[ ! -f "${DEPLOY_KEY}.pub" ]]; then
  echo "🔑 Generating deploy key at ${DEPLOY_KEY}";
  ssh-keygen -t ed25519 -C "monsterbox-deploy" -f "$DEPLOY_KEY" -N ""; fi

# Read devices (exclude goblin)
mapfile -t DEVICES < <(jq -r 'to_entries | map(select(.key != "goblin")) | .[].key' "$CONFIG_FILE")

for dev in "${DEVICES[@]}"; do
  ip=$(jq -r --arg k "$dev" '.[$k].ip // .[$k].host' "$CONFIG_FILE")
  cid=$(jq -r --arg k "$dev" '.[$k].characterId // empty' "$CONFIG_FILE")
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; echo "📦 $dev → $ip (characterId=${cid:-n/a})";
  echo "→ Installing deploy key"; ssh-copy-id -i "${DEPLOY_KEY}.pub" "remote@${ip}" || true
  echo "→ Deploying"; bash ./scripts/deploy-to-animatronic.sh "${cid}" "${ip}"
  echo "→ Health"; ssh -o BatchMode=yes "remote@${ip}" "curl -sf http://127.0.0.1:3000/health || curl -sf http://127.0.0.1:3000/ || true" || true
  echo "";
done

echo "🎃 Deploy complete. Proceed to validation below."
```

Tip: Save as run‑handoff.sh and execute: `bash run-handoff.sh`

## Validation checklist (per device)
- UI: Navbar shows “MonsterBox 5.2”; no Quirks Mode warning in console
- Calibration: Jog actuators 2000 ms at 60% (Left/Right arm, Loom Over where applicable)
- Audio: Microphone VU meter active; TTS auto‑plays on Character’s speaker
- Webcam: MJPEG at http://DEVICE_IP:8090 responds and shows stream in UI
- First‑run: If no character selected, Skull‑themed selection appears and persists
- Images: Character image thumbnail visible (navbar, selection, manage forms; tile on home)

Quick commands:
```
# Ping all
for h in orlok.lan pumpkinhead.lan coffin.lan skulltalker.lan groundbreaker.lan; do ping -c 3 "$h"; done

# Health check (local on device)
curl -sf http://127.0.0.1:3000/health || curl -sf http://127.0.0.1:3000/

# Jog Left Arm example (ID 1)
curl -s -X POST http://127.0.0.1:3000/setup/calibration/api/linear_actuator/1/jog \
  -H "Content-Type: application/json" -d '{"direction":"extend","speed":60,"duration":2000}'
```

## Troubleshooting pointers
- PCA9685 on Orlok
  - Check I2C devices: `sudo i2cdetect -y 1` (expect 0x40)
  - Verify 5V and GND rails to servos and board; reseat ribbon cables
  - Confirm PCA9685 frequency and address in code if applicable
- Orlok webcam
  - Check device: `v4l2-ctl --list-devices` (expect /dev/video0)
  - mjpg‑streamer: ensure service is running and listening on 8090; restart if needed

## Next agent prompt
See: docs/NEXT_AGENT_PROMPT_5_2.md

## Notes
- No hardcoded IPs in app logic; device addresses come from config/animatronics.json
- Prefer hostnames (*.lan) where possible; IPs are for validation/deploy scripts only
- If jq is missing: `sudo apt-get install -y jq`

