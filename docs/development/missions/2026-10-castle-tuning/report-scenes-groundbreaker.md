# Report: scene-author, Groundbreaker (character 5)

Worker report, 2026-10-10 (daytime); saved by the lead. Only `data/character-5/poses.json` and
`data/character-5/scenes.json` changed. Old files in `data/character-5/backups/*.pre-castle-tuning-20261010.json`
(5 "Lurk:" scenes, scene 1 of which opened by driving the dead wiper motor, and one template pose aimed at a servo
he does not have). Nothing committed; no hardware driven; no audio played; TTS rendered into Orlok's cache only.
Generator: `/home/remote/mission-scratch/scene-groundbreaker/gen.py` (+ `measure.mjs`, `durations.json`,
`lines.json`); `python3 -I gen.py` rewrites both files and paces the event parts from measured clip lengths.

## The rig, and why there are no poses

Voice only tonight: speaker (3), microphone (4), webcam (2). The wiper motor (part 1) is listed broken; jaw
animation off; no servo. `poses.json` is `{"characterId":5,"poses":[],"templates":{}}` on purpose: the validator
rejects a pose with no parts (`sceneValidator.js:340`) and a pose may hold only servo/motor/linear_actuator/light/
led parts; his only motor is broken (a warning the brief treats as an error). With no idle-tagged poses the idle
loop returns `[]` and nothing moves, which is the truth for this rig. "Ends in Home" in the event parts is a short
closing `wait`. Give him a Home pose and six idle poses when a movable part is repaired or added.

## Scenes (10)

Story pieces and the send-off begin with `fleet-mode hold` on himself (`maxMs` = length + 30–60 s) and end with
`release`, so his lurk callouts do not talk over the piece; lurk pieces, the wake greeting and the event parts
never hold. Beds are concurrent `audio` steps with `jawSync:false`; each story piece ends with `fleet-stop-audio`
on himself after the last line.

| id | Title | Beat | Audio | Casts | Fleet answers | Length |
|---|---|---|---|---|---|---|
| 1 | Rumble Under the Wall | Lurk, sound only: rumble, thunder crack, rumble | `distant-vibrating-sound` ×2, `castle-thunder-sound-effect` | none | none | ~31 s |
| 2 | Thunder in the Dirt | Lurk, sound only: two thunder knocks from below, each answered by a rumble | thunder ×2, rumble ×2 | none | none | ~39 s |
| 3 | Feet Up There | Wake: a thunder knock, then "HEY! FEET UP THERE! … WHAT YOUR NAME, FRIEND? GROUNDBREAKER PROTECT YOU." | thunder | none | none | ~10.6 s |
| 4 | Breaking Out | He heaves out of the dirt, his "head" fills the big window; "OOPS. BREAK FENCE. SORRY FENCE."; the Count tells him to dig quieter; "QUIET LIKE MOUSE. BIG MOUSE." | bed `04 - Windstorm & Thunder` 35 %; rumble, thunder, rake stingers | Goblin 2 `Bigskull.mp4` | Orlok: "dig quieter. Liniște…" | ~83 s |
| 5 | Calling the Neighbors | Hollers at the knight ("SHINY TIN MAN"), the pumpkin ("BIG ORANGE HEAD") and Renfield ("PAPER MAN… SELL PUMPKIN BABIES. PUMPKIN MAN MAD. SHHH."); a bone man crawls past the little window; sends the guest to the pumpkin | bed `05 - Rabid Dogs Barking` 25 %; thunder | Goblin 3 `Skellycrawler.mp4` | Sir Dragomir, PumpkinHead, Renfield | ~98 s |
| 6 | Nobody Bother Holden | Listens for Calvin, Ben, Bennett, Holden and Harrison and protects all five; swats bats, warns off the goop, befriends the sparky man; Mina whispers back; "EVERYBODY SAFE. GROUNDBREAKER WATCHING." | bed `dark-scary-ambience-sounds` 35 %; rake sting, rumble | Goblin 2 `Batattack.mp4` then `Stumblingelectricsman.mp4`; Goblin 3 `Monstergoop.mp4` | Mina: "[whispers] Tell the big one I hear his thunder… and it helps." | ~100 s |
| 7 | Go See Somebody | Send-off: "GROUNDBREAKER STUCK IN GROUND. YOU GOT LEGS. LUCKY."; to the knight ("BRING SNACK…") or the Count; a huge skeleton waves | thunder | Goblin 2 `Hugeskelly.mp4` | none | ~39 s |
| 8 | Breaking Ground | Event 1, lines verbatim | conductor's bed | none | none | ~27.7 s (budget 26) |
| 9 | QUIETLY | Event 2, lines verbatim | none | none | none | 30.0 s |
| 10 | The Giant's Verse | Event 3, verse verbatim | none | none | none | 18.0 s |

Lurk pieces are 30–40 s of short library clips (no voice, no bed) because he cannot move anything. His own lines
are ALL CAPS barks ≤ 17 words with only `[grunts]`, `[chuckles]`, `[laughs]`; every fleet-say answer is in the
speaker's own voice; pieces make sense when an answer is skipped. Casts go to Goblins 2 and 3 by name, `waitMs:0`,
every clip in the published manifest.

## Proof

- `node scripts/validate-scenes.mjs 5`: 0 errors, 0 warnings. `validate:schemas` passed (6); pact 72 passing.
- Replace endpoints (`?characterId=5`) validate-only clean, then written through, so :3100 serves the new files.
- Prerender: 26 unique lines, 25 rendered, 1 cached, 0 failed (`data/tts-cache/5/` on Orlok); the five fleet-say
  answers rendered into their speakers' caches on Orlok. Line lengths 8.0–14.3 s.
- Dry runs ids 1–10: all HTTP success, scene `success:true`, 0 failed; step counts 6, 8, 3, 21, 24, 27, 11, 5, 5, 3;
  scene 5 targets resolved (self .200; Dragomir .130, PumpkinHead .150, Renfield .249).

## Needs hands

1. **Re-point his lurk rotation on .200 before the push goes live:** live `lurk-scenes-state.json` has
   `sceneIds ["1","2","3","4","5"]` every 240 s; under the new numbering 3 is the greeting and 4/5 are story pieces
   that make other nodes speak → set `["1","2"]`. Scene 1 no longer drives the dead motor.
2. Push `poses.json` and `scenes.json` to .200 (not locked).
3. TTS cache: copy `data/tts-cache/5/` to .200 or run the prerender there (his tts-config matches the repo: voice
   `vfaqCOvlrKi4Zp7C2IAm`, eleven_v3, 0.45/0.6).
4. Deploy current code to .200 (fleet steps, hold/release, Goblin lookup by name).
5. Event part 8 runs ≈1.7 s over its 26 s budget (the two verbatim lines measure 26.8 s).
6. No Home or idle poses (see above); revisit when a part is repaired or added.
7. Mix not heard: ambience/stingers at 45–75 %, beds 25–35 %; one daylight ear-check of scene 4 on .200.
