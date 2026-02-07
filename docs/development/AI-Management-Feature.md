# AI Management Feature - MonsterBox

## Overview

The AI Management Feature provides a centralized interface for configuring and managing all AI systems within MonsterBox. All AI voice services run through **ElevenLabs** as the sole provider:

1. **Speech-to-Text (STT)** — ElevenLabs Scribe v2 (batch) and Scribe v2 Realtime (WebSocket streaming)
2. **Conversational AI** — ElevenLabs Agents with per-character personalities
3. **Text-to-Speech (TTS)** — ElevenLabs voice synthesis with per-character voice and model config

## Current Models

| Service | Model ID | Use Case |
|---------|----------|----------|
| TTS | `eleven_flash_v2_5` | Default — fastest (~75ms latency) |
| TTS | `eleven_multilingual_v2` | High-quality narration |
| STT | `scribe_v2` | File-based/batch transcription |
| STT | `scribe_v2_realtime` | Real-time streaming via WebSocket (~150ms latency) |

## Features

### 🎤 Speech-to-Text Configuration
- **ElevenLabs Scribe v2**: Configure model, language, and audio quality settings
- **Realtime STT**: WebSocket-based streaming with VAD (Voice Activity Detection)
- **Audio Filters**: Highpass/lowpass filters, denoise, and VAD tuning for noisy environments
- **Live Testing**: Real-time audio recording and transcription testing with confidence metrics
- **Server-side Microphone**: Uses PipeWire audio input, not browser `getUserMedia`

### 🧠 Conversational AI Agents
- **ElevenLabs Agents**: Per-character conversational AI with custom personalities
- **Agent Management**: Create, configure, and assign agents to characters
- **Voice Selection**: Choose from ElevenLabs voice catalog per agent
- **Conversation Starters**: Configure per-character conversation prompts
- **Real-time Chat**: WebSocket conversation on port 8795 with barge-in support

### 🔊 Text-to-Speech Configuration
- **Per-Character Voice**: Each character has its own TTS model, voice, stability, and similarity settings
- **Voice Catalog**: Browse and preview ElevenLabs voices with filtering
- **Model Selection**: `eleven_flash_v2_5` (fast) or `eleven_multilingual_v2` (quality)
- **Advanced Settings**: Stability, similarity boost, style, output format
- **Audio Testing**: Generate and test speech with immediate playback on character's speaker

### 🔄 Per-Character Configuration
- **Config Storage**: `data/character-{N}/ai-config/tts-config.json` and `stt-config.json`
- **Global Fallback**: `data/ai-config/tts-config.json` used when no per-character config exists
- **Service**: `aiConfigStore.getTTSConfigForCharacter(characterId)` loads per-character or global config

## Navigation

Access the AI Management Feature through:
- **Main Menu**: "🤖 AI Management" button on the home page
- **Character Pages**: "Configure Voice" button opens TTS configuration for that character
- **Direct URLs**:
  - `/ai-management` — Main dashboard
  - `/ai-management/stt` — STT configuration
  - `/ai-management/agents` — ElevenLabs Agent management
  - `/ai-management/tts` — TTS voice configuration

## Integration with Animatronic Systems

### Speech Pipeline
All speech paths use direct service calls (no HTTP loopback):
```
Text → elevenLabsTTSService.generateSpeech() → serverPlaybackService.playAIOnCharacterSpeaker()
                                              → jawAnimationService.driveFromBuffer() (parallel)
```

### Scene Execution
- **Say This** steps: Use `getTTSConfigForCharacter(characterId)` for per-character voice
- **Ask AI** steps: Call `elevenLabsWebSocketService.askAgentQuestion()` for real conversational AI responses, then TTS the reply
- **Jaw Animation**: Driven from audio buffer in parallel with playback

### Conversation Route (`/api/ask-ai`)
- Direct `elevenLabsTTSService.generateSpeech()` + `serverPlaybackService.playAIOnCharacterSpeaker()`
- No HTTP loopback — uses imported service modules directly
- Per-character TTS config for voice selection

## Configuration Files

AI configurations are stored in:
- `data/ai-config/stt-config.json` — Global STT settings
- `data/ai-config/tts-config.json` — Global TTS settings
- `data/ai-config/elevenlabs-config.json` — Global ElevenLabs settings
- `data/ai-config/vad-config.json` — Voice Activity Detection settings
- `data/character-{N}/ai-config/tts-config.json` — Per-character TTS settings
- `data/character-{N}/ai-config/stt-config.json` — Per-character STT settings

## API Endpoints

### STT API
- `GET /api/elevenlabs/stt/capabilities` — List STT models and capabilities
- `POST /api/elevenlabs/stt/transcribe` — Transcribe audio file
- `GET /api/elevenlabs/stt/realtime/status` — Realtime STT session status
- `GET /api/elevenlabs/stt/realtime/capabilities` — Realtime STT capabilities

### TTS API
- `POST /api/elevenlabs/generate-and-play` — Generate speech and play on character speaker
- `GET /api/elevenlabs/voices` — List available voices
- `POST /ai-management/api/tts/global` — Save global TTS settings

### Agent API
- `GET /ai-management/api/agents` — List configured agents
- `POST /ai-management/api/agents` — Create/update agent
- `POST /ai-management/api/test/conversation` — Test conversation with agent

### Status API
- `GET /ai-management/api/status` — ElevenLabs service status
- `POST /ai-management/api/test/elevenlabs` — Test ElevenLabs connection

## Environment Variables

```bash
# Required
ELEVENLABS_API_KEY=xi_your_api_key_here

# Optional (for text AI fallback providers)
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key
```

## Usage Examples

### Setting Up a New Character
1. Create character in Characters section
2. Navigate to AI Management → Agents
3. Create or assign an ElevenLabs conversational agent
4. Navigate to AI Management → TTS
5. Select voice from ElevenLabs catalog and configure model (`eleven_flash_v2_5`)
6. Test with conversation interface

### Testing Voice Configuration
1. Go to AI Management → TTS
2. Select character and click "Configure"
3. Browse ElevenLabs voice catalog
4. Adjust stability, similarity, style settings
5. Preview voice with custom text
6. Assign voice to character

## Troubleshooting

### Common Issues
- **No API Key**: Set `ELEVENLABS_API_KEY` in environment or `/etc/monsterbox/elevenlabs.key`
- **Voice Not Playing**: Check PipeWire audio routing and character speaker assignment
- **STT Not Working**: Verify microphone is assigned to character, check PipeWire source
- **AI Responses Failing**: Verify ElevenLabs agent is configured and assigned to character

### Debug Commands
```bash
# Check ElevenLabs status
curl http://localhost:3000/ai-management/api/status

# Test TTS
curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","characterId":3}'

# Check STT capabilities
curl http://localhost:3000/api/elevenlabs/stt/capabilities

# App logs
journalctl -u monsterbox -f
```
