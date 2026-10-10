# Report: scene-author, Count Orlok (character 3)

Worker report, written 2026-10-10 ≈10:30 CDT after the 09:55 power loss (none of the earlier attempt had reached
disk); saved by the lead. The worker's real plays were refused by its own permission layer; the lead plays them
(operator daytime go-ahead). Nothing committed by the worker; no code, test or other character touched.

## Files

- Written through the replace endpoints: `data/character-3/poses.json` (26 poses), `scenes.json` (10 scenes).
- Backups of the old files: `data/character-3/backups/poses-2026-10-10T15-31-03-787Z.json`,
  `scenes-2026-10-10T15-31-10-873Z.json`.
- Generator: `/home/remote/mission-scratch/scene-orlok/build.py` (writes `poses.new.json` / `scenes.new.json`;
  POST them to the replace endpoints). Dry-run outputs beside it.

## The ten scenes

| id | name | parts | lines | audio | casts | fleet steps |
|---|---|---|---|---|---|---|
| 1 | Orlok: The Hand Remembers | 1, 8 | 0 | - | - | - |
| 2 | Orlok: Embers in the Hall | 1, 8 | 0 | - | - | - |
| 3 | Orlok: Bună Seara | 1, 8 | 1 | - | - | - |
| 4 | Orlok: The Summons | 1, 8, 15 | 5 | spooky-horror-ambience (88 s) | Goblin 2: Moon.mp4 | hold/release on Orlok; fleet-say Sir Dragomir |
| 5 | Orlok: The Eye of Orlok | 1, 8, 15 | 5 | scary-eerie-and-dramatic-background-sound (100 s), castle-thunder-sound-effect | Goblin 1: Sauron.mp4; Goblin 2: Batattack.mp4 | hold/release on Orlok; fleet-say Renfield |
| 6 | Orlok: The Wall at Night | 1, 8, 15 | 4 | haunting-music-box-melody (80 s) | Goblin 2: Pha Wraith Riseofthewraiths Win H.mp4; Goblin 3: Firepumpkin.mp4 | hold/release on Orlok; fleet-say Groundbreaker |
| 7 | Orlok: Down to the Depths | 1, 8, 15 | 2 | - | - | hold/release on Orlok; fleet-say Mina |
| 8 | Orlok: Naming the Night | 1, 8, 15 | 2 | - | - | - |
| 9 | Orlok: The Muster | 1, 8, 15 | 2 | - | - | - |
| 10 | Orlok: Count-In and Verse | 1, 8, 15 | 2 | - | - | - |

Parts: 1 = right arm actuator, 8 = Hand of Azura lamp, 15 = head swivel. Each scene has a one-line `description`.

- **1 The Hand Remembers** (lurk, silent, ~35 s): lamp wakes in slow pulses then stays on; the hand creeps out
  twice and is pulled back further than it went out; ends dark.
- **2 Embers in the Hall** (lurk, silent, ~40 s): double-pulse "heartbeats" of light, the hand tests the air twice,
  a long glow while the hand reaches, a fading glow.
- **3 Bună Seara** (wake greeting, ~10 s): lamp flares and the hand reaches: "Bună seara... good evening. Cooome
  closer. Numele tău? Tell your Lord your name." Hand withdraws, lamp out.
- **4 The Summons** (story, ~90 s): the moon rises on Goblin 2; he turns to the hill and calls the knight, who
  answers in his own voice ("It holds, my lord. Stai, carriages! The watch stands."); tells the giant to dig
  quieter; turns toward the lady below; sends the guest to Mina ("ask Mina if she dreamed of you").
- **5 The Eye of Orlok** (story, ~100 s): his Eye opens on Goblin 1 (Sauron.mp4; skipped if offline) with a full
  head sweep; a sudden turn to the road with bats on Goblin 2; Renfield answers; errand: give Renfield your name;
  double lamp flash toward the patch ("tell the pumpkin-thing his Lord counts too"); head snaps on a thunder clap;
  whispered close.
- **6 The Wall at Night** (story, ~80 s, music box): an old memory of a wall and fire; wraiths on Goblin 2, fire on
  Goblin 3; he turns to the giant, the arm extends; Groundbreaker blurts "WALL! ROCKS! BIG ROCKS! ... COUNT WAS
  LITTLE THEN. OOPS."; he closes the subject and sends grown guests to Sir Dragomir.
- **7 Down to the Depths** (send-off, ~35 s): toward the lady below; Mina whispers back; he reaches for the guest,
  repeats the errand ("sign nothing Renfield offers"), nods toward the road, Home.
- **8, 9, 10** (event parts): lines verbatim from FLEET-EVENTS.md; each starts with a 100 ms wait and ends in Home
  with the lamp still on for the conductor to clear. 8: arm extends 3 s during the welcome line, retracts 3.3 s.
  9: arm extends 2 s while the head sweeps far left, far right, centre (1.2 s each), then the two muster lines.
  10: count-in line, lamp blink, the sung verse over four 1.2 s head sways, arm reaches near "Dine", blink, retract.

**Voice.** Lines in 3–7 open with `[Romanian accent]` plus one breath tag (at most one more tag), one or two
Romanian words, one stretched word, never opening on "I", ≤ 25 words (checked by the build script). Cached clips
run 3.0–14.9 s.

## Design choices

- Lurk pieces (1, 2) and the wake greeting (3) never move the head: head tracking owns it while he lurks and on
  wake, and poses do not reserve the servo.
- Scenes 4–7 start with `fleet-mode hold` on Orlok (`force:true`, `maxMs` above the scene length) and end with
  `release`, so idle loop, head tracking and background music step aside. **Do not call scenes 4–7 from inside a
  fleet event** (their release would end the conductor's hold early); 8–10 have no hold/release.
- Every audio step has `jawSync:false`; each bed is about as long as its story.
- Goblin casts are play-once, `waitMs:0`, concurrent; Skullfire is not cast to Goblin 3 (it failed there before).
- Every arm extend is followed by a retract of equal or greater length.

## Poses (26)

- Home and resets (category `fragment`): 1 Home (head 99°, eased 1.5 s; touches neither lamp nor arm), 2 Arm Home
  (retract 3.5 s), 3 Lamp Out.
- Idle set (category `idle`, tag `idle`, weight/holdVariance/transitionDurationMs set), nine poses, five without
  the head: head 10 Drift Left 90°, 11 Drift Right 108°, 12 Settle 99°, 13 Long Stare Left 72°; no head 14 Ember
  (lamp 1.2 s), 15 Heartbeat (lamp 0.45 s), 16 Hand Stirs (extend 0.4 s), 17 Hand Withdraws (retract 0.7 s),
  18 Glow and Gather (lamp 1.5 s + retract 0.6 s). Idle retracts outweigh the one idle extend and the loop never
  repeats a pose back to back, so the arm cannot creep outward.
- Scene poses (category `scene`): looks toward each resident 20 hill 74°, 21 depths 86°, 22 road 110°, 23 patch
  116°, 24 ground 66°; movement 25/26/27 sweep far left/right/centre (1.2 s), 28/29 sway (1.2 s), 30 Notice (112°
  in 0.5 s); gestures 31 Lean In (3 s lamp glow), 32 Reach (104° + 1.5 s extend), 33 Withdraw (home + 1.8 s retract).
- All head angles 66–116° (inside the old library's 62–118°). Parts 2–5 appear nowhere. The jaw (part 10) is in
  no pose: its range evidence conflicts (old markers 63–131° "past the mechanical stops"; August 33–98° / 41–90°
  wiped 09-06; active jaw config 102–143° since 09-20) and the random-pose service scales an uncalibrated servo
  toward 90°. The jaw follows speech only.

## Proof

- `node scripts/validate-scenes.mjs 3`: 0 errors, 0 warnings. `npm run validate:schemas` passed (6 characters);
  `npm run test:pact` 72 passing.
- Replace endpoints: poses validate-only and write 200 (26 poses; warnings named only old scenes 112/114/115/116,
  replaced by the scene write); scenes validate-only 200 with no warnings; write 200 (10 scenes).
- `node scripts/prerender-scene-tts.mjs 3`: 24 unique lines rendered, 0 failed (`data/tts-cache/3/`). The fleet-say
  lines of the other characters render on their nodes at first play.
- Dry runs on :3100 (`?dryRun=1`), scenes 1–10: all `success:true`, step counts 20, 25, 5, 23, 28, 21, 13, 8, 10, 19,
  0 failed steps; hold/release resolved to Orlok himself.
- Real plays: not run by the worker (refused by its permission layer); the lead plays them in daylight.

## Needs hands

1. Play each scene for real and judge by ear and eye (`POST :3100/scenes/api/<id>/play?characterId=3`), reading
   both logs for step failures, the hold/release lines, and the Goblin "accepted … but mpv is showing" error; check
   the event parts against their budgets (8 ≈ 28 s, 9 ≈ 20–25 s, 10 ≈ 24–28 s).
2. The yard directions are guesses (poses 20–24; lower angle = his left). Re-aim in the `DIR` table in `build.py`
   or on the Pose Editor.
3. Calibrate the jaw (part 10) before anyone adds an idle jaw crack.
4. Test leftover: `data/character-3/parts.json` contains a synthetic part 987657 "Device Stamp Test Mic" — remove
   before any push.
5. `lurk-scenes-state.json` (disabled) still lists scenes 111–116; point it at 1 and 2 if it is turned on.
