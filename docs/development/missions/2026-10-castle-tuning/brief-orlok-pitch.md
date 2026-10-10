# Brief — Orlok's deeper voice on the playback path (follow-up to D1/D2; daylight audition)

The operator asked for a deeper Orlok. The persona-writer measured every ElevenLabs lever (report-personas.md,
voice-lab table): the current voice "Count Orlok, Nosferatu" (Tj9l48J9AJbry5yCP5eW) has a fundamental of 71–80 Hz,
no library voice is lower, the designed candidate (Jm2k1DWEAveWzLNs048G, kept in the workspace for audition) is
*higher* and faster, the `[deep voice]` tag moves nothing, stability is noise, and ElevenLabs has no pitch
control. The only lever that measurably deepens him without changing the character is a node-side pitch shift on
the playback path: ffmpeg `rubberband` at −1 to −3 semitones raised the sub-150 Hz energy share from 0.47 to
0.62–0.68 on the same lines.

Owner: the conversation-engineer (services/serverPlaybackService.js and the WebSocket agent audio path), after D1
lands. Deliver:

1. A per-character playback option `voice.pitchSemitones` (node-local, in that character's `ai-config/tts-config.json`
   next to the voice id; default 0 = bypass; Orlok to be tuned by ear in daylight, start at −2). Applied in ONE
   place so every path gets it: cached `sayThis` clips, one-shot TTS, and the agent's streaming PCM chunks.
2. Streaming: a persistent `ffmpeg -f s16le -ar <rate> -ac 1 -i pipe:0 -af rubberband=pitch=<2^(st/12)>:pitchq=quality -f s16le pipe:1`
   stage between the chunk writer and `pw-play` (or `asetrate`+`atempo` if rubberband is missing on a node:
   check `ffmpeg -filters | grep rubberband` per node). Measure the added latency (guest-speech-end → first
   audio, the instrumentation from D1) and keep it under 120 ms, or disable the shift on the streaming path and
   apply it to file playback only, saying which in the report.
3. Files: shift at render time when the cache writes the clip (so the cache key includes the semitones), never on
   every play.
4. Proof: F0 and sub-150 Hz share before/after on three lines (the persona-writer's scorer is under
   `/home/remote/mission-scratch/w3/`), latency numbers, and a daylight ear-check by the operator at normal
   volume: the operator decides the semitone value. Nothing ships enabled until that audition.
