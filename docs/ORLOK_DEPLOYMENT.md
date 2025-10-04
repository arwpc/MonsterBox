# Orlok Bring-Up and Deployment Guide

## Mission
Get Orlok (characterId 3, 192.168.8.120) speaking audibly via ElevenLabs TTS with real-time ConvAI streaming gapless audio, then deploy to all animatronics.

## System Context

### Network Configuration
- **Control Plane**: Exists but each character runs stand-alone on its own RPi 4B
- **IPv4 Only**: Use `127.0.0.1` for local calls (not `localhost`)
- **Shared ElevenLabs API Key**: `/etc/monsterbox/elevenlabs.key` (permissions 600)

### Services on Each RPi
- HTTP API: port 3000
- Real-time ConvAI WebSocket: port 8795
- Webcam stream: port 8090

### Character Mapping
- Character 1: PumpkinHead (192.168.8.150)
- Character 2: Coffin Breaker (192.168.8.140)
- Character 3: Orlok (192.168.8.120) - **Primary focus**
- Character 4: Skulltalker (192.168.8.130)

## Phase 1: Orlok Bring-Up

### Prerequisites
1. SSH access to Orlok (192.168.8.120)
2. ElevenLabs API key ready
3. MonsterBox code updated with latest changes

### Step 1: Verify ElevenLabs API Key

SSH to Orlok:
```bash
ssh remote@192.168.8.120
```

Check if key file exists:
```bash
ls -l /etc/monsterbox/elevenlabs.key
stat -c %a /etc/monsterbox/elevenlabs.key
```

If not exists or wrong permissions:
```bash
echo 'sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94' | sudo tee /etc/monsterbox/elevenlabs.key
sudo chmod 600 /etc/monsterbox/elevenlabs.key
```

Test key validity:
```bash
KEY=$(cat /etc/monsterbox/elevenlabs.key)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "xi-api-key: $KEY" \
  https://api.elevenlabs.io/v1/user
```
Expected: `200`

### Step 2: Deploy Code to Orlok

From your development machine:
```bash
./scripts/deploy-to-animatronic.sh 3 192.168.8.120
```

This will:
- Sync code to Orlok
- Install dependencies if needed
- Restart MonsterBox service
- Verify service is running

### Step 3: Validate Speaker Routing

SSH to Orlok and check PipeWire sinks:
```bash
wpctl status | sed -n '/Sinks:/,/Sources:/p' | head -n 25
```

Identify the correct sink for Orlok's speaker (likely USB audio or HDMI).

Update speaker part in `data/character-3/parts.json`:
```json
{
  "id": "24",
  "name": "Speaker-Orlok",
  "type": "speaker",
  "config": {
    "device": "alsa_output.usb-YOUR_DEVICE_HERE.analog-stereo",
    "volume": 80
  }
}
```

Or use `outputDevice` field:
```json
{
  "id": "24",
  "name": "Speaker-Orlok",
  "type": "speaker",
  "outputDevice": "alsa_output.usb-YOUR_DEVICE_HERE.analog-stereo",
  "config": {
    "volume": 80
  }
}
```

### Step 4: Run Comprehensive Test

On Orlok:
```bash
cd ~/MonsterBox
./scripts/orlok-bringup-test.sh
```

This will test:
1. ElevenLabs API key validity
2. MonsterBox service status
3. PipeWire audio sinks
4. Character TTS configuration
5. Speaker part configuration
6. TTS generation and playback
7. Recent logs for errors

### Step 5: Manual TTS Test

If automated test fails, try manual test:
```bash
curl -sS -X POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Orlok voice check. I am the ancient vampire.","characterId":3}'
```

Expected response:
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

### Step 6: Check Logs

If issues occur:
```bash
tail -f /tmp/monsterbox.out
# Or filter for relevant logs:
egrep -i "(elevenlabs|tts|mpg123|error)" /tmp/monsterbox.out | tail -n 120
```

### Step 7: Test ConvAI WebSocket Streaming

Access the web UI:
```
http://192.168.8.120:3000
```

Navigate to the conversation interface and test real-time ConvAI:
1. Select Orlok (Character 3)
2. Start a conversation
3. Verify gapless audio playback
4. Check for any chunk gaps or delays

## Troubleshooting

### Issue: HTTP 401/403 from ElevenLabs
**Solution**: Replace key file with fresh working key
```bash
echo 'sk_NEW_KEY_HERE' | sudo tee /etc/monsterbox/elevenlabs.key
sudo chmod 600 /etc/monsterbox/elevenlabs.key
# Restart service
cd ~/MonsterBox && pkill -f "node.*MonsterBox" && nohup npm start > /tmp/monsterbox.out 2>&1 &
```

### Issue: No Audio Output
**Checks**:
1. Verify mpg123 is installed: `mpg123 --version`
2. Check PipeWire sink is correct in parts.json
3. Test with known audio file:
```bash
python3 ~/MonsterBox/python_wrappers/speaker_cli.py play \
  /usr/share/sounds/alsa/Front_Center.wav 80 --device <sink_name>
```
4. Check logs for mpg123 errors

### Issue: TTS 401 Despite Valid Key
**Solution**: Ensure code is updated with file-first key reading
```bash
cd ~/MonsterBox
git pull  # or rsync from dev machine
pkill -f "node.*MonsterBox"
nohup npm start > /tmp/monsterbox.out 2>&1 &
```

### Issue: Service Won't Start
**Checks**:
1. Check for port conflicts: `lsof -i :3000`
2. Check Node.js version: `node --version` (should be 18+)
3. Check dependencies: `cd ~/MonsterBox && npm install`
4. Check logs: `tail -f /tmp/monsterbox.out`

## Phase 2: Deploy to All Animatronics

Once Orlok is confirmed working, deploy to other animatronics:

### Coffin Breaker (Character 2, 192.168.8.140)
```bash
./scripts/deploy-to-animatronic.sh 2 192.168.8.140
ssh remote@192.168.8.140
cd ~/MonsterBox && ./scripts/orlok-bringup-test.sh
```

### Skulltalker (Character 4, 192.168.8.130)
```bash
./scripts/deploy-to-animatronic.sh 4 192.168.8.130
ssh remote@192.168.8.130
cd ~/MonsterBox && ./scripts/orlok-bringup-test.sh
```

### PumpkinHead (Character 1, 192.168.8.150)
```bash
./scripts/deploy-to-animatronic.sh 1 192.168.8.150
ssh remote@192.168.8.150
cd ~/MonsterBox && ./scripts/orlok-bringup-test.sh
```

### Per-Character TTS Configuration

Each character should have unique voice. Update `data/character-{id}/ai-config/tts-config.json`:

**Character 1 (PumpkinHead)**: TBD - assign unique voice
**Character 2 (Coffin Breaker)**: TBD - assign unique voice
**Character 3 (Orlok)**: `Tj9l48J9AJbry5yCP5eW` (Nosferatu - current)
**Character 4 (Skulltalker)**: TBD - assign unique voice

## Acceptance Criteria

- [ ] Orlok speaks audibly in Orlok's own voice on command (generate-and-play)
- [ ] Orlok speaks in live ConvAI mode with gapless streaming audio
- [ ] Correct routing to Orlok's speaker sink
- [ ] No ElevenLabs 401/403 errors
- [ ] /v1/user returns 200 from Orlok using key file
- [ ] Speaker routes and volumes are correct
- [ ] All animatronics pass the same checks
- [ ] Code and config patterns ready for roll-out

## Next Phases

- **Phase 3**: Room-wide validation and cross-mic verification
- **Phase 4**: Goblins video loop (HDMI)
- **Phase 5**: Random poses during conversation
- **Phase 6**: Orchestration system (broadcast/multicast)

