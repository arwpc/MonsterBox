# ElevenLabs Integration

## Overview

MonsterBox uses **ElevenLabs** as its sole AI voice provider, replacing the legacy three-API system (OpenAI Whisper STT + ChatGPT + TopMediai TTS) with a unified ElevenLabs solution.

## Architecture

```
User Input → ElevenLabs Conversational AI → Audio Output
           ↓
    Real-time WebSocket Connection (port 8795)
           ↓
    Integrated STT + AI Agent + TTS
```

### Services
| Service | File | Purpose |
|---------|------|---------|
| TTS | `services/elevenLabsTTSService.js` | Voice synthesis via REST API |
| STT (batch) | `services/elevenLabsSTTService.js` | File-based transcription |
| STT (realtime) | `services/elevenLabsRealtimeSTTService.js` | WebSocket streaming STT |
| WebSocket | `services/elevenLabsWebSocketService.js` | Conversation bridge (port 8795) |
| Config | `services/aiConfigStore.js` | Per-character AI config management |
| Playback | `services/serverPlaybackService.js` | Audio playback on character speakers |
| Server Mic | `services/serverSTTListener.js` | PipeWire microphone input for STT |

## Models

| Service | Model ID | Description |
|---------|----------|-------------|
| TTS | `eleven_flash_v2_5` | Default — lowest latency (~75ms) |
| TTS | `eleven_multilingual_v2` | High-quality, narration use cases |
| STT | `scribe_v2` | Batch transcription, 90+ languages, keyterm prompting |
| STT | `scribe_v2_realtime` | WebSocket streaming, ~150ms latency, VAD |

## Per-Character Configuration

Each character can have its own TTS and STT settings:

```
data/character-{N}/ai-config/
├── tts-config.json    # voice_id, model, stability, similarity
└── stt-config.json    # model, language, sample rate, VAD
```

Loaded via `aiConfigStore.getTTSConfigForCharacter(characterId)` with fallback to global `data/ai-config/tts-config.json`.

## UI Components

| Route | Purpose |
|-------|---------|
| `/ai-management` | Main dashboard with ElevenLabs status |
| `/ai-management/stt` | STT configuration (model, language, VAD, audio filters) |
| `/ai-management/agents` | ElevenLabs Agent management and character assignment |
| `/ai-management/tts` | TTS voice configuration (model, voice, stability, similarity) |
| `/conversation` | Real-time voice chat interface |

## API Endpoints

### TTS
```bash
# Generate speech and play on character speaker
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","characterId":3}'

# List voices
curl http://localhost:3000/api/elevenlabs/voices
```

### STT
```bash
# Capabilities
curl http://localhost:3000/api/elevenlabs/stt/capabilities

# Transcribe audio file
curl -X POST http://localhost:3000/api/elevenlabs/stt/transcribe \
  -F "file=@audio.wav"

# Realtime STT status
curl http://localhost:3000/api/elevenlabs/stt/realtime/status
```

### Service Status
```bash
curl http://localhost:3000/ai-management/api/status
```

## Environment Variables

```bash
# Required — ElevenLabs API key
ELEVENLABS_API_KEY=xi_your_api_key_here
```

The key can also be stored at `/etc/monsterbox/elevenlabs.key` (created by `install.sh`).

## Speech Pipeline

All speech paths use direct service calls:

```javascript
// Generate TTS audio buffer
const { buffer } = await elevenLabsTTSService.generateSpeech(text, ttsConfig);

// Play on character's assigned speaker
await serverPlaybackService.playAIOnCharacterSpeaker(buffer, characterId);

// Drive jaw animation (parallel)
jawAnimationService.driveFromBuffer(buffer, characterId);
```

This applies to:
- `/api/say` (make character speak)
- `/api/ask-ai` (AI conversation → TTS response)
- Scene `sayThis` steps
- Scene `askAI` steps (via `elevenLabsWebSocketService.askAgentQuestion()`)

## Conversation Flow

### WebSocket Conversation (port 8795)
1. Browser connects to `ws://host:8795`
2. Server streams microphone audio via PipeWire
3. Audio sent to Scribe v2 Realtime for streaming STT
4. Transcribed text sent to ElevenLabs Agent
5. Agent response streamed back as TTS audio
6. Audio played on character speaker with jaw animation

### Fallback (batch STT)
If Realtime STT is unavailable, falls back to batch Scribe v2 polling.

## Troubleshooting

### Common Issues
1. **API Key Not Working** — Verify format `xi_...`, check account credits
2. **Voice Not Playing** — Check PipeWire routing: `wpctl status`, `pactl list short sinks`
3. **STT Silent** — Verify microphone: `pactl list short sources`, check character mic assignment
4. **WebSocket Connection Failed** — Check port 8795 availability, check logs

### Debug Commands
```bash
journalctl -u monsterbox -f
curl http://localhost:3000/ai-management/api/status
curl http://localhost:3000/api/elevenlabs/stt/capabilities
```
