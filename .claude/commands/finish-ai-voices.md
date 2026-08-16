# Finish AI Voices — v9.1 integration & test

Fully integrate and verify the AI-voices milestone (`git tag ai-voices-2026-08-16`)
against the current codebase for the v9.1 build. The newest ElevenLabs techniques
and agent shapes are already in this repo: agent config snapshots in
`config/elevenlabs/` (with restore README), the full session record in
`docs/development/HALLOWEEN-TUNING-REPORT.md`, and transcripts in
`docs/development/CONVERSATION-SAMPLES.md`. Treat the snapshots as the canonical
persona state — never regress an agent below its committed snapshot.

Work every §6 open item in HALLOWEEN-TUNING-REPORT.md to done:

1. **Fleet audio ear-check (the blocker).** A microphone must exist first
   (this node's webcam mic was disconnected; its dongle jack was empty). Then run
   the instrumented cast test — TTS-cast every character per node while recording,
   measure dB, transcribe with Scribe — and produce a per-node audible/silent
   matrix. Fix what's silent (mixer, sink routing, cabling notes for the human).
   Verify Orlok's 0.75 TTS speed and each v3 voice by ear; adjust only with reason.

2. **Renfield's node online.** Hardware exists (speaker, mic, 12V shake motor).
   Add his `config/animatronics.json` entry (real IP), calibrate the shake-motor
   pins in `data/character-6/parts.json`, drop an image at
   `public/images/characters/renfield.jpg`, deploy, and confirm his lurk scenes
   (`data/character-6/scenes.json`) play speech + shake concurrently.

3. **Yard Theater + Night Memory into the build.** `scripts/yard-theater/` and
   `scripts/night-memory/` are standalone; verify against the current
   orchestration endpoints, run the Dusk Ceremony end-to-end on real speakers,
   confirm the cron schedule (`scripts/yard-theater/crontab.example`), and do one
   real `harvest.mjs` run — verifying the PHI scrubber output (FIRST NAMES ONLY)
   before the registry attaches.

4. **Gesture engine** per `docs/development/GESTURE-ENGINE-SPEC.md` — honor its
   §10 coordination contract and §8 safety invariants exactly (calibrated poses
   only, ch4/ch5 serialization, bow minimum, kid-safe gestures).

5. **Harness fix:** the judge personalization criterion must not fail
   conversations where the visitor refuses to give a name.

Then regression-verify: re-run the judge panel
(`node scripts/halloween-judges/simulate.mjs --count 5`) — every character must
score at or above its report baseline (Renfield 100% delight, Mina 93%,
PumpkinHead 91%, Dragomir 89%, Orlok 80%). Run the relevant area tests and
`npm run gate` before every push. Small commits, `v9.1.0: [phase] ...` format.
Update the report's §6 and CHANGELOG as items close. Field-only items
(Groundbreaker × teens) get a Halloween-night observation note, not sim churn.
