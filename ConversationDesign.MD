## ElevenLabs Conversational Agent on RPi4b (PipeWire) — MonsterBox Design

Purpose
- Deliver an Alexa-like, low-latency conversational agent on Raspberry Pi 4b that reuses MonsterBox services.
- Keep ElevenLabs API key on the Pi (not in browser) with a simple, secure install flow.
- Support both microphone paths: browser mic (remote testing) and server mic (animatronic on-device).

Guiding principles
- Reuse, don’t fork: integrate with existing services/routes/clients where possible.
- Low-latency streaming: 16 kHz mono PCM in 20–40 ms chunks, immediate playback, barge-in.
- PipeWire/WirePlumber first: real device routing for speakers and microphones.
- Operational clarity: observable events, minimal buffering for smoothness.

What exists to reuse (selected)
- ElevenLabs ConvAI WS scaffolding: services/elevenLabsWebSocketService.js
  - Signed URL fetch; conversation_initiation_client_data; forwards agent audio to client.
- STT/TTS services: services/elevenLabsSTTService.js, services/elevenLabsTTSService.js
- Server microphone capture @16k PCM: services/serverSTTListener.js + python_wrappers (PyAudio wrappers)
- Server playback via PipeWire sink: services/serverPlaybackService.js (speaker_cli.py wrapper)
- Front-end chat handling: public/js/enhanced-test-chat.js (handles audio_base_64 via server speaker or local fallback)
- Audio routing utilities and device CRUD: Setup → Audio, parts/types speaker & microphone

High-level architecture
1) Input (two modes)
   - Browser mic (remote test): getUserMedia + MediaRecorder (opus/webm) for compatibility; client WS sends chunks to server; server will (vNext) transcode to 16k PCM before sending user_audio_chunk to ElevenLabs WS.
   - Server mic (animatronic): PyAudio/ALSA via PipeWire source @16 kHz mono PCM, sliced into 20–40 ms frames; sent as user_audio_chunk from server to ElevenLabs WS.
2) Agent conversation (real-time)
   - services/elevenLabsWebSocketService.js maintains a per-session WS to ElevenLabs ConvAI.
   - On agent audio events (audio_base_64), forward to client and/or play through character’s configured speaker.
3) Output playback
   - Preferred: server-side playback through character speaker via PipeWire.
   - Optional: browser playback fallback (autoplay on click path enforced by UI interactions if needed).
4) Barge-in
   - On interruption events from ElevenLabs, stop current playback immediately and prioritize mic input.

Protocols and formats
- Mic → Agent
  - Required by ElevenLabs: base64 16-bit PCM, 16,000 Hz mono in small frames: { "user_audio_chunk": "<base64>" }.
  - Browser path (current): opus/webm chunks; vNext: transcode on server before forwarding.
  - Server path (existing capture): already 16k PCM WAV; slice into frames and strip WAV header per chunk or capture raw PCM frames.
- Agent → Audio
  - ElevenLabs emits { type: "audio", audio_event: { audio_base_64: "..." } }.
  - We keep base64 → serverPlaybackService.play with character speaker device.

Dual microphone strategy
- Keep both paths:
  - Browser mic: convenient remote testing; lower fidelity; requires server transcode step before forwarding to agent.
  - Server mic: authoritative animatronic input; 16 kHz PCM; best for wake-word/VAD and hardware scenarios.
- UI/UX
  - Toggle/select source in the Chat/Agent UI (e.g., “Mic: Browser | Server”).
  - Display VU meter for the chosen source (browser VU locally; server VU via existing audio-level API).

Barge-in and playback control
- Detect interruption/turn-detection events from the ElevenLabs agent WS.
- Immediately stop active server playback stream(s) (via services/serverPlaybackService + stream routing utils).
- Resume/continue capturing mic and forwarding frames.

Authentication & key management (Pi-only)
- Keep xi-api-key on the Pi, never in the browser.
- Supported secure installs (choose one):
  1) Environment variable: export XI_API_KEY=sk_...
  2) File-based secret: /etc/monsterbox/elevenlabs.key (600 permissions); server reads the file at startup.
- UI masks the key in AI Settings; server-side only usage.

Performance notes
- Target initial-playback under ~250 ms from first audio packet.
- Start playback when small buffer (~120–250 ms) is accumulated to smooth jitter.
- Favor WAV/PCM path to character speaker (pw-play or mpg123 for MP3 with proper routing env vars).

Testing plan (must-have)
- Unit/API tests (Mocha): 
  - agents list/create/update; conversation/test routes; playback route returns 200 and enqueues playback.
- Playwright e2e (Firefox headless on RPi4b):
  - “Simulated Conversation” tests that:
    - Open Agents → Chat modal, select an agent and character with a speaker.
    - Toggle output between Local (browser) and Speaker (server).
    - Enter text; verify partial/complete responses appear; audio auto-plays (Local) and server logs playback (Speaker).
    - Optional: start/stop “Live” WS with mic; for browser mic path, send a short canned utterance; for server mic path, ensure source exists then verify events.
- Determinism: use MB_TEST_MODE to short-circuit ElevenLabs to a fixture when network unavailable.

Rollout plan
1) Keep current behavior working (browser path + server playback) while introducing server mic streaming to agent.
2) Add barge-in: wire interruption → stop playback.
3) Add transcode path for browser mic → PCM16k user_audio_chunk.
4) Add e2e Playwright tests for simulated conversations (Local and Speaker playback).

Risks & mitigations
- Webm/opus → PCM live transcode cost on Pi: choose a low-CPU tool (ffmpeg with limited resample) and buffer minimally.
- Autoplay policies in browsers: retain “user gesture” via UI to permit Local playback; server mode unaffected.
- Device routing drift: expose status in Setup → Audio; include quick route-repair actions.

Acceptance criteria
- Both mic modes usable; server mic streams PCM16k to agent.
- Barge-in stops playback with <100 ms delay after event receipt.
- Server speaker playback is the default for Character conversations; Local playback works as a fallback.
- Playwright simulated conversations pass on RPi4b (Firefox headless).

Next work items (tracked separately)
- Implement server mic → user_audio_chunk framing.
- Implement interruption event handling → playback stop.
- Implement browser mic transcode path before forwarding to agent.
- Author Playwright e2e conversation tests.

