# AI Integration Guide

## Overview

MonsterBox integrates AI services through a unified architecture centered on **ElevenLabs** for all voice operations (STT, TTS, Conversational AI), with optional fallback text AI providers (Anthropic Claude, Google Gemini).

## Architecture

### Components

1. **ElevenLabs Services** — Primary voice AI (STT, TTS, Conversational AI)
2. **AIClientManager** — Text AI fallback with automatic provider switching
3. **aiConfigStore** — Per-character and global AI configuration management
4. **CoreAIIntegration** — Main orchestration layer for text AI

### Data Flow

```
Voice Input → ElevenLabs Scribe v2 (STT) → ElevenLabs Agent (AI) → ElevenLabs TTS → Audio Output
                                                                         ↓
                                                            Character Speaker (PipeWire)
                                                                         ↓
                                                            Jaw Animation (parallel)
```

## ElevenLabs Integration

### Models
| Service | Model | Latency | Use Case |
|---------|-------|---------|----------|
| TTS | `eleven_v3` | — | Default — most expressive, supports audio tags |
| TTS | `eleven_flash_v2_5` | ~75ms | Low-latency alternative |
| TTS | `eleven_multilingual_v2` | ~200ms | High-quality narration |
| STT | `scribe_v2` | batch | File transcription |
| STT | `scribe_v2_realtime` | ~150ms | WebSocket streaming |

### Services

```javascript
// TTS — Generate speech
const elevenLabsTTSService = require('./services/elevenLabsTTSService');
const { buffer } = await elevenLabsTTSService.generateSpeech(text, ttsConfig);

// STT — Transcribe audio
const elevenLabsSTTService = require('./services/elevenLabsSTTService');
const result = await elevenLabsSTTService.transcribeAudio(audioBuffer, { model: 'scribe_v2' });

// Realtime STT — WebSocket streaming
const realtimeSTTService = require('./services/elevenLabsRealtimeSTTService');
const session = realtimeSTTService.createSession(characterId, { model: 'scribe_v2_realtime' });

// Conversational AI — Agent question
const elevenLabsWebSocketService = require('./services/elevenLabsWebSocketService');
const answer = await elevenLabsWebSocketService.askAgentQuestion(agentId, question, characterId);

// Per-character config
const { getTTSConfigForCharacter } = require('./services/aiConfigStore');
const ttsConfig = getTTSConfigForCharacter(characterId);
```

### Per-Character Configuration

```
data/character-{N}/ai-config/
├── tts-config.json    # { model, voice_id, stability, similarity_boost, style, output_format }
└── stt-config.json    # { model, language, sampleRate, vadEnabled, vadThreshold }
```

Falls back to global `data/ai-config/tts-config.json` when per-character config doesn't exist.

## Text AI Fallback Providers

For non-voice text generation (e.g., character backstory, scene descriptions), optional providers:

### Anthropic Claude
```javascript
const AnthropicClient = require('./ai/integrations/AnthropicClient');
const client = new AnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await client.generateResponse('Hello', { model: 'claude-3-haiku-20240307' });
```

### Google AI (Gemini)
```javascript
const GoogleAIClient = require('./ai/integrations/GoogleAIClient');
const client = new GoogleAIClient({ apiKey: process.env.GOOGLE_API_KEY });
const response = await client.generateResponse('Hello', { model: 'gemini-pro' });
```

## Environment Variables

```bash
# Required
ELEVENLABS_API_KEY=xi_your_api_key_here

# Optional text AI fallback
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key
```

## Error Handling

### Retry Logic
- Network errors: exponential backoff (3 retries)
- Rate limit (429): backoff with jitter
- Server errors (5xx): retry with backoff

### Non-retryable
- Authentication (401, 403): fail immediately
- Bad request (400): fail immediately

### Fallback
When ElevenLabs TTS fails, scene executor logs the error and continues. When agent query fails, `askAI` steps fall back to a static response.

## Testing

```bash
# Unit tests
npm test -- --run

# E2E with Playwright
npx playwright test --project=firefox --headless

# Test ElevenLabs connection
curl http://localhost:3000/ai-management/api/status
```

## Troubleshooting

1. **API Key Errors** — Check `ELEVENLABS_API_KEY` or `/etc/monsterbox/elevenlabs.key`
2. **Rate Limiting** — Monitor ElevenLabs dashboard for quota
3. **Audio Issues** — Check PipeWire: `wpctl status`, `pactl list short sinks`
4. **Performance** — Use `eleven_flash_v2_5` for lowest latency; use `eleven_v3` (default) for most expressive output
