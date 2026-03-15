## MonsterBox 5.5 — AI Settings Overhaul: Continuation Prompt

### Project Context

MonsterBox is a Node.js/Express animatronic control system running on a Raspberry Pi (`orlok` at 192.168.8.120). It uses ElevenLabs Conversational AI for real-time voice interaction with Halloween characters. The currently selected character is **Orlok** (id: 3, agent: `agent_0801k3f1dw7xe2g8r4jkbxk0gt2n`). The server runs on port 3000, with a WebSocket relay on port 8795 that bridges browser clients to ElevenLabs' real-time conversation API.

**Tech stack**: Node.js, Express, EJS templates, Bootstrap 5, ES5 client-side JS (strict requirement), WebSocket (ws), ElevenLabs API (STT Scribe v2, TTS, Conversational AI Agents), Mocha/Chai system tests, Playwright E2E tests.

### What Was Just Completed (Two Sessions)

**Session 1 — AI Settings Page Overhaul (all passing: 17 Mocha, 23 Playwright)**

Rebuilt three AI Settings pages per a detailed plan:

1. **Navigation** — Fixed links in `views/components/unified-navigation.ejs`: STT→`/ai-settings/stt`, TTS→`/ai-settings/tts`, removed AI Agents link, added Chat→`/ai-settings`
2. **STT page** (`views/ai-settings/stt.ejs`) — Two-column layout: col-lg-8 settings left, col-lg-4 sticky transcript+VU meter right. Added `#sttCharacterBanner`.
3. **TTS page** (`views/ai-settings/tts.ejs`) — Complete rewrite. "Default Voice" → "Character Voice" everywhere. Two-column: voice settings left, sticky preview panel right. Added `#ttsCharacterBanner`. Client JS (`public/js/ai-settings-tts.js`) loads per-character voice config from `GET /api/elevenlabs/tts/config` and pre-selects the assigned voice.
4. **Overview page** (`views/ai-settings/index.ejs`) — Removed Agents card, added inline Chat panel with `#chatLog`, `#chatInput`, `#chatSendBtn`, `#chatVUMeter`, `#aiAutonomousToggle`.
5. **Routes** (`routes/aiSettingsRoutes.js`) — Added `getCurrentCharacterInfo()` helper, agents route → 302 redirect to `/ai-settings`, all routes pass `characterId`/`characterName` to views, overview loads `websocket-chat.js` + `ai-settings.js`.
6. **Tests** — Created `tests/browser/ai-settings.spec.js` (23 Playwright tests), added 7 route tests to `tests/system/ai-audio.test.js`.

**Session 2 — AI Chat Quality Fixes (all passing: 17 Mocha, 23 Playwright)**

Diagnosed and fixed issues from a live chat session where responses showed "Audio response" spam, stage directions like `[whispers]`, incoherent rambling, and a dead REST endpoint:

1. **`services/elevenLabsWebSocketService.js`**:
   - `case 'audio'` handler changed: sends `type: 'audio_chunk'` instead of `agent_response`; removed `'Audio response'`/`'Text response'` fallback strings; only includes `text` when actually present in the ElevenLabs chunk
   - Mic echo suppression increased from 1s → 3s (`c.suppressMicUntilMs = Date.now() + 3000`)
   - Added `set_audio_playback` message handler — stores `connection.audioPlaybackEnabled`; speaker playback gated by `if (c.audioPlaybackEnabled !== false)`
   - Removed duplicate `type: 'transcript'` send for user speech (was sending both `user_transcript` AND `transcript`)
   - Added prompt override in `conversation_initiation_client_data` → `conversation_config_override.agent.prompt.prompt` instructing the agent to never use stage directions

2. **`public/js/ai-settings.js`**:
   - `appendChatMessage` strips `[bracketed annotations]` via `text.replace(/\[.*?\]/g, '').replace(/\s{2,}/g, ' ').trim()` for AI messages
   - `onmessage` handler: ignores `audio_chunk` type, filters `'Audio response'`/`'Text response'`, deduplicates via `_lastAgentText`, ignores `transcript` type entirely
   - **AI On toggle** (`#aiAutonomousToggle`) wired: ON → `connectChatWebSocket()` + enables speaker; OFF → sends `end_conversation` + `set_audio_playback:false` + disconnects
   - REST fallback to `/api/elevenlabs/conversation/test` replaced with `_pendingChatMessage` queue (sent on WS open)
   - "Test Conversation" button now activates the toggle and focuses chat input

3. **`services/elevenLabsAgentService.js`**: Orlok + default agent templates updated with "Never include stage directions" instruction in prompt.

### Key Files & Their Current State

| File | Role | Lines |
|------|------|-------|
| `services/elevenLabsWebSocketService.js` | WS relay: browser ↔ ElevenLabs ConvAI | ~1415 |
| `services/elevenLabsAgentService.js` | Agent CRUD, templates, simulation | ~440 |
| `services/serverPlaybackService.js` | Plays audio through character speakers | — |
| `services/serverSTTListener.js` | Captures mic audio chunks on server | — |
| `routes/aiSettingsRoutes.js` | Express routes for AI Settings pages | ~224 |
| `routes/api/elevenLabsApiRoutes.js` | REST API for ElevenLabs (TTS/STT config, voices, cloning; conversation endpoints disabled) | — |
| `public/js/ai-settings.js` | Overview page client JS (chat, toggle, stats) | ~460 |
| `public/js/ai-settings-stt.js` | STT page client JS | — |
| `public/js/ai-settings-tts.js` | TTS page client JS (voice config loading) | — |
| `public/js/websocket-chat.js` | Reusable WS chat client class (not directly used by overview — overview has its own inline WS) | ~266 |
| `views/ai-settings/index.ejs` | Overview page with inline chat panel | — |
| `views/ai-settings/stt.ejs` | STT settings page | — |
| `views/ai-settings/tts.ejs` | TTS voice assignment page | — |
| `config/app-config.json` | `selectedCharacter: 3`, `dataPath: "data/character-3"` | — |
| `data/characters.json` | Character definitions (Orlok id:3, `elevenLabsAgentId: "agent_0801k3f1dw7xe2g8r4jkbxk0gt2n"`) | — |
| `data/character-3/ai-config/tts-config.json` | `model: "eleven_v3"` (default) | — |
| `data/character-3/ai-config/stt-config.json` | Scribe v2, English, VAD settings | — |
| `tests/browser/ai-settings.spec.js` | 23 Playwright E2E tests | ~280 |
| `tests/system/ai-audio.test.js` | 17 Mocha system tests (10 original + 7 new route tests) | — |

### Architecture: Chat Message Flow

```
Browser (ai-settings.js)
  → WS connect to :8795
  → send: set_character, set_mic_source:server, set_audio_playback:true, start_conversation
  → send: send_message (typed text)

Server (elevenLabsWebSocketService.js)
  → Gets signed URL from ElevenLabs API for agent
  → Opens ElevenLabs WS with conversation_initiation_client_data (includes prompt override)
  → Server mic loop captures 500ms PCM chunks → streams as user_audio_chunk to ElevenLabs
  → ElevenLabs sends back:
      type:'audio' (many MP3 chunks per response, occasionally with text)
      type:'agent_response' (full text of AI reply)
      type:'user_transcript' (what user said)
  → Server relays to browser:
      audio chunks → type:'audio_chunk' (client ignores for display)
      agent_response → type:'agent_response' with text (client displays once, deduped)
      user_transcript → type:'user_transcript' (client displays as "You (mic)")
  → If audioPlaybackEnabled: server plays MP3 chunks through character speaker via serverPlaybackService
  → Mic suppressed for 3s after each audio chunk to prevent echo
```

### Known Issues / Areas for Future Work

1. **Agent prompt is on ElevenLabs' servers** — The `conversation_config_override.agent.prompt.prompt` injection at connection time adds anti-stage-direction instructions, but the base agent prompt on ElevenLabs may still encourage theatrical responses. To permanently fix this, update the agent's system prompt via the ElevenLabs dashboard or `PATCH /convai/agents/{agent_id}` API.

2. **VU meter on chat panel** — The `#chatVUMeter` progress bar exists in the HTML but has no JS updating it. It should reflect the server mic's audio level in real time (the server could send periodic `type: 'audio_level'` messages).

3. **`websocket-chat.js` is loaded but unused** — The overview page loads it via the scripts array but `ai-settings.js` has its own inline WebSocket implementation. Either consolidate into `websocket-chat.js` or stop loading it.

4. **Incoherent responses may persist** — The 3s mic suppression helps but if the physical speaker-to-mic distance is very short, echo could still occur. Consider implementing audio ducking or server-side echo cancellation. Also check the ElevenLabs agent's LLM model/temperature settings.

5. **`agents.ejs` view file still exists** — The route redirects, but the file is orphaned. Can be deleted.

6. **`ai-settings-agents.js` client file** — Similarly orphaned. Not loaded by any route since agents was removed. Can be deleted.

7. **Character independence** — The per-character config system (`data/character-N/ai-config/`) is wired for TTS (`tts-config.json` with `voice_id`) and STT (`stt-config.json`). The agent ID comes from `characters.json` field `elevenLabsAgentId`. When switching characters via the Setup page, the AI Settings pages should reflect the new character's config. This works now via `getCurrentCharacterInfo()` in routes, but the chat WS connection is NOT automatically re-established when the character changes.

8. **Test Conversation button** — Currently just activates the toggle and focuses the chat input. Could be enhanced to auto-send a greeting message.

### Running the System

```bash
# Server (already running as background process)
cd /home/remote/MonsterBox && node server.js

# Mocha system tests
npx mocha tests/system/ai-audio.test.js --timeout 15000 --exit

# Playwright E2E tests
npx playwright test tests/browser/ai-settings.spec.js --reporter=list

# All tests currently passing: 17 Mocha + 23 Playwright
```

### Conventions

- **Client JS must be ES5** — No `let`, `const`, arrow functions, template literals, `async/await`, or `class` syntax in `public/js/*.js` files. Use `var`, `function`, prototype pattern, `.then()` chains.
- **Server JS is ESM** — `import`/`export`, `async/await`, modern syntax fine in `services/`, `routes/`, etc.
- **Views** use EJS with Bootstrap 5 dark theme.
- **Tests** use framework helpers from `tests/browser/framework.js` (ErrorTracker, testNavigation). AI Settings tests use `domcontentloaded` wait instead of `networkidle` due to active WebSocket connections.
