# v11 — Operator decisions (dated, binding on implementation)

Decisions Aaron made during v11 planning that override or refine written constraints.
Implementation agents read this before touching the affected areas.

## 2026-08-20 (v11 stream-research review)

1. **Delete the orphan polled-STT routes.** `/api/elevenlabs/stt/listen/start|stop|status`
   and the orphan HTTP converse path are removed outright, not kept as adapters. This is a
   deliberate, operator-approved exception to CLAUDE.md's "PRESERVE all existing API
   endpoints" — they have no caller anywhere in the repo, and one produced the failing
   `stt_*` sessions of 2026-08-19/20. When removing them, note the carve-out in CLAUDE.md so
   the preservation rule stays honest.

2. **Remove the TTS tuning sliders from `/ai-settings/tts`; identity becomes read-only with a
   deep link to the ElevenLabs agent.** Tuning values come only from the committed snapshots
   in `config/elevenlabs/agents/`. This kills the second config-clobberer (the page's own
   Save posting page defaults) at the vector rather than patching writers one at a time.
   Consistent with his standing rule: dead or lying controls are removed, simple ElevenLabs
   settings may be surfaced, and there must be a link out to ElevenLabs.

## Standing decisions that keep governing v11 (recorded elsewhere, listed for routing)

- Mina's voice acceptance: **no Romanian accent, does whisper, no singing** — the live agent
  prompt currently violates this (SONG paragraph, "sings" tag, `KB_Mina_Songs.txt`); fixing
  it is authorized by the acceptance criteria themselves.
- Dragomir's voice stays `wXvR48IpOq9HACltTmt7` ("Ancient Monster - Evil and Scary",
  ElevenLabs renamed the tuned "Dante") — never "fix" it back.
- Safety teardown and calibration-page Advanced-tab removal remain **deferred** (V11-HANDOFF).
- Scope discipline: new findings get written down, not chased ("finishing beats improving").
