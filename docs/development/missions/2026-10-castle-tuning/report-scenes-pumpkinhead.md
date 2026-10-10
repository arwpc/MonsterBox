# Report: scene-author, PumpkinHead (character 1)

Worker report, 2026-10-10 daytime; saved by the lead. Only `data/character-1/poses.json` and `scenes.json`
changed, written directly to the repo copy (the replace endpoints answer 423: he is config-locked;
`config/character-locks.json` untouched). Old files in `data/character-1/backups/*.pre-castle-tuning-20261010.json`
(two motor sway poses, two stale templates for parts he does not have, an empty scene list). Nothing committed; no
hardware driven; no audio played; TTS rendered into Orlok's cache only. Generator
`/home/remote/mission-scratch/scene-pumpkinhead/gen.py` (+ `measure.mjs`, `durations.json`, `lines.json`,
`dry-<id>.json`); it times every motor pulse from measured clip lengths and asserts speed ≤ 40 % and pulses 0.3–0.8 s.

## The rig, and how it moves

One movable part: the Body Shakes wiper motor (part 1). Every motor step and pose target states a speed ≤ 40 % and
300–800 ms; `forward`/`reverse` paired in each piece so the wiper ends roughly where it started. Eye rings (9)
react to speech by themselves. No jaw, no pan servo: no head tracking; the idle loop has the motor to itself.

**Moves landed on words.** A line plays as a concurrent `sayThis`; waits place the pulse at the word's estimated
offset (clip length × share of characters before the word, + 300 ms player start); a closing wait covers the rest
of the clip. Event parts 8–10 and the counting lines in 4–6 work this way. Timing is estimated, not heard: adjust
`LAT` or the beat words in `gen.py` if a pulse lands early or late.

## Poses (13)

1 Home: a 0.3 s forward nudge at 20 % ("settle"; the validator rejects a pose with no parts). Idle set (tag `idle`,
weight, holdVariance, transitionDurationMs 300), all motor pulses: 2 Stalks Stir (fwd 22 % 500 ms, w14), 3 Stalks
Stir Back (rev 22 % 500 ms, w14), 4 A Crack (fwd 34 % 300 ms, w8), 5 A Snap (rev 36 % 350 ms, w8), 6 The Long
Creak (fwd 18 % 800 ms, w10), 7 Root Settles (rev 18 % 700 ms, w10), 8 Leaning In (rev 28 % 600 ms, w8), 9 Shiver
(fwd 30 % 400 ms, w8). Scene beats: 10 Pounce (fwd 40 % 800 ms), 11 Withdraw (rev 32 % 600 ms), 12 Count Pulse
(fwd 35 % 500 ms), 13 Count Pulse Back (rev 35 % 500 ms).

## Scenes (10)

Story pieces 4–6 and the send-off open with `fleet-mode hold` on himself and close with `release`; lurk pieces,
the wake greeting and the event parts never hold. Beds are concurrent `audio` at 35 % with `jawSync:false`, stopped
with `fleet-stop-audio` after the last line. Every scene ends in Home. Lines ≤ 22 words, third person, no audio
tags (except the two verbatim event lines, see Notes); ellipses stretch the stalk, CAPITALS land the pounce.

| id | Title | Beat | Audio | Casts | Fleet answers | Length (est.) |
|---|---|---|---|---|---|---|
| 1 | The Stalks Stir | Lurk, silent: stir, stir back, long creak, crack, snap, lean, shiver, settle | — | — | — | ~32 s |
| 2 | Crack and Snap | Lurk, silent: stillness, crack, snap, double shiver, slow lean and back, three counting twitches, settle | — | — | — | ~38 s |
| 3 | Who Stalks the Patch | Wake: jolts forward and back, "Snap! Who stalks through Pumpkinhead's patch? ...Speak, little ember. Pumpkinhead is listening." | — | — | — | ~9.5 s |
| 4 | The Patch Counts Its Souls | Counts souls past the husks (pulse on each "One for..."); pounce on PUMPKINHEAD; the Count says the quota is never met; counts the guest: "Not ripe yet." | bed `scary-howling-wind-sound-effect` | Goblin 2 `Pha Wraith Soulseeker Win H.mp4` | Orlok | ~68 s + answer |
| 5 | The Stalks Remember | Every boot and frost; Groundbreaker's throw (he answers, delighted); the knight's brittle bar; Dragomir sneers; "The knight is afraid of a pumpkin." | bed `spooky-horror-ambience`; stingers thunder, evil laughter | Goblin 3 `Skullfloor.mp4` | Groundbreaker, Sir Dragomir | ~78 s |
| 6 | The Missing Babies | Counts his babies, ELEVEN of seventeen; six sold under seal by the shaking pen; Renfield answers ("no refunds, so stipulated"); "Pumpkinhead smells the paper on your hands. Snap." | bed `scary-eerie-and-dramatic-background-sound`; stingers wardrobe door, rake | Goblin 3 `Firepumpkin.mp4` | Renfield | ~74 s + answer |
| 7 | Go Ask the Clerk | Send-off: to the bend in the road to ask the mad clerk where his babies went, or up to the Count | `old-wardrobe-door-squeaking-sound` | — | — | ~30 s |
| 8 | Counting the Patch | Event 1, verbatim; 0.5 s pulses at 35 % on "One", "Two", "Three" | conductor's bed | — | — | 28.2 s (budget 28) |
| 9 | Not For Sale | Event 2, verbatim; 0.8 s bursts at 40 % on "Snap" and the first "remember" | — | — | — | 28.2 s (budget 28) |
| 10 | The Patch's Verse | Event 3, verbatim; 0.4 s pulses at 35 % on "Snap", "crack", "six" | — | — | — | 18.2 s (budget 18) |

The baby count: 17 planted, 6 sold, 11 left (consistent with the bible, the event script and Renfield's pieces).
Fleet-say answers in the speakers' own voices (Orlok, Groundbreaker, Sir Dragomir, Renfield); each piece stands
alone if an answer is skipped.

## Proof

- `node scripts/validate-scenes.mjs 1`: 0 errors, 0 warnings. `validate:schemas` passed (6); pact 72 passing.
- Prerender: 24 unique lines, 21 rendered, 0 failed, 3 already cached (other characters' lines to him); the four
  fleet-say answers rendered into caches 3/5/4/6 on Orlok. Line lengths 5.3–15.4 s.
- Dry runs ids 1–10: all HTTP success, scene `success:true`, 0 failed; step counts 16, 22, 4, 40, 39, 49, 19, 14,
  12, 11; hold/stop-audio/release → .150 (self); fleet-say → .120, .200, .130, .249.
- `npm run lock:verify` reports character 1's `poses.json` and `scenes.json` (plus the two backups) differ from the
  lock — expected until the lead refreshes it.

## Needs hands

1. Unlock, push both files to .150, refresh the lock fingerprints (`node scripts/character-lock.mjs`, then
   `npm run lock:verify`); decide whether `backups/` belongs under the lock.
2. Lurk rotation on .150: `lurk-scenes-state.json` `sceneIds` → `["1","2"]` (3 is the greeting; 4–7 hold the node
   and make other nodes speak).
3. TTS cache: copy `data/tts-cache/1/` to .150 or prerender there (voice `Z7RrOqZFTyLpIlzCgfsp`, eleven_v3,
   0.25/0.65, frozen by operator rule).
4. Deploy current code to .150 (fleet steps, hold/release, Goblin lookup by name).
5. Motor calibration clamp: if his node has a calibration profile for part 1 with `bounds.minP/maxP` and
   `motion.bins`, the executor can cut a pulse's duration (even to 0); check before show night.
6. Not seen or heard: whether pulses land on their words, the 35 % bed level under his voice, wiper drift. Watch
   scenes 8 and 6 once in daylight.

## Notes

Two event lines carry tags (`[laughs]` in event 2's second line, `[sings]` in the verse); the bible says
PumpkinHead never uses tags, the brief says event lines are verbatim, so both were kept. The old "Body Sway" poses
(40 % for 1.2 s) and stale templates are gone.
