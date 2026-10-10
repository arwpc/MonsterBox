# Report: scene-author, Lady Mina (character 2)

Worker report, 2026-10-10 daytime; saved by the lead. Nothing committed by the worker; no code, test or other
character's data touched; no hardware driven; no audio played; service not restarted.

## Files

- Show files `data/character-2/poses.json` (10 poses) and `scenes.json` (10 scenes), written through
  `POST /poses/api/replace?characterId=2` and `POST /scenes/api/replace?characterId=2` after a validate-only pass
  (clean, no warnings). Backups: `data/character-2/backups/{poses,scenes}.pre-castle-tuning-20261010.json` (manual)
  and the endpoint's own `poses-2026-10-10T15-56-14-863Z.json` / `scenes-2026-10-10T15-56-14-993Z.json`.
- Lullabies: three new clips in `data/audio-library/files/` plus their entries in `library.json`.
- Generator `/home/remote/mission-scratch/scene-mina/gen.py` (+ `measure.mjs`, `push.sh [validate]`, `songs.json`
  with the exact lullaby TTS texts, `dry-<id>.json`).

## The rig

Only the Burning Rose lamp (part 5) is used; jaw 1, neck 2, eye 3 and coffin door 4 appear in no pose or step; the
laser (10) is not used. No head tracking (no pan servo). Every `sayThis` plays one-shot because jaw animation is
off in her `super-powers.json`. Lamp rules: `on` with `duration` > 0 lights that long then goes off (blocking),
`on` with 0 latches, `off` clears.

## The lullabies (pre-rendered `audio` steps, `jawSync:false`)

Rendered through the scene TTS cache (`prerender-scene-tts.mjs --character 2 --text ...`): eleven_v3, voice
`hkk1bPcdsxSQCLzLFMT2`, stability 0.3, similarity 0.8; each text starts `[softly] [sings]`, no accent tag, sings
the verse twice with a hum or sigh between. Registered by copying each cached clip into `data/audio-library/files/`
under a clear basename, running the library's `rescanLibrary()` (id = basename, so the id is the same on every
node), then setting title, tags (`mina-lullaby`) and category via `PUT /audio-library/api/audio/<id>`. The upload
endpoint was avoided because it assigns a random UUID.

| id (= basename) | song | length | used in |
|---|---|---|---|
| `mina-lullaby-drumul` | the waiting song, "Pe drumul lung" | 28.0 s | scene 1 (lurk) |
| `mina-lullaby-zori` | the morning song, "Vino, zori" | 25.8 s | scene 2 (lurk) |
| `mina-lullaby-nani` | the lullaby, "Nani, nani" | 31.2 s | scene 6 (story) |

Mean level ≈ −20 dB, peaks under −0.4 dB. Nobody has heard them yet.

## The ten scenes

Story pieces 4–6 and the send-off 7 start with `fleet-mode hold` on Mina (`force:true`, `maxMs` longer than the
piece) and end with `release`; lurk pieces, the greeting and the event parts never hold. Beds are concurrent at
16–20 % because she whispers. Casts play once (`waitMs:0`, concurrent) to Goblins 2 and 3.

| id | name | what happens | audio | casts | fleet | length |
|---|---|---|---|---|---|---|
| 1 | Mina: The Long Road | Lurk, no speech: rose wakes in slow breaths, waiting song under slow blinks, last glow, Home | `mina-lullaby-drumul` 75 % | – | – | ≈40 s |
| 2 | Mina: Come, Morning | Lurk, no speech: flickers, long glow, morning song under slow blinks, last glow, Home | `mina-lullaby-zori` 75 % | – | – | ≈39 s |
| 3 | Mina: Someone Above | Wake: coffin creak, rose kindles: "Someone is there... above me. Come closer, and tell me: is the sky clear tonight?"; rose stays lit for the conversation | `old-wardrobe-door-squeaking-sound` 55 % | – | – | ≈11 s |
| 4 | Mina: The Dream-Gift | She dreamed of the guest; the floating lady appears in the big window; a kind omen; the Count answers about the corn | bed `haunting-music-box-melody` 20 % | Goblin 2 `Floatinglady.mp4` | fleet-say Orlok | ≈80 s |
| 5 | Mina: The Waiting | Waiting every night for someone who promised to come home; choosing the morning; the moon in the little window; the knight says the night is quiet; "Renfield at the road will offer you paper. Sign nothing." | `whispers-of-the-haunted-sounds` 18 %, `whispers-in-the-dark` 16 % | Goblin 3 `Moon.mp4` | fleet-say Sir Dragomir | ≈85 s |
| 6 | Mina: The Knight on the Hill | The knight who barred the door unasked; the Count answers from the hall; she sings the knight the lullaby while sirens sway; sends the guest up the hill | bed `whispers-in-the-dark` 18 %; `mina-lullaby-nani` 75 % | Goblin 2 `Pha Siren Sirenssway Win H.mp4` | fleet-say Orlok | ≈98 s |
| 7 | Mina: Up to the Knight | Send-off: tell Sir Dragomir the night was quiet, tell the Count nothing of me; the knight hails the guest; rose fades | – | – | fleet-say Sir Dragomir | ≈39 s |
| 8 | Mina: The Voice Below | Event 1, verbatim; rose latches before the first word, one blink between lines, off, Home | – | – | – | ≈30.0 s (budget 30) |
| 9 | Mina: Sing the House to Order | Event 2, verbatim; three slow blinks land under the song (song starts 3.1 s into the clip), one long blink before the last line | – | – | – | ≈34.0 s (budget 34) |
| 10 | Mina: The Bridge | Event 3, verbatim; rose lights on the first sung note (4.4 s) and blinks on each "nani"; 9 s wait for the conductor's BRIDGE-all; BRIDGE-Mina-2; off, Home | – | – | – | ≈31.2 s (budget 30) |

Lines 7–21 words, whispered (`[whispers]`, `[sighs]`, `[exhales]`, `[breathes]`; the only `[giggles]` is from the
event script); never `[Romanian accent]`. No Thomas and no coffin darkness in the story pieces (children may hear
them). Fleet-say answers follow each speaker's rules; every piece stands alone if an answer is skipped.

## Poses (10, all on part 5)

Scene poses: 1 Home (rose off), 2 Rose Kindled (latched on), 3 Rose Ember (0.8 s pulse). Idle poses (tag `idle`,
weight, holdVariance, transitionDurationMs): 10 Ember Breath (1.5 s), 11 Flicker (0.3 s), 12 Heartbeat (0.6 s),
13 Slow Glow (3.5 s), 14 Long Remembering (6 s), 15 Candle (2.2 s), 16 Dark Rest (off).

## Proof

- `node scripts/validate-scenes.mjs 2`: 0 errors, 0 warnings (no broken-part warnings); `all` also 0/0.
  `npm run validate:scenes` exits 0 but reports two stale baseline entries (Mina's old scene 100 `audioFile`,
  Orlok's old scene 107) — removed by the lead.
- `validate:schemas` passed (6); pact 72 passing.
- Prerender: 26 unique lines, 24 rendered, 2 cached, 0 failed; the four fleet-say answers warmed (prerender 3 and
  4). Clips 4.2–14.6 s.
- Dry runs ids 1–10: all HTTP success, scene `success:true`, 0 failed; step counts 19, 22, 6, 35, 31, 47, 17, 19,
  26, 18; hold/release/stop-audio → .140 (self); fleet-say → .120, .130.

## Needs hands

1. Push to .140: `poses.json`, `scenes.json`, the three `mina-lullaby-*.mp3` files (her startup rescan registers
   them by basename), `data/tts-cache/2/` (or prerender there; her tts-config must match the repo's), and current
   code (fleet steps, hold/release, cast by name, the long-audio timeout fix: her songs run 26–31 s).
2. Daylight ear-check on her node: do the songs sound sung, soft and in tune; are 16–20 % beds right under her
   whispers; does the lamp timing land (event 9 blinks under the song, event 10 rose on the first note).
3. Event 10 is ≈1.2 s over its 30 s budget (verbatim lines plus the scripted 9 s wait = 30.9 s).
4. Keep her jaw animation off on .140; if her lurk rotation is turned on, list only scenes 1 and 2.
5. Scene 3 leaves the rose lit for the conversation; the idle poses (all ending dark) or Home turn it off later.
