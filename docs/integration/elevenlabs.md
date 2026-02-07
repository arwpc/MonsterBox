## ElevenLabs Integration

MonsterBox uses ElevenLabs as its sole AI voice provider for Text-to-Speech (TTS), Speech-to-Text (STT), and Conversational AI.

### Current Models

| Service | Model | Description |
|---------|-------|-------------|
| TTS | `eleven_flash_v2_5` | Default — fastest (~75ms latency) |
| TTS | `eleven_multilingual_v2` | High-quality narration |
| STT | `scribe_v2` | Batch file transcription, 90+ languages |
| STT | `scribe_v2_realtime` | WebSocket streaming, ~150ms latency |

### API Key Configuration

Set `ELEVENLABS_API_KEY` in your environment or store it at `/etc/monsterbox/elevenlabs.key`:

```bash
# Environment variable
export ELEVENLABS_API_KEY=xi_your_api_key_here

# Or file-based (created by install.sh)
sudo mkdir -p /etc/monsterbox
echo -n 'xi_your_key' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null
sudo chmod 600 /etc/monsterbox/elevenlabs.key
```

### Per-Character Voice Configuration

Each character can have its own voice settings stored in `data/character-{N}/ai-config/tts-config.json`:

```json
{
  "model": "eleven_flash_v2_5",
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "stability": 0.5,
  "similarity_boost": 0.75,
  "style": 0,
  "output_format": "mp3_44100_128"
}
```

The system loads per-character config via `aiConfigStore.getTTSConfigForCharacter(characterId)`, falling back to the global config at `data/ai-config/tts-config.json`.

### Voice Catalog

Browse available voices at `/ai-management/tts`. The UI fetches voices from ElevenLabs and displays them with filters for gender, language, and accent. Each voice can be previewed before assignment to a character.

### TTS Quick Test

```bash
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from MonsterBox","characterId":3}'
```

### STT Quick Test

```bash
# Check STT capabilities
curl http://localhost:3000/api/elevenlabs/stt/capabilities

# Transcribe a file
curl -X POST http://localhost:3000/api/elevenlabs/stt/transcribe \
  -F "file=@audio.wav"
```

### Security Note

Never share your ElevenLabs API key publicly. Store it securely and restrict file permissions.

### More Information

See [ELEVENLABS_INTEGRATION.md](ELEVENLABS_INTEGRATION.md) for full architecture details.
