# Report: scene-author, Renfield (character 6)

Worker report, 2026-10-10 daytime; saved by the lead. Only `data/character-6/poses.json` and `scenes.json`
changed, both through the replace endpoints on :3100 (`?characterId=6`). Backups:
`data/character-6/backups/poses-2026-10-10T15-44-14-187Z.json` (the old pose list was empty) and
`scenes-2026-10-10T15-44-14-362Z.json` (the 5 old "Lurk:" scenes). Nothing committed; no hardware driven; no audio
played; no code, test or other character touched. Generator `/home/remote/mission-scratch/scene-renfield/gen.py`
(`python3 -I gen.py`, then POST `poses.body.json` / `scenes.body.json`), with `durations.json`, `measure.mjs`,
`measure-fleet.mjs`, `dry-1..10.json`.

## The rig, and the angles inferred

| Part | Use | Values | Basis |
|---|---|---|---|
| 7 Writing Pen (GPIO 26, MG90S, 500–2400 µs) | strokes in every scene and idle pose | Home 90°; strokes 40–140°, mostly 55–130°; 40° = "pen down / sign / stamp", 140° = "raised / Whereas! / toward the patch" | `servo_calibrations.json` empty; the operator confirmed a 60/120/90 sweep on 2026-10-04 (`parts.json`); the brief asks for 40–140 |
| 1 Shake Motor (BTS7960, GPIO 12/13) | shakes when the Master/Count is named, at stamps, at fear | forward only, 450–1500 ms at 50–80 % | `parts.json`: reverse half-bridge dead; wiper-class motor, short bursts only; forward 70 % for 1.5 s proven safe |
| 5 Eye Rings | none (react to speech) | — | |
| 4 webcam, 6 PIR | none | — | no pan servo, so pen and motor are free for the idle loop |

**Timing model.** A GPIO servo step blocks `max(150, duration)` ms and each starts its own `servo_cli.py`
(≈0.38 s Python+lgpio start-up on Orlok's Pi 4B); `gen.py` counts 400 ms per stroke (`STROKE_OH`), so "a 250 ms
stroke every 650 ms" is back-to-back 250 ms servo steps. To write under a line, the `sayThis` is `concurrent` and
the strokes follow it; a trailing `wait` sized for a fast 200 ms start-up (`STROKE_OH_MIN`) keeps lines from
overlapping. Pen poses skip easing on purpose (`transitionDurationMs: 200`: above 250 ms each eased frame of a GPIO
servo becomes its own blocking call); fast strokes are `servo` steps of 150–400 ms, poses supply held positions
and the motor.

## Poses (16)

1 Home (pen 90°). Idle set (tag `idle`, weight, holdVariance, transitionDurationMs), all moving the pen, three with
a small shake: 2 Quick Note 120° (w14), 3 Cross It Out 55° (w12), 4 Underline, Shuddering 135° + motor 450 ms 55 %
(w8), 5 Dot the I 75° (w12), 6 The Tremor 105° + motor 600 ms 60 % (w6), 7 Margin Note 45° (w10), 8 Signature
Flourish 140° + motor 500 ms 50 % (w6), 9 Back to the Ledger 95° (w10). Scene poses: 10 Pen Raised: Whereas! (140°),
11 Pen Down: Sign Here (40°), 12 The Seal (40°, motor 600 ms 70 %), 13 The Master Named (100°, motor 1000 ms 70 %),
14 The Great Tremble (60°, motor 1500 ms 80 %), 15 Presenting the Paper (125°), 16 Toward the Patch (140°, motor
400 ms 50 %).

## The ten scenes

Scenes 4–7 start with `fleet-mode hold` on Renfield and end with `release`; lurk pieces, the wake greeting and the
event parts never hold. Story pieces 4–6 stop their bed with `fleet-stop-audio` after the last line. Every bed is a
concurrent `audio` step with `jawSync:false`; casts play once (`waitMs:0`, concurrent); every line ≤ 25 words with
at most two of his tags; event lines verbatim.

| id | Title | Beat | Parts | Audio | Casts / fleet | Length |
|---|---|---|---|---|---|---|
| 1 | The Docket Never Sleeps | Lurk, silent: bursts of jotting, long cross-outs (40↔140), dotting, a zigzag, a signature flourish, two shivers | pen, motor | — | — | ~35 s |
| 2 | Notarizing the Moths | Lurk, silent: slow careful strokes, a 12-stroke frenzy over a 1.2 s tremble, three stamps "in triplicate", counted taps, a tremor, a last shudder | pen, motor | — | — | ~39 s |
| 3 | Name for the Record | Wake: a shiver and one stroke, then "[excited] A client! A CLIENT! Your name, if you please, for the record. Speak up, speak up... the pen is waiting." | pen, motor | — | — | ~11 s |
| 4 | The Vetting | Three vetting questions (name; trade; consideration: "a Tuesday? A tooth? Your shadow, in fee simple?", shake on "the Master"); an indenture with Count Orlok in triplicate, three stamps; Orlok answers; guest sent up the hill | pen, motor | bed `10 - Creaking Gates` 30 % | Goblin 2 `Pha Spinster Behaveorbedead Win H.mp4`; fleet-say Orlok | ~95 s |
| 5 | Pumpkins by Contract | Sells a baby pumpkin by quitclaim under seal ("SOLD!"); Pumpkinhead protests; "Opposing counsel objects. Overruled! … pumpkins cannot sign."; the pumpkin burns in the roof window; "Collect it from Pumpkinhead himself, and show him the seal." | pen, motor | bed `haunting-music-box-melody` 30 % | Goblin 3 `Firepumpkin.mp4`; fleet-say PumpkinHead | ~85 s |
| 6 | The Oldest Deed | A deed from 1462 "signed in a hand I know... a name I will NOT read aloud" (big shake, violin sting); the knight warns the guest; guest sent to tell the knight "the east file is secure." | pen, motor | bed `whispers-of-the-haunted-sounds` 35 %; sting `suspenseful-violin-sound-effect` 45 % | Goblin 2 `Pha Wraith Soulseeker Win H.mp4`; fleet-say Sir Dragomir | ~87 s |
| 7 | Collect from Pumpkinhead | Send-off: a receipt "in triplicate, by order of the Master" (shake); the pen points down the road; "Should he still snap... run. Off you go!"; Pumpkinhead counts coldly | pen, motor | — | fleet-say PumpkinHead | ~38–41 s |
| 8 | The Covenant | Event 1, verbatim: three 400 ms strokes; line 1 with 250 ms strokes under it, the 0.6 s shake at 60 % before "Count Orlok"; line 2 with strokes; three more strokes; pen raised; Home | pen, motor | conductor's bed | — | ~28 s (budget 30) |
| 9 | Everything Is Recorded | Event 2, verbatim: 300 ms strokes under both lines; 0.8 s shake at 70 % before "signed"; pen raised, three strokes; Home | pen, motor | — | — | ~31 s (budget 32) |
| 10 | The Solicitor's Verse | Event 3, verbatim: back-to-back 250 ms strokes (≈650 ms apart) through the 12.3 s verse; 0.5 s shake at 60 % ≈62 % through, on "Count"; Home | pen, motor | — | — | ~17.5 s (budget 18) |

Measured clip lengths: event lines C1 9.6 s, C2 5.6 s, E1 11.3 s, E2 9.0 s, verse 12.3 s; other lines 2.2–12.4 s;
fleet-say clips PumpkinHead 12.0 s and 10.0 s, Orlok 9.8 s, Dragomir 5.0 s.

## Proof

- `node scripts/validate-scenes.mjs 6`: 0 errors, 0 warnings. `validate:schemas` passed (6); pact 72 passing.
- Replace endpoints: poses 200 (16, no warnings); scenes 200 (10, no warnings).
- Prerender: 24 unique lines all cached, 0 failed (22 his + 2 aimed at him); the 4 fleet-say lines warmed in
  Orlok's caches for their speakers (`data/tts-cache/1`, `/3`, `/4`).
- Dry runs ids 1–10: all HTTP success, scene `success:true`, 0 failed; step counts 45, 49, 15, 99, 88, 95, 34, 32,
  35, 23; hold/stop-audio/release resolve to .249; fleet-say to .120, .150, .130. (A first batch got empty replies
  while :3100 was briefly down; the retry passed.)
- Limits: dry runs prove shape, not motion; the 400 ms per-stroke start-up is a model, not measured on .249.

## Needs hands

1. Push `poses.json`/`scenes.json` to .249 and copy `data/tts-cache/6/` (or prerender there; voice
   `zzG73sCjG25Zj6km5X4M`, eleven_v3, 0.3/0.75); the fleet-say clips in Orlok's caches 1, 3, 4 must reach those nodes.
2. Watch one real run of scenes 8, 9, 10 against the 30 / 32 / 18 s budgets; tune `STROKE_OH` / `STROKE_OH_MIN`.
3. Check pen direction by eye (40°/140° may read backwards); swap in the pose table and stroke lists if so.
4. Motor duty: longest burst 1.5 s at 80 % (pose 14, story pieces only); cap at 70 % if the Pi browns out.
5. His `movement-config.json` has `idle.enabled:false`; the idle poses run only once it is enabled.
6. Point his node-local `lurk-scenes-state.json` at `["1","2"]` (3 is the wake greeting, not silent).
7. Fleet answers are skipped when the other node is busy or offline; each piece stands alone.
8. Playing his scenes from Orlok with `?characterId=6` would route fleet-mode/stop-audio to Orlok (`self:true`);
   play them on .249.
