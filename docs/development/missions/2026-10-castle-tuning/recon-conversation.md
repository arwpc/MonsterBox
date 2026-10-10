# MonsterBox conversation pipeline: recon for fleet-wide tuning

I did not write `/tmp/claude-1000/-home-remote-MonsterBox/26c4c0b3-31c7-4df4-abb0-d653712a3390/scratchpad/recon-conversation.md`. This agent is read-only and can't create files, so please save this text there yourself.

**Node and checkout.** Node `orlok` (character 3), Pi 4B. Repo `/home/remote/MonsterBox` at HEAD `86c9bb0e` (v10.6.0). Date 2026-10-09. All paths below are relative to the repo unless absolute.

**What I touched beyond reading code (all read-only):**
- Searched `/var/log/monsterbox.log`, its rotations, and `/var/log/monsterbox.err`.
- Ran `ps`, `uptime` and `vcgencmd get_throttled`.
- Read the systemd drop-ins.
- Made 6 GETs to `https://localhost:3000/api/elevenlabs/agents/:id` to read the live agent configs (these use the node's own key).
- Tried the claude.ai ElevenLabs connector. It returned 404, so it is connected to a different workspace.
- Ran one web search against the ElevenLabs docs.

**Caveat on CPU numbers.** While I was working, Claude Code and its MCP servers used about 46% of one core on this Pi.

---

## 1. Ownership: who holds which socket or process

**`services/elevenLabsWebSocketService.js`** (singleton, line 2889)
- Owns every ElevenLabs ConvAI agent WebSocket: the persistent "headless" session, sessions started from a browser, and one-shot ask sockets.
- Runs MonsterBox's own WS server on :8795 plus a secure one at `/ai-chat` (442-500).
- Also owns the server mic loop, echo suppression, barge-in and agent-audio routing.

**`services/elevenLabsRealtimeSTTService.js`**
- A separate Scribe v2 realtime STT socket (`wss://api.elevenlabs.io/v1/speech-to-text/realtime`, :39), pcm_16000, `commit_strategy=vad`.
- Used by browser sessions only. Its transcripts go to the UI and Follow Orders, never to the agent.
- Headless sessions set `useRealtimeSTT=false` (1453).

**`services/serverSTTListener.js`** (no WebSocket)
- `startContinuousCapture` (723-845) is the long-lived mic process that feeds the agent loop.
- `startSession` (72+) is the separate polled STT listener used by Follow Orders and `/api/elevenlabs/stt/listen`.

**`services/elevenLabsAgentService.js`** (REST only)
- Agent CRUD (17-157), a static model list (162-193), and chat via simulate-conversation (276-349).
- `createAgentTemplate`, `validateAgentConfig` and `testAgent` are referenced nowhere.

**`services/conversationService.js`**
- Legacy HTTP pipeline: batch STT, then simulate-conversation, then TTS (8-63).
- Nothing imports it except tests, so it is dead in production.

**`services/serverPlaybackService.js`**
- Every speaker player:
  - one persistent `pw-play` per character+device for PCM;
  - one persistent `mpg123` per character for MP3;
  - one-shot `pw-play`, `mpg123` and `ffmpeg|pw-play` players.
- Also all the stop functions.

## 2. Paths from microphone to agent to speaker

### 2.1 Persistent headless agent ("AI mode")

**Entry points**
- **`POST /conversation/api/ai-on`** (`routes/conversation.js:1015-1046`) calls `setAgentEnabledForCharacter` (`elevenLabsWebSocketService.js:1407-1473`).
  - It also writes `ai_agent_state.json`, which is only a hint. `ai-status` reports the live session (1050-1078).
- **Dashboard AI toggle:** `setServerAi` (`public/js/dashboard.js:1142`, handler 1196-1208), which polls ai-status every 3 s (1213).
- **Motion-mode PIR wake:** `wakeOnMotion` (`conversation.js:1326-1363`) calls `setAgentForMotion(true)` (1272-1284), but only if `planWake().startAgent` (`calloutService.js:196-199`).
  - Sleep runs `sleepOnMotion` (1366-1373), which turns the agent off.
- **Lurk mode:** the server never starts the agent. Dashboard JS does it (`dashboard.js:296-303`, skipped in callout mode), so it needs a browser open.

**Flow**
1. The agent ID comes from `data/characters.json` field `elevenLabsAgentId` (278-302).
2. Fetch a signed URL (714-729), then open `new WebSocket(signed_url)` (733).
3. On open, send `conversation_initiation_client_data` with `conversation_config_override: {}` (744-748). Nothing else is sent: no dynamic variables, no overrides.
4. On `conversation_initiation_metadata` (853-904):
   - mark the session ready;
   - read the output format from `agent_output_audio_format` (862-872);
   - start the mic loop (881-884);
   - send a body-state `contextual_update` (889-894).

   Note: `_waitForAgentReady` resolves when the socket opens, not on this metadata (1385-1394), so the mic loop is also started at 1465. That second call does nothing (guard at 1841).
5. **Mic loop** (`_startServerMicLoop`, 1838-2106):
   - The device comes from the microphone part in parts.json (305-321).
   - `startContinuousCapture` (2093) output is re-cut into 8000-byte / 250 ms frames (2090-2100).
   - Each frame goes through `handleFrame` (1850-2065):
     - RMS level (1865-1874);
     - noise-floor tracking (1882-1886);
     - echo floor and barge-in check (1894-1915);
     - voice gate (1916-1937).
   - Each frame is sent as `{user_audio_chunk: base64}`. It is real audio only when not suppressed and the gate is open; otherwise it is zeros of the same length (1948-1957).
6. **Agent events** (843-1261):
   - `audio` goes to playback (906-1093).
   - `user_transcript` (1095-1145) feeds the Follow Orders hook, the speech log, LED "thinking" and the turn clock.
   - `agent_response` (1147-1187).
   - `ping`/`pong` (1189-1198).
   - `conversation_end` (1200-1214).
   - `interruption` calls `_bargeIn` (1216-1223).
   - `client_tool_call` is answered immediately (1225-1250).
7. **Teardown:** `_teardownHeadlessSession` (1479-1513) calls `endConversation`, which runs stopStream (1315), then calls stopStream again (1507).

**No reconnect exists.** The socket's `on('close')` (755-771) only marks the session inactive.

### 2.2 Sessions started from a browser

**Which pages open them**

| Page / script | Lines |
|---|---|
| Dashboard chat | `dashboard.js:816-860` |
| AI Settings "autonomous" toggle | `public/js/ai-settings.js:336-345` and `614-642` |
| AI Settings STT test | `ai-settings-stt.js:981` |
| Other clients | `mic-panel.js`, `components/ai-chat-modal.js`, `websocket-chat.js` |

**Protocol**
- They connect to ws://host:8795 or wss://host/ai-chat.
- They send `set_character`, `set_mic_source`, `set_audio_playback`, `set_speaker_part` and `start_conversation` (537-685).

**Behaviour**
- Each opens its **own** agent socket, and its own server mic loop if the mic source is "server". Two agents can listen on one mic at once.
- They also start Scribe realtime (556; settings at 1563-1572: 1.5 s silence, 0.4 threshold).
- `browser_audio_chunk` (640-661) forwards browser mic audio to the agent, except while suppressed.

### 2.3 One-shot ask: `askAgentQuestion` (2629-2646)

**If a live session exists**, it uses it (2497-2512, preferring the headless one) via `_askOnLiveSession` (2529-2615):
- sends `user_message` (2575);
- 150 ms later sends a 500 ms zero frame to force the turn to commit (2586-2594). The constant is at 151; the comments at 143-150 still say "250ms"/"dithered", which is stale.
- resolves after 1.5 s of quiet (141, 1268-1284) or a 30 s ceiling (138, 2597-2606).

**Otherwise** it opens a new socket via `_askAgentQuestionEphemeral` (2652-2886):
- new signed URL and socket (2705-2724), empty override (2729-2732);
- `_startAudioPlayback` starts as soon as the socket opens (2735);
- the question is sent after metadata arrives (2747-2752).

Audio is held per `event_id` until the matching `agent_response` says whether that turn is the greeting or the answer (2753-2766, 2778-2804, `isAnswerTurn` 126-129). So the `first_message` greeting is generated and thrown away. The log confirms the order: `Captured agent response` comes before `Starting pw-play` (e.g. monsterbox.log lines 106023-106024).

There is no mic on this path. The socket closes only on the **30 s timer** (2866-2879) or when the server closes it. The caller is only answered in the close handler (2816-2858).

### 2.4 `POST /conversation/api/ask-ai` (`conversation.js:800-929`)
- Calls `askAgentQuestion` (848-852).
- Returns after the settle delay on a live session, or after the ~30 s close on the one-shot path.
- On an exception it falls back to TTS of an apology (876-915).

### 2.5 Callouts (`services/calloutService.js`)
- **Scheduler:** `_schedule`/`_tick` (422-453). The gate `decideCallout` (174-183) blocks during any session (`hasActiveSession`, ws 1533-1541), a scene queue, recent playback, mute and quiet hours.
- **Speaking:** `speak()` (311-324) calls `askAgentQuestion` (319). A callout never runs while a session is live, so it **always takes the one-shot path** (CHANGELOG.md:22-29: "bills up to ~30 s … hard timeout").
- **Prompt:** at most `maxWords` (default 20) words (209-217).
- **PIR wake in callout mode** opens no agent unless `aiOnWake` is set (196-199; `conversation.js:1342-1350`).
- **Orlok's settings** (`data/character-3/callout-state.json`): enabled, 300 s interval, `aiOnWake: false`.
- **Rollout:** CHANGELOG.md:20, 22-29 says callouts are on for Orlok, Sir Dragomir, Renfield, PumpkinHead and Groundbreaker.
- **API only** (no UI): `conversation.js:1488-1530`.

### 2.6 Scene steps (`services/scenes/sceneExecutor.js`)
- **`sayThis`** (238-279): `generateSpeech` (248) is a non-streaming `POST /v1/text-to-speech/{voice}` (`elevenLabsTTSService.js:214-241`, model eleven_v3 per tts-config). Then `playWithJawSync` (259) or `playAIOnCharacterSpeaker` (275). The step blocks until playback ends.
- **`askAI`** (281-342): `askAgentQuestion` (295-299) already plays the agent's audio. The step then generates TTS of the same reply (314) and plays it **again** (325 or 338).
- **Orlok's lurk scenes** 111-116 are all sayThis-based (`data/character-3/scenes.json`). `lurk-scenes-state.json` is enabled at 240 s.

### 2.7 TTS-only paths that look like AI
- **Orchestration "Ask AI"** (`routes/api/orchestrationRoutes.js:976+`) proxies to the node's `/api/elevenlabs/agent-speak` (998). That route speaks the input text verbatim (`personalityText = text`, `elevenLabsApiRoutes.js:723-727`); no agent is involved. Its fallback is `generate-and-play` (590-688).
- **`/conversation/api/say`** (585+).

### 2.8 Audio format at each hop

| Hop | Format | Where |
|---|---|---|
| Mic capture | PCM s16le, 16 kHz, mono. Tries `python3 microphone_cli.py stream_raw` (PyAudio, ~20 ms reads) first, then parec (`--latency-msec=50`), ffmpeg, arecord | `serverSTTListener.js:724-750`; `python_wrappers/microphone_cli.py:201,256` |
| Node → agent | 250 ms (8000-byte) base64 frames; zeros when suppressed or gated | ws 2090, 1948-1957 |
| Agent speech recognition | scribe_realtime, input pcm_16000 (live config) | agent side |
| Agent → node | base64 PCM s16le 16 kHz mono. pcm_16000 on all six live agents; first chunk 7580 B ≈ 237 ms (log) | ws 862-872 |
| Live session → speaker | each chunk goes to a persistent `pw-play [--raw] --format s16 --rate 16000 --channels 1 --volume 0.900 [--target sink] -` | ws 1030-1040; `serverPlaybackService.js:400-479` |
| One-shot ask → speaker | up to 12 chunks grouped, same persistent pw-play at volume 1.0 | ws 2244-2275 |
| MP3 fallback | persistent `mpg123 --quiet -o pulse -f <scale> -` with `PULSE_SINK` | playback 284-394 |
| One-shot TTS | MP3 (`Accept: audio/mpeg`, no `output_format`). Played by a one-shot mpg123 (playback 615-661), or by ffmpeg pre-analysis plus a one-shot player in `playWithJawSync` | jaw 1580-1726 |
| Sink on Orlok | logs show `device=default` | — |

## 3. Turn-taking and interruption

### 3.1 Knobs in our code (`elevenLabsWebSocketService.js`)

| Knob | Value | Line | What it does |
|---|---|---|---|
| `VOICE_ACTIVITY_RMS` | 0.02 | 29 | minimum level that can count as voice |
| `VOICE_GATE_MARGIN` | 2.0 | 38 | gate threshold = max(0.02, noise floor × 2) (1916-1919) |
| `MIC_GATE_HANGOVER_MS` | 900 | 43 | gate stays open 900 ms after the last voiced frame |
| `MB_MIC_VOICE_GATE` env | `'0'` turns gate off | 46 | |
| `MB_BARGE_IN` env | `'0'` turns local barge-in off | 65 | see note below |
| `BARGE_IN_MARGIN` | 2.2 | 69 | threshold = max(0.05, echo floor × 2.2) |
| `BARGE_IN_RMS_FLOOR` | 0.05 | 73 | absolute minimum barge-in level |
| `BARGE_IN_FRAMES` | 3 (~750 ms) | 78 | consecutive loud frames needed |
| `BARGE_IN_GRACE_MS` | 700 | 83 | no barge-in this early in a reply |
| `UTTERANCE_GAP_MS` | 1200 | 962 | gap that starts a new utterance |
| `TAIL_BUFFER_MS` | 2500 | 998 | mic stays zeroed 2.5 s after modelled playback end |
| Post-barge-in discard window | 1200 ms | 2381 | agent audio dropped after a barge-in |
| `ASK_REPLY_TIMEOUT_MS` / `ASK_SETTLE_MS` | 30000 / 1500 | 138 / 141 | live-session ask ceiling and settle |
| `MB_WS_DEBUG` | — | 134 | per-message logging |
| `MB_STT_FILTER`, `MB_AUTOTUNE_ALLOW_SFX` | — | 1990, 2002 | batch STT fallback filters |

**`MB_BARGE_IN` status by node**
- **Orlok:** confirmed set to 0 by `/etc/systemd/system/monsterbox.service.d/40-no-barge-in.conf`; `systemctl show` lists it.
- **Renfield:** the same file per KNOWN-BUGS.md:1395-1397. I did not check his node.
- **Other drop-ins on Orlok:** `10-priority.conf` sets Nice=-5 and CPUWeight=90.

**STT settings page vs the agent path.** The settings saved on that page (`vadThreshold` 0.045, `vadSilenceDuration` 1200, `utteranceAggregation`, filters) are **not read by the agent path**. They only feed `serverSTTListener.startSession` (95-110, 343-355) and the browser Scribe filters/language.

### 3.2 Where the mic is gated or suppressed

**Suppression sources**
- **Live agent audio:** each chunk pushes suppression for the whole character out to `playbackEndsAtMs + 2500` (991-1008).
- **One-shot playback loop:** now + duration + 1500 per batch (2291-2298).
- **One-shot players:**
  - `playAIOnCharacterSpeaker` and `playBufferOnCharacterSpeaker`: estimated length + 1000 (playback 511-526, 792-809);
  - `playWithJawSync`: duration + 1000 (jaw 1604-1610);
  - `/api/say`: `conversation.js:627`;
  - Follow Orders acknowledgement: `followOrdersListener.js:170`.

**While suppressed**
- The agent receives **zeros** (1951-1953).
- Scribe and batch STT are skipped (1960, 1968).
- Browser mic chunks are dropped (646-659).

**Gate closed** (no voice for 900 ms): zeros (1936-1953).

**Only one thing reopens the mic early:** barge-in, via `_clearMicSuppression` (2350-2362).

### 3.3 Barge-in
- It is only checked when the mic is suppressed, `MB_BARGE_IN` is on, and the character is speaking (1894).
- The echo floor tracks the *quietest* frame heard during suppression (1895-1897) and resets when suppression ends (1910-1915). The test function is `shouldBargeIn` (95-107).
- `_bargeIn` (2376-2423), in order:
  1. discard window and clear queues;
  2. `stopForCharacter`, a node-wide pkill;
  3. stop jaw and LEDs;
  4. reopen the mic;
  5. send `{type:'interruption'}` to any browser client.
- The agent's `interruption` event takes the same path (1216-1223).
- Manual: `POST /conversation/api/stop-speaking` (`conversation.js:979-988`). No UI calls it.

### 3.4 What we send to ElevenLabs
- **Session start:** `conversation_initiation_client_data` with an empty override (745-748, 2729-2732).
- **Messages:**
  - `user_message` (828, 2575, 2749);
  - `user_audio_chunk` (652, 1955, 2591);
  - an empty chunk as end-of-speech (2126-2133);
  - `pong`;
  - `contextual_update` with `context_id` (1757-1813);
  - `client_tool_result` (1242-1247).
- **What a client may override:** the agents only allow `conversation.text_only` and, for some agents, `agent.language`. Turn, TTS, prompt, LLM and first_message cannot be overridden (`platform_settings.overrides` in the snapshots; the live turn override shows only soft-timeout message fields, set to false).
- **Consequence:** turn-taking can only be changed on the agent itself.

### 3.5 Agent side (live config read 2026-10-09)

| Character | turn timeout | eagerness | speculative | soft timeout s (max fillers) | `interruption` in client_events | temperature | prompt chars | TTS speed |
|---|---|---|---|---|---|---|---|---|
| PumpkinHead (1) | 5 | normal | no | 2 (3) | **no** | 1.0 | 7465 | 1.0 |
| Mina (2) | 6 | normal | no | 2.5 (1) | **no** | 1.0 | 10272 | 0.87 |
| Orlok (3) | 8 | normal | yes | 2.5 (3) | **no** | 0.83 | 10235 | 0.75 |
| Sir Dragomir (4) | 5 | eager | no | 2 (3) | **no** | 1.0 | 10239 | 0.9 |
| Groundbreaker (5) | 5 | eager | no | 2 (3) | yes | 0.7 | 4445 | 0.95 |
| Renfield (6) | 5 | eager | yes | 1.5 (3) | yes | 0.9 | 9661 | 1.05 |

**Same on all six**
- LLM gpt-oss-120b, **max_tokens -1**, `reasoning_effort` null.
- RAG on, 20 chunks, 50,000 characters max.
- Turn mode "turn", model turn_v2, no interruption ignore terms, `transcribe_on_disabled_interruptions: false`.
- `vad.background_voice_detection: true`.
- Speech recognition scribe_realtime, pcm_16000; output pcm_16000.
- TTS eleven_v3_conversational with **`optimize_streaming_latency: 0`**.
- `max_duration_seconds: 600`.

**Drift from the committed snapshots** (`config/elevenlabs/agents/*.json`, Aug 16-18)
- `optimize_streaming_latency` went from 3 to 0 on all six. KNOWN-BUGS.md:2662-2668 says this was deliberate.
- Prompts grew by about 2-2.5k characters on five agents; Groundbreaker's was rewritten shorter.
- Groundbreaker's temperature went from 1.0 to 0.7.
- Turn settings, `client_events`, `max_tokens` and RAG are unchanged.

## 4. Playback path

### 4.1 How audio reaches the speaker

**Live session**
- Each chunk calls `writePcmStream` without waiting for the previous one (1032-1040), then `_ensurePcmStream` (400-444).
- `_resolveDeviceId` then calls `getSpeakerDeviceForCharacter` (82-95), which re-reads `config/app-config.json` (`readConfig`, `configService.js:12-14`, no cache) and re-reads and parses `parts.json`. This happens for **every chunk**.
- Then it writes to stdin and resolves on drain.
- The persistent pw-play (key `pcm_<char>_<device>`) is never stopped between utterances.
- The jaw is driven per chunk (1048-1050; jaw 1943-2009) and drained by a 50 ms timer (2011-2060).

**One-shot ask**
- Chunks go into `audioBuffer`. `_startAudioPlayback` (2208-2311):
  - waits for 3 chunks (2238-2241);
  - groups up to 12 (2244-2250);
  - waits on each write.
- The jaw does **not** move during one-shot speech; it is only closed at the end (2306). The comment at `calloutService.js:304-310` says otherwise.

**One-shot TTS players**
- `playAIOnCharacterSpeaker` (500-758) waits for the player to exit.
- Its watchdog `_playbackTimeoutMs` (46-70) is max(15 s, 1.5 × estimated length + 5 s), capped at 300 s.

### 4.2 How playback is stopped

| Function | Lines | What it does |
|---|---|---|
| `stopPcmStream` | 484-494 | `stdin.end()` then SIGTERM immediately, with no drain |
| `stopStream` | 760-775 | same treatment for the mpg123 stream, plus `stopPcmStream` |
| `stopForCharacter` | 871-892 | `stopStream`, then `speaker_cli.py stop`, which runs `pkill -f pw-play`, `paplay`, `mpg123` and `aplay` across the whole node (`python_wrappers/speaker_cli.py:248-260`). Spawns Python every call |
| `stopAll` | 894-919 | stops every stream |

The comment at ws 763 ("mpg123 flushes remaining data and exits cleanly") is wrong: SIGTERM follows immediately.

### 4.3 Everything that can end speech mid-utterance

| Trigger | Lines | Effect |
|---|---|---|
| Local barge-in | 1906-1909, 2376-2423 | pkill of every player |
| Agent `interruption` event (only Groundbreaker and Renfield send it) | 1216-1223 | same |
| ElevenLabs closes the socket (600 s max duration, network drop, idle) | `on('close')` 755-771, stopStream at 765 | SIGTERM the shared pw-play |
| AI toggled off, or PIR inactivity sleep | 1479-1513, 1309-1336; `conversation.js:1366-1373` | SIGTERM |
| PIR inactivity timer (default 5 min, `conversation.js:1259`) | `lurkMotionWatcherService.js:130-134, 293-330` | only PIR motion or dashboard-typed chat/say resets it (`conversation.js:2073-2076`; `dashboard.js:509-512, 1113, 1785`); **guest speech on the headless session does not** |
| One-shot 30 s timer | 2866-2879, then the close handler waits 0.4 + 1.0 s and calls `stopPcmStream` (2816-2848) | cuts any one-shot reply still playing about 31 s after the socket opened |
| Browser client disconnects, or sends `set_speaker_part` | 2139-2164, 622-630 | stops the character's **shared** pw-play, so it also kills headless speech |
| Session reaper (browser sessions older than 1 h, or idle 5 min) | 354-436, then 765 | same |
| Node-wide pkill callers | see list below | kills every player on the node |
| Jaw queue cap of 400 frames (~20 s) | jaw 1931, 2002-2003 | jaw stops moving on long replies; audio continues |
| Speaker mute | 452 | silence, but reported as success |

**Node-wide pkill callers**
- `GET /__audio/active-device` (`server.js:523-538`) — a diagnostic route that kills all audio.
- `POST /api/audio/stop-all` (`server.js:621-627`; `routes/audioLibrary.js:523-526`).
- `audioLoopService.js:281-287`, unless called with `ownOnly`.
- `ledAnimationService.js:74`.
- `routes/setup/jaw-animation.js:556`.
- The panic route.

## 5. CPU work that runs alongside speech

**For every agent audio chunk (live session)**
- Parse the JSON message and decode the base64 twice (935, 1014).
- Loop over all sessions to update suppression (1008).
- Two disk reads plus JSON parsing inside `writePcmStream` (above).
- Jaw RMS for every 50 ms slice (jaw 1987-2004).
- When jaw and LED sync are both off — Orlok's current `super-powers.json` — and nothing is cached, `liveJawConfig` re-reads config from disk (jaw 226-262).
- Forward the base64 audio to any browser client (1068-1077).
- Once per turn, a random-pose servo sway (1086-1091).

**Every 50 ms while speaking**
- Jaw servo command to the Python daemon (jaw 2015-2051; `jawServoDaemon.js:157-165`).
- LED level update.
- Head co-expression at 10 Hz (`speechExpressionService.js:57, 368`).

**Every 250 ms mic frame**
- RMS loop, base64 encode and send (1865-1957).
- Browser sessions only: Scribe send, or the batch STT fallback (ffmpeg filter plus HTTP every 2.5 s, 1968-2028).

**Always-on processes**

| Process | Notes |
|---|---|
| `python3 microphone_cli.py stream_raw` | runs whenever a session exists |
| `mjpg_streamer` 320x240 @ 10 fps | running now |
| Head tracking: `scripts/motion_tracking_service.py` (OpenCV person detection) | capped at 10 fps processing (668-678, 1073-1074). Measured at ~77% of a core per process on Sir Dragomir (`controllers/motionTrackingController.js:29-35`). Up to 25 status lines per second into Node (1065; controller 478-484). Not running on Orlok now; always-on for Dragomir (CHANGELOG.md:38) |

**Periodic**
- Background music checks every 1.5 s (`backgroundMusicService.js:47, 346`) and pauses during sessions.
- A perf monitor runs `wpctl status` every 60 s (`server.js:1223-1236`).

**Only while fleet or orchestration pages are open**
- The MJPEG relay and frame cache run inside the Node process (`mjpegRelay.js`, `mjpegFrameCache.js`; `orchestrationRoutes.js:12-13`).

**One-shot TTS**
- `playWithJawSync` runs ffmpeg to pre-analyse every clip before it plays (jaw 1437, 1784).
- It also pre-warms an mpg123 process it never uses (1624, 1696-1703).

**Measured load on Orlok today**
- Perf log lines show load1 0.09-0.84; `throttled=0x0`.
- KNOWN-BUGS.md:1392 recorded "not CPU: load 0.15-0.3" for Renfield's self-interruption.

## 6. Agent configuration

**Where agent IDs live**
- **`data/characters.json` `elevenLabsAgentId`** is what the runtime uses (ws 278-302; `conversation.js:827-829`; `calloutService.js:313`; `sceneExecutor.js:292-293`). It is set on `/setup/characters`.
- **`config/animatronics.json` `agentId`** is the orchestration roster; conversation code doesn't use it.
- **An optional `agent_id`** in `data/character-N/ai-config/tts-config.json` is read only by `aiPromptGeneratorService.js:338-368`.

**Local snapshots, not synced automatically**
- `config/elevenlabs/agents/*.json` (Aug 16-18), `agents-pre-tuning/`, `kb-sources/`.
- The README has a restore recipe (PATCH through the local API). The live agents have drifted from these (section 3.5).

**What `elevenLabsAgentService` does**
- Agent CRUD: get, create, update (a PATCH that passes the body straight through), delete.
- `getAvailableModels` is a static list (gpt-4o, gpt-4o-mini, claude-sonnet-4-6, gemini-2.0-flash) that doesn't include the live gpt-oss-120b.
- The template (198-222) is never used.
- `fastChatWithAgent`'s canned per-agent lines (354-447) are reachable only from the dead `conversationService`.

**What our code writes to the agents: nothing automatically**
- Code never sets the agents' LLM, temperature, max_tokens, turn settings, `client_events` or TTS.
- Those can only be changed through `PATCH /api/elevenlabs/agents/:id` (`elevenLabsApiRoutes.js:268-280`) or the ElevenLabs web app.
- At runtime the code reads only `agent_output_audio_format` from the agent (862-872).

**Local versus ElevenLabs-side settings**
- **Local only:**
  - `tts-config.json`, which affects one-shot TTS only. The agents block TTS overrides (`aiConfigStore.js:176-185`; KNOWN-BUGS.md:2671-2675), and eleven_v3 ignores `speed` (`elevenLabsTTSService.js:11-21, 191-202`).
  - `stt-config.json`, `callout-state.json`, `lurk-scenes-state.json`, `motion-armed-state.json`, `ai_agent_state.json`.
  - `super-powers.json`: jaw, LED sync, head tracking, background music, AI motion, Follow Orders.
  - The constants and env knobs in section 3.1.
- **ElevenLabs side only:** prompt, first_message, LLM, temperature, max_tokens, RAG/knowledge base, turn settings and soft-timeout fillers, `client_events`, VAD, speech recognition, agent TTS (including `optimize_streaming_latency`), max duration, client overrides.

**API key** (`elevenLabsConfigService.getElevenLabsConfig`, 66-100)
- Reads `/etc/monsterbox/elevenlabs.key` first. On Orlok it exists, mode 0600.
- Otherwise `ELEVENLABS_API_KEY` from the environment, or from `.env` (parsed by hand, 22-60). This `.env` has no ElevenLabs key.
- Base URL from `ELEVENLABS_BASE_URL` or the default. Timeout from `WEBSOCKET_TIMEOUT` (default 30000).
- The WebSocket service reads the key lazily (346-349); `elevenLabsAgentService` reads it in its constructor (11).

## 7. AI-config UI (for scoping a later UI update)

| Page | Files | Backend | Notes |
|---|---|---|---|
| `/ai-settings` (overview + test chat) | `views/ai-settings/index.ejs`, `public/js/ai-settings.js` | `aiSettingsRoutes.js:51-77, 126-185, 187-220` | its "autonomous" toggle opens a **separate browser agent session** (336-345, 614-642), not the headless AI mode |
| `/ai-settings/stt` | `stt.ejs`, `ai-settings-stt.js` (presets 70/115; config 230/357/636; test socket 981) | `/api/elevenlabs/stt/config` 438-455, presets 456-490 | writes the **selected** character's `stt-config.json`; no effect on the agent path |
| `/ai-settings/tts` | `tts.ejs`, `ai-settings-tts.js` (config 52/505; `conversationalMode` 91/282/398; link to the ElevenLabs agent page 408) | `/api/elevenlabs/tts/config` 492-508 | one-shot TTS only |
| `/ai-settings/agents` | — | redirect, `aiSettingsRoutes.js:99-101` | agent UI was removed; the CRUD API remains (`elevenLabsApiRoutes.js:226-294`) |
| `/setup/characters` | `views/setup/characters.ejs` (164, 398) | `/setup/characters/api/characters`, `GET /api/elevenlabs/agents` | assigns `elevenLabsAgentId` |
| Dashboard `/conversation` | `views/conversation/index.ejs`, `showtime.ejs`, `public/js/dashboard.js`, `dashboard-v2.js` | ai-on/ai-status, lurk-mode, motion-sensor, say, speaker-mute, feature toggles | AI toggle 1196-1208; lurk 281-310; chat 816-860 |

**No UI at all for:**
- callouts (`conversation.js:1488-1530`) and lurk scenes (1536-1570). The dashboard only reads `calloutMode` (298-303).
- stop-speaking.
- the agent's prompt, LLM, turn settings and `client_events`.
- the voice-gate and barge-in constants.

---

## 8. Likely causes of each symptom (kept separate from the map)

**Log evidence used below** (Oct 3-4, `monsterbox.log.4.gz` and `.5.gz`, when Orlok ran headless sessions):
- **Barge-ins:** 1,811 "Barge-in (guest)", and **zero** triggered by the agent.
- **Junk turns:** 2,181 user transcripts were literally `...`; the next most common was `Yes.` (17).
- **Player exits:** 1,691 of 1,902 persistent-player exits were code 1. KNOWN-BUGS.md:1385 attributes these kills/EPIPEs to barge-in. `monsterbox.err` has 1,525 `write EPIPE` lines for `pcm_3_default`.
- **Socket closes:** 74 code 1005, **29 code 1000 "Max call duration exceeded"**, 17 code 1006, 1 code 1002 "No user message received for 60 seconds".
- **PIR sleeps:** 126.
- **After the final Oct 4 restart** (with `MB_BARGE_IN=0`): 0 barge-ins. 14 transcripts, some of which read like character speech ("You think you can command the weak?").
- **Since Oct 5:** no headless sessions on Orlok, only one-shot callouts, and all player exits were code 0.

### Symptom 1 — slow to respond

- **One-shot path cost (high confidence).** Each ask pays for a signed URL, a handshake, initiation, and generating a greeting that is then discarded, before the answer starts.
  - KNOWN-BUGS.md:2595-2600 measured **10-13 s** from end of speech to reply audio, versus 2.4-3.6 s on a persistent session.
  - The first sound is also held until the `agent_response` event arrives (2753-2766, 2790-2794).
  - Callers block until the 30 s close (2816-2879): `/api/ask-ai`, scene `askAI`, and callouts' in-flight flag.
- **Deaf tail (medium-high).** The mic sends zeros until 2.5 s after the modelled playback end (998, 1008, 1951-1953).
  - Prompts end replies with a question (e.g. Orlok's prompt: "One question. End of every response.").
  - So a guest who answers immediately is zeroed out. The agent then waits its `turn_timeout` (5-8 s) and plays fillers (1.5-2.5 s soft timeouts, up to 3).
- **Agent-side settings (medium, not isolated).**
  - `optimize_streaming_latency: 0` on all six.
  - gpt-oss-120b, plus RAG pulling 20 chunks / 50k characters, plus ~10k-character prompts.
  - "normal" eagerness on Orlok, Mina and PumpkinHead.
  - Orlok's TTS speed is 0.75 and his prompt asks for stretched vowels.
- **Small local delays (low-medium).** 250 ms framing (2090), and 900 ms of real (noisy) audio from the gate hangover before zeros start (43).
- **Instrumentation can't tell which part is slow (fix first).**
  - In 2,291 turns, `transcript→first-audio` had a median of 3 ms: the agent's `user_transcript` arrives right before its audio.
  - `transcript→LLM-text` never logs (187).
  - The "speech end" anchor, `_lastVoiceAtMs` (1922), is refreshed by any noise above the gate (median 254 ms, 90th percentile 20.5 s, max 262 s).
- **`sayThis` latency.** Non-streaming eleven_v3 TTS plus ffmpeg pre-analysis happen before the first sound (`sceneExecutor.js:248-275`; jaw 1580-1726).

### Symptom 2 — replies too long, lecture-like

- **No hard length cap.** `max_tokens: -1` on all six live agents.
- **Long-form prompts and settings.**
  - Orlok's prompt asks for "two to four … clauses, around forty words" and stretched vowels, at speed 0.75.
  - Renfield's caps at 40-50 words.
  - Prompts are about 10k characters; RAG brings 20 lore chunks per turn; temperatures run 0.7-1.0.
- **Fillers add speech.** Up to 3 soft-timeout fillers per generation.
- **Scene `askAI` speaks every answer twice** (`sceneExecutor.js:295-299` and `314-338`).
- **Junk turns get full replies.** The `...` turns above.
- **Plus scripted speech:** callouts every ~5 min and sayThis lurk scenes every ~4 min.

### Symptom 3 — hard to interrupt, won't listen

- **Callout mode means no listening at all (high for Orlok).**
  - A PIR wake opens no agent session (`calloutService.js:196-199`; `conversation.js:1342-1350`). Orlok has `aiOnWake: false`.
  - CHANGELOG says this is on for five characters.
  - Orlok has had zero headless sessions since Oct 5.
- **The agent can't hear the guest while the character speaks (high).** It gets zeros during the reply and for 2.5 s after (1951-1953). Its own interruption model therefore never hears the guest, as the comment at 51-58 admits.
- **Agent-side interruption is off for four characters (high).**
  - `interruption` is missing from live `client_events` on PumpkinHead, Mina, Orlok and Sir Dragomir.
  - ElevenLabs docs say it "must be selected" for interruptions to work.
  - `transcribe_on_disabled_interruptions` is false on all six; I couldn't find its exact meaning in the docs.
- **Local barge-in is either off or self-triggering (high).**
  - It is off on Orlok (confirmed) and Renfield (per KNOWN-BUGS).
  - Elsewhere, because the echo floor tracks the quietest frame, the character's own voice trips the 2.2× threshold (KNOWN-BUGS.md:1382-1397). It also needs about 1.45 s or more of loud speech before it fires.
- **Noise turns.** The gate is 2× the noise floor. On Oct 4, room frames were 0.09-0.17 against a gate of 0.09, which produced the `...` turns. KNOWN-BUGS.md:2610-2619 also documents cross-talk between animatronics.
- **Deaf after 10 minutes (medium-high).** After a 600 s max-duration close, nothing reopens the session (755-771, no reconnect). The PIR only wakes on a sleep-to-awake change (`lurkMotionWatcherService.js:293-310`), so a busy yard stays deaf.
- **Sleep mid-conversation.** Guest speech doesn't reset the PIR inactivity timer, so sleep can tear down an active conversation.

### Symptom 4 — speech lags or cuts off mid-sentence

- **Barge-in kills (high where enabled).** Node-wide pkill (2391; `speaker_cli.py:248-260`). See the 1,691 code-1 exits above. Barge-in is still on for four of the six nodes by default.
- **Server close truncates queued audio.** At 600 s, or on a network close, stopStream SIGTERMs the shared pw-play (765). 29 such closes on Oct 3-4.
- **PIR sleep or AI-off teardown** does the same (1507, 1315).
- **One-shot 30 s close** (2831-2848): replies still playing about 31 s after the socket opened are cut.
- **Stops have no drain.** `stopPcmStream`/`stopStream` end stdin and SIGTERM back-to-back (488-489, 764-765).
- **Shared player killed by other sessions.** A browser session disconnecting, changing speaker part, or being reaped kills the shared player (2151, 628, 354-436 → 765). The diagnostic `GET /__audio/active-device` pkills everything (`server.js:531`).
- **Possible chunk reordering (inferred from code, not observed).** Un-awaited `writePcmStream` calls each do two async disk reads before writing (1032 → playback 456 → 82-95). This would sound like stutter rather than a clean cut.
- **Jaw/LED can lead the audio.** On the live path the jaw starts as soon as a chunk arrives (jaw 2059), with no `audioLeadTimeMs` compensation, while audio waits on disk reads and pw-play spawn. This may be heard as "speech lags".
- **CPU is not the main cause on Orlok** (low load). Head tracking at ~77% of a core per process on Dragomir, and the per-chunk disk I/O, are real but secondary.

## 9. Not verified / still open

- I didn't read peer nodes' local state (callout state, drop-ins, super-powers). Claims about other nodes come from CHANGELOG/KNOWN-BUGS.
- I couldn't find documentation for `transcribe_on_disabled_interruptions`.
- I didn't check whether the agent socket negotiates per-message compression (client `ws` ^8.18.3).
- There is no live turn-latency data on Orlok since Oct 4.
- The chunk-reordering and duplicate-player races are inferred from the code, not observed.

**Source:** ElevenLabs, "Conversation flow" (interruption must be a selected client event) — https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
