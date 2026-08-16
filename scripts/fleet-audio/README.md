# Fleet Audio Ear-Check

The instrumented cast test. Every voice claim in `docs/development/HALLOWEEN-TUNING-REPORT.md`
was transcript- and timing-verified but never actually *listened to* — this listens.

For each reachable node it:

1. records that node's **own** microphones with the yard quiet, to establish a per-mic noise floor;
2. starts every microphone recording, then casts a known in-character phrase through
   `POST /api/orchestration/animatronic/:id/say` (which proxies to that node's
   `/api/elevenlabs/generate-and-play`, i.e. the character's real voice and TTS config);
3. measures the captured **speech envelope** — 250 ms frames, p90 versus the mic's own median floor;
4. transcribes the capture with ElevenLabs Scribe and scores word recall against the cast phrase;
5. judges the node on its best microphone and prints an audible/silent matrix.

A node is `AUDIBLE` only if the speaker measurably rose above the noise floor **and**
Scribe read back at least half the words. Level alone can be a passing car; words alone
can be another animatronic carrying across the yard.

## Why it records every microphone

Nodes have two capture devices (a USB audio adapter and a webcam). On Orlok the
adapter's mic jack is **empty** and reports a dead-flat electrical noise floor, while the
webcam carries the real acoustic signal — so guessing "the" microphone produces a false
`SILENT`. Recording all of them and scoring each is the only way to tell an unplugged
jack from a dead speaker. Mics with a floor that never varies are flagged as such.

## Usage

```bash
node scripts/fleet-audio/earcheck.mjs                 # every node in config/animatronics.json
node scripts/fleet-audio/earcheck.mjs --nodes 2,3     # a subset, by animatronic id
node scripts/fleet-audio/earcheck.mjs --seconds 12    # longer capture window
node scripts/fleet-audio/earcheck.mjs --keep          # keep the WAVs for listening
```

Requirements: passwordless SSH to each node (`remote@<ip>`), `arecord` on the nodes, and
an ElevenLabs key in `ELEVENLABS_API_KEY` or `/etc/monsterbox/elevenlabs.key`.
Exit code is non-zero if any reachable node came back `SILENT` or `GARBLED`.

## Verdicts

| Verdict | Meaning |
|---|---|
| `AUDIBLE` | Rose above the floor and the words came back. |
| `FAINT` | Intelligible but quiet — fine indoors, likely lost in a busy yard. |
| `GARBLED` | Loud but unintelligible — clipping, distortion, or mic placement. |
| `SILENT` | No speech detected, or the say/TTS call itself failed. |
| `OFFLINE` / `NO-MIC` / `CAPTURE-FAILED` | Could not be tested; the reason is printed. |

Results (JSON matrices) land in `results/`. WAVs are gitignored.
