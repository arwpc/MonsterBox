# Yard Theater

Scripted cross-animatronic moments driven entirely through the existing
orchestration API (`/api/orchestration/animatronic/:id/say`, `/play-audio`,
`/say-all`). Standalone client — no application code involved.

```bash
node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json   # opening, at dusk
node scripts/yard-theater/perform.mjs moments/thomas.json          # once a night. ONCE.
node scripts/yard-theater/perform.mjs moments/thomas-single.json   # variant: one distant speaker
```

- Character lines play in each node's own voice from its own speaker — sound
  comes from the right place in the yard.
- Thomas's whisper is a pre-generated audio file (`data/audio-library/thomas-whisper.mp3`,
  a young man's voice, verified whisper) so it is not any character's voice and
  costs nothing at showtime.
- Music: drop a track at `data/audio-library/dusk-theme.mp3`; music steps skip
  gracefully until it exists. Deploy audio to all nodes with `npm run deploy:all`.
- Unreachable nodes are skipped with a warning (e.g. Renfield's node before its
  hardware exists) — the show goes on.
- Schedule at dusk with cron on the controller node, e.g.
  `30 18 31 10 * node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json`

Writing new moments: see the step format at the top of `perform.mjs`. Keep lines
under ~50 words (the fleet's voice-pacing law applies to theater too).
