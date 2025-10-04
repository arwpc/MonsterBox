# MonsterBox Orlok Deployment - Quick Reference

## Character Network Map
```
Character 1: PumpkinHead     → 192.168.8.150
Character 2: Coffin Breaker  → 192.168.8.140
Character 3: Orlok           → 192.168.8.120 ⭐ PRIMARY
Character 4: Skulltalker     → 192.168.8.130
```

## Key Files and Locations

### On Each RPi
- **ElevenLabs Key**: `/etc/monsterbox/elevenlabs.key` (permissions 600)
- **MonsterBox Root**: `/home/remote/MonsterBox`
- **Service Logs**: `/tmp/monsterbox.out`
- **Character Data**: `/home/remote/MonsterBox/data/character-{id}/`

### In Repository
- **TTS Config**: `data/character-{id}/ai-config/tts-config.json`
- **Parts Config**: `data/character-{id}/parts.json`
- **Deployment Script**: `scripts/deploy-to-animatronic.sh`
- **Test Script**: `scripts/orlok-bringup-test.sh`

## Quick Commands

### Deploy to Orlok
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120
```

### SSH to Orlok
```bash
ssh remote@192.168.8.120
```

### Check ElevenLabs Key
```bash
# On RPi
ls -l /etc/monsterbox/elevenlabs.key
stat -c %a /etc/monsterbox/elevenlabs.key
KEY=$(cat /etc/monsterbox/elevenlabs.key)
curl -s -o /dev/null -w "%{http_code}\n" -H "xi-api-key: $KEY" https://api.elevenlabs.io/v1/user
```

### Restart MonsterBox Service
```bash
# On RPi
cd ~/MonsterBox
pkill -f "node.*MonsterBox" || true
nohup npm start > /tmp/monsterbox.out 2>&1 &
```

### Check Service Status
```bash
# On RPi
pgrep -f "node.*MonsterBox"
curl -s http://127.0.0.1:3000/api/elevenlabs/status | jq .
```

### View Logs
```bash
# On RPi
tail -f /tmp/monsterbox.out
# Or filtered:
egrep -i "(elevenlabs|tts|mpg123|error)" /tmp/monsterbox.out | tail -n 120
```

### Check PipeWire Sinks
```bash
# On RPi
wpctl status | sed -n '/Sinks:/,/Sources:/p' | head -n 25
```

### Test TTS (Orlok)
```bash
# On RPi (127.0.0.1)
curl -sS -X POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Orlok voice check. I am the ancient vampire.","characterId":3}'

# From dev machine (use IP)
curl -sS -X POST http://192.168.8.120:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Orlok voice check.","characterId":3}'
```

### Run Full Test Suite
```bash
# On RPi
cd ~/MonsterBox
./scripts/orlok-bringup-test.sh
```

## Service Ports
- **HTTP API**: 3000
- **ConvAI WebSocket**: 8795
- **Webcam Stream**: 8090

## API Endpoints

### Status
```bash
GET http://127.0.0.1:3000/api/elevenlabs/status
```

### TTS Config
```bash
GET http://127.0.0.1:3000/api/elevenlabs/tts/config
```

### Generate and Play
```bash
POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play
Body: {"text": "Hello", "characterId": 3}
```

## Troubleshooting Quick Fixes

### 401/403 from ElevenLabs
```bash
echo 'sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94' | sudo tee /etc/monsterbox/elevenlabs.key
sudo chmod 600 /etc/monsterbox/elevenlabs.key
cd ~/MonsterBox && pkill -f "node.*MonsterBox" && nohup npm start > /tmp/monsterbox.out 2>&1 &
```

### No Audio Output
```bash
# Check mpg123
mpg123 --version

# List sinks
wpctl status

# Test with known file
python3 ~/MonsterBox/python_wrappers/speaker_cli.py play \
  /usr/share/sounds/alsa/Front_Center.wav 80 --device <sink_name>
```

### Service Won't Start
```bash
# Check port
lsof -i :3000

# Check Node version
node --version

# Reinstall deps
cd ~/MonsterBox && npm install

# Check logs
tail -f /tmp/monsterbox.out
```

## Expected Responses

### Successful TTS
```json
{
  "success": true,
  "played": true,
  "device": "alsa_output.usb-...",
  "message": "TTS played on character 3 speaker",
  "text": "Orlok voice check. I am the ancient vampire.",
  "voiceId": "Tj9l48J9AJbry5yCP5eW"
}
```

### Valid ElevenLabs Key
```
200
```

### Service Running
```
✓ MonsterBox service is running
✓ MonsterBox API is responding on port 3000
```

## Code Changes Summary

### 1. ElevenLabsConfigService
- Now prefers `/etc/monsterbox/elevenlabs.key` (source of truth)
- Falls back to environment variable if file not found
- File: `services/elevenLabsConfigService.js`

### 2. Per-Character TTS Config
- Added `getTTSConfigForCharacter(characterId)` function
- Loads from `data/character-{id}/ai-config/tts-config.json`
- Falls back to global config if not found
- File: `services/aiConfigStore.js`

### 3. Generate-and-Play Endpoint
- Now uses per-character TTS configuration
- Returns voiceId in response for verification
- File: `routes/api/elevenLabsApiRoutes.js`

## Next Steps After Orlok Success

1. Deploy to Coffin Breaker (192.168.8.140)
2. Deploy to Skulltalker (192.168.8.130)
3. Deploy to PumpkinHead (192.168.8.150)
4. Assign unique voices to each character
5. Room-wide validation
6. ConvAI streaming tests
7. Cross-mic verification
8. Goblins video loop
9. Random poses during conversation
10. Orchestration system

