# Session progress — 2026-08-19 (continuation, v10.1 run)

Live running record so a stop-out resumes here rather than at zero.

## Standing constraints
- **AUDIO OFF.** Operator confirmed: *moving hardware is fine, no loud audio.* No unmute, no TTS,
  no AI enable, no conversation mode. All three nodes verified `muted:true`.
- MCP writes to ElevenLabs: **APPROVED** by the operator this session.
- Never commit: `.mcp.json`, `config/app-config.json`, `data/audio-library/library.json`,
  `data/character-2/poses.json`, `data/character-2/super-powers.json`, `data/character-2/ai_agent_state.json`.

## DONE (committed)
- `c9d8bc46` **Calibrated stamp** — `isCalibrated()` in store, `POST /api/calibration/:partId/calibrated`,
  toggle on the Bounds panel of `unified-calibration.ejs`. Works for ALL capability kinds (only
  absolute-servo has bounds; continuous-servo / openloop-linear are `bounds:null`). Refuses only a
  degenerate window. Stamp OFF is reversible — numbers stay on disk, just untrusted.
- `7200ded9` **Speaker mute now survives a restart** — was `this._speakerMuted = false` in the
  constructor, in-memory only. Persists to `data/speaker-state.json` (gitignored), restored
  synchronously at construction. PROVEN through a real deploy+restart of all three nodes.

## DONE (external — ElevenLabs, verified in each write response)
All six agents: `optimize_streaming_latency` → 0, `# Names` correction section, audio tags registered.
KB / pronunciation dictionaries / voice settings verified untouched on every write.

| agent | latency | tags | # Names |
|---|---|---|---|
| Orlok | already 0 | 7 | already present |
| Mina | already 0 | **still `[]` — TODO** | already present |
| Sir Dragomir | 3→0 | 0→5 | added |
| PumpkinHead | 3→0 | 0→4 | added |
| Groundbreaker | 3→0 | 0→2 | added |
| Renfield | 3→0 | 4 kept | added |

## KEY FINDINGS
1. **`optimize_streaming_latency: 3` does NOT disable the text normalizer** — level **4** does.
   Verified against current ElevenLabs docs. The inherited diagnosis was wrong on the mechanism
   (3 = max latency optimizations, quality-degrading but normalizer still on).
2. **The real normalizer control is `text_normalisation_type`, and it differs per agent:**
   Orlok `elevenlabs`, Mina + Dragomir `system_prompt`. Never reconciled.
3. **`overrides.conversation_config_override.tts.*` is ALL `false` on every agent.** Client TTS
   overrides are structurally disabled, so local `tts-config.json` CANNOT reach the conversational
   path regardless of what MonsterBox sends. This is the confirmed root of "tuned values do nothing
   in conversation." Only `text_only` and `language` are overridable.
4. **Mina alone has `ignore_default_personality: false`** (Orlok/Dragomir `true`) — ElevenLabs'
   default personality is blended into her.
5. **The modelId fix had never been DEPLOYED.** Orlok and Dragomir were running the old
   `config.modelId` code while reporting version 10.0.1 (deploy copies files; git HEAD stays stale —
   Dragomir's git HEAD read v9.3.0 with 107 dirty files). Deployed this session; verified present.
6. **Sir Dragomir's neck**: channel was already correct (head ch1 / jaw ch0). The remaining cause was
   #5 — his continuous servo (`servo_miuzei_25kg_continuous`, 900–2100us, neutral 1500) was getting
   `{}` defaults, putting the STOP point in the wrong place. Hardware test in flight.
7. **`KB_Mina_Songs.txt`** (`xlHMQoRSAqWRe71tqKEh`) exists — addendum B answered. Her prompt now
   names the lullaby / waiting song / morning song.

## STILL OPEN
- Mina `suggested_audio_tags` is empty though her prompt uses [whispers]/[sighs]/[sings]/[crying].
- Mina `ignore_default_personality: false` — reconcile with the other two?
- Mina prompt has a duplicated sentence in Goal item 6 (pre-existing).
- PumpkinHead prompt self-contradicts: "You never use audio tags" vs its own Audio Tags section.
- Why Orlok's ASR `keywords` (already containing "Mina") did not prevent the Anya/Marniak drift.
- Ghost-settings + persistence sweeps: harvest, triage into KNOWN-BUGS.
- Browser page-by-page sweep; OpenCV `#ocvEnabled` checkbox triage.
- Log review; docs; `.claude/settings.json`; version bump + ship v10.1.
