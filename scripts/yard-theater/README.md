# Yard Theater

Scripted cross-animatronic moments driven entirely through the existing
orchestration API (`/api/orchestration/animatronic/:id/say`, `/play-audio`,
`/say-all`). Standalone client — no application code involved.

```bash
node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json   # opening, at dusk
node scripts/yard-theater/perform.mjs moments/thomas.json          # once a night. ONCE.
node scripts/yard-theater/perform.mjs moments/thomas-single.json   # variant: one distant speaker

node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json --dry-run   # no sound, no calls
node scripts/yard-theater/verify-moment.mjs moments/dusk-ceremony.json --volume 0.12
```

- Character lines play in each node's own voice from its own speaker — sound
  comes from the right place in the yard.
- Nodes that are missing from `config/animatronics.json` or simply not powered
  are found in one preflight (`GET /api/orchestration/status`) and their steps
  are skipped instantly with a warning — the show goes on, and it does not stall
  ~20 s per dead node waiting for a socket.
- `--dry-run` prints exactly what would be sent and touches nothing. Use it to
  check a new moment, and to check a cron line before Halloween.

## Audio steps need a registered library entry

`POST /api/orchestration/animatronic/:id/play-audio` requires the library's
`audioId` and rejects a bare filename with 400. `perform.mjs` therefore resolves
`filename` → `audioId` from each node's OWN audio library (ids are per-node
because audio is deployed per node). A file that is not in a node's library is
skipped with a warning rather than failing the moment.

A file is in the library when it sits in `data/audio-library/files/` — the
library service scans that directory and registers anything it finds, using the
base filename as the id. So:

```bash
cp data/audio-library/thomas-whisper.mp3 data/audio-library/files/
# drop a music track in the same place:
cp ~/dusk-theme.mp3 data/audio-library/files/
npm run deploy:all           # every node needs its own copy
```

- Thomas's whisper is a pre-generated audio file (a young man's voice, verified
  whisper) so it is not any character's voice and costs nothing at showtime.
- Music: `dusk-theme.mp3` does not exist yet; the dusk-ceremony music steps skip
  gracefully with a warning until it does.

## Verifying a moment actually reached the yard

`perform.mjs` returning 200 only proves the API accepted the call.
`verify-moment.mjs` runs the moment for real with every node's own microphone
open, transcribes each capture with ElevenLabs Scribe, and scores it against the
lines that moment cast at that node. A node passes only if its mic rose above
its own noise floor AND read back the words — the same two gates as
`scripts/fleet-audio/earcheck.mjs`, applied to a whole show.

`--volume 0.12` records each node's current sink volume, sets the rehearsal
level, and restores the original in a `finally` block even if the run throws —
so the ceremony can be rehearsed at 3am without waking the street.

## Scheduling

See `crontab.example` — and read its header, because two things in it are
load-bearing: `/home/remote/yard-theater-logs/` must exist first, and the
`cd /home/remote/MonsterBox &&` is required (cron runs with cwd=$HOME).

Writing new moments: see the step format at the top of `perform.mjs`. Keep lines
under ~50 words (the fleet's voice-pacing law applies to theater too).
