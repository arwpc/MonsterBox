# Report: scene-author, Lady Mina (character 2), FULL-RIG rebuild

Worker report, 2026-10-10 evening (saved by the lead). Replaces the movement sections of `report-scenes-mina.md`
(the lamp-only show). Only `data/character-2/poses.json` (28 poses) and `scenes.json` (10 scenes) changed, written
through the replace endpoints on :3100 after a validate-only pass. Backups of the lamp-only show:
`data/character-2/backups/{poses,scenes}.lamp-only-20261010.json` and the endpoint's own
`poses-2026-10-10T21-19-05-110Z.json` / `scenes-2026-10-10T21-19-05-158Z.json`. Generator
`/home/remote/mission-scratch/scene-mina/gen_fullrig.py` (asserts the door rule, hold/release, `jawSync:false` on
every audio step, servo ranges, ≤ 25 words, no accent tag).

## What changed

Kept: all ten ids, titles and beats; every spoken line word for word (TTS cache warm); the three lullabies as
`audio` steps with `jawSync:false`; beds, casts, fleet-say answers; hold/release on 4–7; event lines verbatim.
New: every scene uses the neck (2), eye (3) and coffin door (4); the jaw (1) is never commanded while she speaks
(jaw animation drives it) but gets small "hum" moves (28–38°) under the pre-rendered songs and in idle; the eye
laser (10) only in the three event parts, always off within 2 s and in Home. Servo motion uses pose steps with
`transitionDurationMs` and `options.jitter:false` (a PCA servo step does not wait for travel); a line that moves
is a concurrent `sayThis` followed by pose/light/door steps padded to the clip length + 300 ms. Door discipline:
exactly one extend and one retract per scene, Home adds a 1 s retract; no door command while one is in flight.

| Scene | Extend | Retract |
|---|---|---|
| 1 | 400 ms | 600 ms |
| 2 | 500 ms | 700 ms |
| 3 | 600 ms | 800 ms |
| 4 | 1500 ms | 1800 ms |
| 5 | 800 ms | 1000 ms |
| 6 | 1000 ms | 1200 ms |
| 7 | 400 ms | 600 ms |
| 8 | 3 s at 40 % | 3 s at 40 % |
| 9 | 1.5 s at 30 % | 1.5 s at 30 % |
| 10 | 3 s at 40 % | 3 s at 40 % |

## The ten scenes

| id | name | movement (new) | length |
|---|---|---|---|
| 1 | Mina: The Long Road | lurk, waiting song: gaze to the hill, the road, down and away; jaw hums; door 0.4 s; rose breaths | ≈42 s |
| 2 | Mina: Come, Morning | lurk, morning song: up to the little window; door 0.5 s; neck sways; jaw hums | ≈42 s |
| 3 | Mina: Someone Above | wake: creak, door 0.6 s, rose kindles, eye drops then finds the guest, line, door closes 0.8 s; rose stays lit | ≈11 s |
| 4 | Mina: The Dream-Gift | door 1.5 s on the dream as the floating lady appears; gaze to castle and window; castle for Orlok's answer; door closes 1.8 s | ≈80 s |
| 5 | Mina: The Waiting | looks down the road; door 0.8 s on "I choose the morning"; gaze to the moon; to the hill for Sir Dragomir | ≈80 s |
| 6 | Mina: The Knight on the Hill | hill, castle, down; castle for Orlok; door 1 s for the Nani song; sways and jaw hums; door closes 1.2 s | ≈95 s |
| 7 | Mina: Up to the Knight | shows the way up the hill; glance at the castle; hill for the knight's hail; door farewell 0.4/0.6 s | ≈42 s |
| 8 | Mina: The Voice Below | event 1: door 3 s at 40 % as the rose comes on; neck up to the castle; eye drifts; sways under the sung lines; hill on "my knight"; laser blinks twice; door closes 3 s; rose off; Home | ≈30.0 s |
| 9 | Mina: Sing the House to Order | event 2: door 1.5 s at 30 %; rose on; neck up, eye to the castle; three rose blinks under the song, one long blink; back to the guest; laser 2 s; door closes 1.5 s; rose off; Home | ≈34.0 s |
| 10 | Mina: The Bridge | event 3: on the first sung note (4.5 s) rose lights and door opens 3 s at 40 %; neck sways twice; eye to the yard; 9 s wait for BRIDGE-all; BRIDGE-Mina-2 with the laser on its last 2 s; door closes 3 s; rose off; Home | ≈35 s (budget 30) |

## Poses (28)

Home (1): jaw 28, neck 140, eye 89, door retract 1 s at 40 %, rose off, laser off, 1.2 s transition. Scene poses:
Rose Kindled (2), Rose Ember (3); gazes The Guest (4, 140/92), Up to the Castle (5, 122/80), The Hill (6,
160/102), The Moon (7, 128/112), The Yard (8, 148/84), Down and Away (18, 134/68); sways Toward the Castle (9,
126), Toward the Hill (17, 154); eye drifts Up (25, 104), Down (26, 76); jaw Hum (27, 38), Hum Close (28, 28).
Idle (13, tagged `idle` with weight/holdVariance/transitionDurationMs): 10 Ember Breath, 11 Flicker, 12
Heartbeat (+5° jaw crack), 13 Slow Glow (+neck drift), 14 Glance at the Hill, 15 Glance at the Castle, 16 Dark
Rest (door settles 0.5 s), 19 Jaw Crack, 20 Jaw Close, 21 Coffin Breath (extend 0.3 s), 22 Coffin Settle
(retract 0.5 s), 23 Eye Wander Low, 24 Eye Wander High. 11 of 13 idle poses do not involve the neck. The coffin
breath is two poses because the pose engine drives a pose's parts together and the newer door command cancels
the older; the door spends 4× longer retracting than extending so it drifts shut. Idle is disabled in her
`movement-config.json` (`idle.enabled: false`).

## Angle ranges and why

`servo_calibrations.json` is empty (uncalibrated 0–180° fallback); measured parks jaw 28°, neck 140°, eye 89°.

| Servo | Range used | Allowed | Parked |
|---|---|---|---|
| Jaw (1) | 28–38° | 28–60° | 28° |
| Neck (2) | 122–160° | 110–170° | 140° |
| Eye (3) | 68–112° | 60–120° | 89° |

The story compass is a guess (castle = lower neck angle, hill = higher, moon = eye high); if mirrored, swap poses
5/6, 9/17, 14/15 (adjust 7) in `gen_fullrig.py` and re-push.

## Proof

`node scripts/validate-scenes.mjs 2`: 0 errors, 0 warnings (replace endpoints: no warnings). `validate:schemas`
passed (6); pact 72 passing. Prerender: 30 unique lines, 26 cached, 4 rendered, 0 failed. Dry runs ids 1–10 on
:3100: all HTTP success, scene `success:true`, 0 failed; step counts 33, 31, 14, 57, 53, 76, 33, 32, 35, 18.

## Needs hands

1. Calibrate jaw, neck and eye on her node; confirm castle/hill directions, swap poses if mirrored.
2. Jaw animation: enabled on her node by the lead (window 28–84°).
3. Coffin door: durations assume 0.3–3 s at 30–40 % moves it from "a few millimetres" to "a hand's width"; watch
   event 8 (3 s at 40 %, the widest); confirm `extend` opens the door (`invertDirection: true`).
4. Event 10 runs ≈35 s against a 30 s budget (verbatim lines + the scripted 9 s wait + 3 s retract); the conductor
   waits per part, so only the next cue shifts.
5. Push to .140 and a daylight check of songs, bed levels, door distances and servo directions.
