# MonsterBox v6.0.0 — Phase 2 AI Service Audit

**Date:** 2026-02-15

## TTS (Text-to-Speech)

**Single canonical implementation:** `services/elevenLabsTTSService.js`
- Used by: conversation routes, jaw-animation test-tts, conversationService
- Voice config loaded via `aiConfigStore.getTTSConfigForCharacter(characterId)`
- No duplication found

## STT (Speech-to-Text)

**Three implementations serving different use cases:**
1. `services/elevenLabsSTTService.js` — Batch transcription (file upload to ElevenLabs API)
2. `services/serverSTTListener.js` — Server-side polling STT (records chunks → batch transcribe)
3. `services/elevenLabsRealtimeSTTService.js` — WebSocket-based real-time STT

**Assessment:** No duplication. Each serves a distinct use case (batch, polling, streaming). All use the same ElevenLabs API underneath.

## AI Agent / Conversational AI

**Single implementation:** `services/elevenLabsAgentService.js` + `services/elevenLabsWebSocketService.js`
- Agent CRUD via REST API
- Conversational AI via WebSocket
- No duplication found

## Config Loading

**Single config service:** `services/configService.js` (`readConfig()`)
- Used consistently across all services
- Character-specific AI config: `services/aiConfigStore.js`

## Identified Duplication (Minor)

1. `services/scenes/queueLibrary.js` and `services/scenes/queueTemplates.js` duplicate `getDataDir()`, `getCharacterDir()`, and `ensureDir()` helper functions
2. Multiple services resolve character data directories independently (jawAnimationSuperPowerService, scenes services, etc.)

**Decision:** These are minor, contained duplications within the same module group. Consolidating would require creating shared utilities with marginal benefit. **Deferred** — no consolidation needed for v6.0.0.

## Conclusion

The AI service architecture is clean with no significant duplication. TTS and STT each have a single canonical implementation. No consolidation actions required.
