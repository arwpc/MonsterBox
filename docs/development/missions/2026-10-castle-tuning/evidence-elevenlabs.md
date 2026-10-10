# ElevenLabs evidence — measured 2026-10-09 20:35–20:55 CDT from Orlok

All calls used the node key `/etc/monsterbox/elevenlabs.key` against `https://api.elevenlabs.io`. The claude.ai
ElevenLabs MCP connector is a DIFFERENT account (404 on every fleet agent) — never use it for the fleet.
Full agent JSON backups: `/home/remote/fleet-backups/elevenlabs-agents/20261009-203704/<id>-<Name>.json`.
Current OpenAPI spec used for field names: scratchpad `openapi.json` (2.3 MB, fetched 20:38).

## Live agent configuration (before this mission)

| Char | agent_id | llm | temp | max_tokens | prompt chars | KB docs | RAG | turn_timeout | eagerness | speculative | turn_model | soft timeout | `interruption` event | first-msg interruptions disabled | TTS model / voice / stab / sim / speed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 PumpkinHead | agent_0801k3f1dybkecj88sta18gwwrv5 | gpt-oss-120b | 1.0 | -1 | 7465 | 4 | on | 5 | normal | no | v2 | 2 s ×3 | NO | no | eleven_v3_conversational / Z7RrOqZFTyLpIlzCgfsp / 0.35 / 0.65 / 1.0 |
| 2 Mina | agent_8401k3f1dx98e05t94yp6kz4vf8n | gpt-oss-120b | 1.0 | -1 | 10272 | 7 | on | 6 | normal | no | v2 | 2.5 s ×1 | NO | YES | v3_conv / hkk1bPcdsxSQCLzLFMT2 / 0.3 / 0.8 / 0.87 |
| 3 Orlok | agent_0801k3f1dw7xe2g8r4jkbxk0gt2n | gpt-oss-120b | 0.83 | -1 | 10235 | 6 | on | 8 | normal | yes | v2 | 2.5 s ×3 | NO | no | v3_conv / Tj9l48J9AJbry5yCP5eW / 0.25 / 0.6 / 0.75 |
| 4 Sir Dragomir | agent_7901k3f1dza1ee68w1257zh3s9x6 | gpt-oss-120b | 1.0 | -1 | 10239 | 6 | on | 5 | eager | no | v2 | 2 s ×3 | NO | no | v3_conv / wXvR48IpOq9HACltTmt7 / 0.5 / 0.8 / 0.9 |
| 5 Groundbreaker | agent_4201k6s9y384f9v9hqmg67ygc645 | gpt-oss-120b | 0.7 | -1 | 4445 | 4 | on | 5 | eager | no | v2 | 2 s ×3 | yes | YES | v3_conv / vfaqCOvlrKi4Zp7C2IAm / 0.5 / 0.6 / 0.95 |
| 6 Renfield | agent_1501m04ks76jf5svnxb70zyvz6s1 | gpt-oss-120b | 0.9 | -1 | 9661 | 6 | on | 5 | eager | yes | v2 | 1.5 s ×3 | yes | no | v3_conv / zzG73sCjG25Zj6km5X4M / 0.35 / 0.75 / 1.05 |

Same on all six: `vad.background_voice_detection true`, ASR `scribe_realtime` pcm_16000 with the name keyword
list, `max_duration_seconds 600`, `text_normalisation_type` system_prompt (Orlok, Renfield: elevenlabs),
`expressive_mode true`, `audio_effects null`, `reasoning_effort null`, `thinking_budget null`,
`backup_llm_config default`, `rag.max_retrieved_rag_chunks_count 20`, `rag.max_documents_length 50000`.
Overrides allowed to the client: only `conversation.text_only` and (some) `agent.language`.

Knowledge base (48 docs in the workspace, 29 attached): per-agent 25–45 KB of text; Known Guests 4–15 KB each;
shared `KB_Yard_Registry_2026-08-16.txt` (587 B, empty registry). Mina's `KB_Mina_Songs.txt` already holds three
Romanian songs with `[sings]` (lullaby "Nani, nani, puiul meu…", waiting song, morning song).

## What the API offers now (from the spec)

- `TTSConversationalModel` enum: eleven_flash_v2, eleven_flash_v2_5, eleven_multilingual_v2,
  eleven_v3_conversational, eleven_v4, eleven_v4_turbo (DEFAULT now). `optimize_streaming_latency` deprecated no-op.
  `speed` 0.7–1.2. `audio_effects` = `{filter_preset_id (old_radio|robot|cheap_microphone|phone|low_quality_phone|bright_phone), distance 0–1, environment_id (small_room|big_room|hall|tunnel|street|valley|forest), send_level, background_noise_id}` — no pitch.
- `TurnConfig`: `turn_timeout` (default 7), `initial_wait_time`, `silence_end_call_timeout`, `mode` silence|turn,
  `turn_eagerness` patient|normal|eager, `spelling_patience`, `speculative_turn`, `retranscribe_on_turn_timeout`,
  `turn_model` turn_v2|turn_v3 (default v3), `interruption_ignore_terms`, `transcribe_on_disabled_interruptions`,
  `soft_timeout_config {timeout_seconds (-1 off), message, additional_soft_timeout_messages, use_llm_generated_message, randomize_fillers, max_soft_timeouts_per_generation, disable_until_first_user_message}`.
- `ClientEvent` enum includes `interruption`, `vad_score`, `agent_response_complete`, `tentative_user_transcript`,
  `agent_response_metadata`, `internal_turn_probability`. Interruptions only work when `interruption` is selected.
- `PromptAgentAPIModel`: `llm` (default gemini-2.5-flash), `max_tokens` (-1 unlimited), `temperature` (default 0),
  `thinking_budget` (0 off), `reasoning_effort` none|minimal|low|medium|high|xhigh|max, `knowledge_base[].usage_mode` prompt|auto, `rag`, `backup_llm_config`.
- `LLM` enum (fast candidates): claude-haiku-4-5, gpt-5.4-mini, gpt-5.4-nano, gpt-4.1-mini, gemini-3.5-flash-lite,
  gemini-3.8-flash, gemini-2.5-flash. Full enum in the spec.
- WebSocket: client sends `{user_audio_chunk}`, `pong`, `contextual_update {text, context_id}`, `user_message`,
  `user_activity`, `conversation_initiation_client_data {conversation_config_override, dynamic_variables}`;
  server sends `audio {audio_base_64, event_id, is_final, alignment}`, `interruption {event_id}`, `agent_response`,
  `agent_response_correction`, `user_transcript`, `vad_score`, `ping`, `agent_response_complete {event_id}`.
- Voice design: `POST /v1/text-to-voice/design {voice_description, text, model_id eleven_ttv_v3, reference_audio_base64, prompt_strength}` → previews with `generated_voice_id`; save with `POST /v1/text-to-voice {voice_name, voice_description, generated_voice_id}`. Remix only works on voices you own (400 on library voices).

## Measured latency (conversation history, `conversation_turn_metrics`)

| Char | real convs | llm_ttfb p50/p90 | tts_ttfb p50 | turn_silence_before_initiation p50/p90/max | ttf_audio_since_silence p50/p90 | words/turn p50/p90/max |
|---|---|---|---|---|---|---|
| Mina (09-27) | 6 | 0.72 / 0.84 s | 0.20 s | 14.7 / 21.4 / 26.9 s | 15.9 / 22.7 s | 34 / 53 / 69 |
| Renfield (10-08) | 1 (85 msgs) | 0.72 / 1.10 s | 0.17 s | 10.6 / 20.5 / 23.2 s | 12.1 / 21.8 s | 31 / 48 / 61 |
| Orlok/Dragomir/PumpkinHead/Groundbreaker | callout one-shots only since 10-05 | 0.65–0.94 s | 0.16–0.28 s | 0 | 1.1–1.5 s | 10–20 (maxWords) |

Transcript pattern in real conversations: agent 35–50 words → guest replies (often transcribed as `...` from
noise) → 14–22 s of "silence before initiation" → agent answers the noise. Orlok's callout conversations carry
~106 empty agent entries each (one per `contextual_update` from the body-state bridge, every ~0.5 s) and bill
17.5 k input tokens for a 25-token line.

## LLM A/B on the lab agent (duplicate of Orlok, `agent_6701m4hqprpefaj9xdnj9548cmpv`, simulate-conversation, 2 agent turns each)

| llm (thinking_budget 0) | llm_ttfb (s) | words/turn | notes |
|---|---|---|---|
| gpt-oss-120b (current) | 1.28, 1.11 | 34, 53 | in character, long |
| gemini-3.8-flash | 1.27, 1.15 | 35, 43 | |
| gemini-3.5-flash-lite | 0.78, 0.60 | 22, 30 | strong character, concise |
| gpt-5.4-mini | 0.79, 0.49 | 15, 26 | concise, fewer tags |
| claude-haiku-4-5 | 0.57, 0.48 | 53, 70 | fastest, verbose under the old prompt |

Single samples — re-measure with the rewritten prompts (3 runs each) before choosing per character.

## Orlok voice lab (scratchpad `voice-lab/`, scorer `f0.py`: median F0, p10 F0, sub-150 Hz energy fraction)

| sample | medF0 | p10F0 | sub150 |
|---|---|---|---|
| current voice preview (Tj9l48J9AJbry5yCP5eW "Count Orlok, Nosferatu", labels: male, middle_aged, bulgarian, serious) | 87.0 | 82.5 | 0.279 |
| current voice, eleven_v3 TTS of an Orlok line at 0.25/0.6/0.75 (`orlok-ref-v3.mp3`) | 87.7 | 81.6 | 0.473 |
| library "Azazel - Menacing and Gravelly Demon" ysswSXp8U9dFpzPJqFje | 101.9 | 81.5 | 0.274 |
| library "Bloodgrin VF - Villain" KTAbPR4QFlhaTpde6md8 | 121.2 | 90.4 | 0.041 |
| design from reference, prompt_strength 0.6, preview 0 `Jm2k1DWEAveWzLNs048G` | 89.4 | 83.7 | 0.532 |
| design ps 0.6 preview 1 `SlMWRB8QAEmhhwv9mUkx` | 93.6 | 82.5 | **0.611** |
| design ps 0.6 preview 2 `CMaR3QFb2QW8mQgxPCuC` | 91.4 | 86.2 | 0.569 |
| design ps 0.35 / 0.8 / 0.95 | 117–239 | — | ≤ 0.27 (higher pitched — rejected) |

Conclusion: no voice in reach is lower in pitch than Orlok's current one; the designed candidates keep his pitch
and add chest energy. Deeper perception has to come from timbre (candidate voice), the `[deep voice]` tag the
voice itself advertises, stability, and the audio path — measured, not assumed.
