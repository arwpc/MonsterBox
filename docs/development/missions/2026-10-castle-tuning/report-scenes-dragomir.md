# Report: scene-author, Sir Dragomir (character 4)

Worker report, written 2026-10-10 after Orlok's 09:55 CDT power loss (the earlier attempt had written nothing);
saved by the lead (the worker could not write under `docs/`). Only `data/character-4/poses.json` and
`data/character-4/scenes.json` changed. The old files (3 riddle scenes 401–403 and an empty pose list) are in
`data/character-4/backups/*.pre-castle-tuning-20261010.json`. Nothing committed by the worker, no hardware driven,
no audio played.

The generator `gen.py`, plus `durations.json` and `measure.mjs`, are in `/home/remote/mission-scratch/scene-dragomir/`.
Edit `gen.py` and re-run `python3 -I gen.py` to retune; it rewrites both files.

## Angles, and where they come from

Calibration was read from his own node (.130) by GET only: calibration profiles, jaw config, head-tracking config.

| Part | His node's calibration | Angles used | Basis |
|---|---|---|---|
| 1 head (ch 7, 900° multi-turn) | 300–512, preset "center" = 390 | 372–406 only, centre 389; explicit degrees, no presets, no jitter | `config/scene-hazards.json`; 389 from FLEET-EVENTS |
| 2 jaw (ch 3) | 130–175 | 130 shut; 133–145 "a crack"; 165 a silent drop | The jaw service closes the jaw at the calibrated minimum (`jawAnimationSuperPowerService.js:1570`). His live jaw config is min 130 / max 175. The 27–74 window in KNIGHT-100-PLAN is out of date. |
| 3 magic box (ch 11) | 16–178, `invert:true` | 20 shut; 27–46 peek or breath; 80 ajar; 174 open | The operator confirmed 20 = shut and 174 = open (commit 6fb84eec) |

- **Head direction is an inference.** Event 9 says the head "turns away from the castle (372°)", so 406 is treated
  as toward the castle and Orlok, 400 as toward the wall where Mina lies, and 372–378 as the road and the patch.
  To flip it, edit poses 10/11/19/20.
- **The head is moved only by poses, never by servo steps**, keeping the believed angle consistent.
- **The multi-turn conversion is correct**: pulse = 500 + angle/900 × 2000 µs, so 1327–1402 µs over the window
  (`hardwareService/index.js:2569-2598`, `:1141-1160`).

## Poses (23)

- **1 Home:** head 389, jaw 130, box 20.
- **Idle set** (tag `idle`; each has weight > 0, `holdVariance` and `transitionDurationMs`); all 8 move the jaw
  and/or the box, 4 leave the head alone: 2 Watch the Road (381), 3 Watch the Keep (398), 4 The Lid Breathes
  (box 34), 5 Jaw a Crack (jaw 140), 6 Peek in the Box (box 46, jaw 136), 7 Old Steel Settles (centred, shut),
  8 Muttered Oath (jaw 145, box 27), 9 Glance at the Patch (376). Jitter only on jaw and box, never the head.
- **Building blocks:** 10 head away from the castle (372), 11 toward the castle (406), 12 centre (389), 13 box
  open, 14 box shut, 15 box ajar, 16 jaw drop, 17 jaw shut, 18 The Challenge, 19 toward the lady below (400),
  20 toward the road (378), 21/22 sway left/right (380/398), 23 rest (box and jaw, head untouched).

## Scenes (10)

**Holding his own node.** Scenes do not claim servos, so his always-on head tracking and the idle loop would fight
scene head moves. Every non-event scene except the wake greeting starts with `fleet-mode hold` on himself
(`node:'Sir Dragomir'`, maxMs = length + margin) and ends with `fleet-mode release`. Event parts never hold (the
conductor holds every node); the wake greeting does not hold (tracking keeps him on the guest; only box and jaw move).

**Music beds** play as concurrent `audio` steps with `jawSync:false`; each story piece ends with a
`fleet-stop-audio` on himself so a long track does not keep the scene open (that stops everything playing on his
node, so it sits after the last line).

| id | Title | Beat | Parts | Audio / casts / fleet steps | Length |
|---|---|---|---|---|---|
| 1 | The Long Watch | Lurk, silent: slow sweep of the road and the keep, the lid breathes, a muttered oath | head, box, jaw | none | ~33 s |
| 2 | The Box Remembers | Lurk, silent: the box stirs and peeks, he glances as if he heard it, slams it, the jaw gapes | head, box, jaw | none | ~27 s |
| 3 | Who Goes There | Wake: box snaps open, jaw clacks, "Stai! Who climbs the knight's hill? Speak your name…" | box, jaw | one line | ~9.6 s |
| 4 | The Horseless Carriages | A car is a "carriage with no horse… eyes of fire"; Orlok teases "they are called cars"; "Carriage, I say"; guest sent to the Count | head, box, jaw | bed `scary-eerie-and-dramatic-background-sound` 35 %; Goblin 2 `Pha Wraith Unholyhovering Win H.mp4`; fleet-say Orlok | ~70 s |
| 5 | Old Steel for the Lady Below | The lady in oak and iron, the bar he still holds, "Doamne ajută"; Mina whispers back; guest sent down softly | head, box, jaw | bed `12 - Ghostly Music` 30 %; Goblin 1 `Floatinglady.mp4`; fleet-say Mina | ~59 s |
| 6 | The Riddle at the Wall | Riddle (answer: a wall); a 1462 fragment; the wraith army; "PENTRU ȚARĂ!"; Groundbreaker answers; guest sent to Groundbreaker | head, box, jaw | bed `09 - Dragging Chains` 35 %; Goblin 2 `Pha Wraith Riseofthewraiths Win H.mp4`, Goblin 3 `Bigskull.mp4`; fleet-say Groundbreaker | ~72 s |
| 7 | Go Up to the Count | Toward the castle: "Go up to the Count… watch his face"; from the patch: "A vine with ambitions… do not give it your name"; Mina as the gentle road; "Noapte bună" | head, box | none | ~38 s |
| 8 | The Watch Is Called | Event 1, lines verbatim: sweep 372→406 over 2 s, box opens, line 1, centre 389, line 2, box shuts, Home | head, box | conductor's bed | ~28 s |
| 9 | A Knight Does Not Duel a Vegetable | Event 2, lines verbatim: head to 372 on "Nu"; box snaps after "dirt"; line 2; back to 389; Home | head, box | none | ~27 s (budget 26) |
| 10 | The Knight's Verse | Event 3, V-Dragomir verbatim: four 1.2 s sways 380/398; box opens at "deep", shuts at "sleep"; Home | head, box | none | ~18 s |

Every line ≤ 25 words. Scenes 1–7 open with `[Romanian accent]` plus at most one more tag; event lines are exactly
as written with no added tag. Event pacing comes from the measured cached clips (8.2–13.9 s per line).

## Proof

- Validator: `node scripts/validate-scenes.mjs 4` → `0 error(s), 0 warning(s)`.
- `npm run validate:schemas` passed for all 6 characters; `npm run test:pact` 72 passing.
- Prerender: `node scripts/prerender-scene-tts.mjs 4` → 21 unique lines, 21 rendered, 0 failed, into Orlok's
  `data/tts-cache/4/`; the three fleet-say lines were warmed in their speakers' caches on Orlok too.
- Dry runs: `POST :3100/scenes/api/<id>/play?characterId=4&dryRun=1` for ids 1–10 all HTTP success, scene
  `success:true`, 0 failed steps (step counts 25, 34, 8, 39, 28, 45, 18, 14, 12, 17). Scene 4's fleet targets
  resolved: hold/stop-audio/release → .130, say → Orlok .120.
- Limits: a dry run only shows the steps were accepted.

## Needs hands (lead / operator)

1. Push `poses.json` and `scenes.json` to .130 (character 4 is config-locked), then refresh the lock fingerprints.
2. TTS cache on his node: copy `data/tts-cache/4/` to .130 or run the prerender there (clips match only if his
   tts-config equals the repo's: voice `wXvR48IpOq9HACltTmt7`, eleven_v3, 0.5/0.8).
3. Deploy the new code to .130 (event-hold/release endpoints, Goblin name resolver). Without hold, tracking and the
   idle loop fight the head moves.
4. Re-point his lurk rotation: live `lurk-scenes-state.json` still lists `["401","402","403"]` → `["1","2"]`;
   `defaultSceneId: 1` now means silent lurk piece 1.
5. His head-tracking window (centre 407, range 84 → 365–449°) exceeds the 372–406 hazard window on both sides;
   operator decision.
6. Not checked by eye: jaw 130 = shut, and the head-toward-castle direction. Watch scene 8 once in daylight; if he
   faces the wrong way, swap poses 10↔11 and 19↔20.
7. Event part 9 runs about 1 s over its 26 s budget (his delivery is slow).
8. The Mina and Groundbreaker fleet-say answers are skipped when those nodes are busy or offline; the pieces stand alone.
