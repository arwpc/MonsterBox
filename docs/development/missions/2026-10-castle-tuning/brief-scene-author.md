# Brief — scene-author (Phase 3; one worker per character, at most three concurrent)

You author the complete new show for ONE character: a fresh pose library and ten scenes, replacing everything
that exists. The operator's words: "Be creative. Involve as many movements and combinations of each character's
parts as possible. Use the stories to drive movement between and during lines and music. Remember that you can
cast video. Delete all old scenes and poses, and build new ones." Read first: `MISSION.md` (brief, rules, D4),
`docs/characters/STORY-BIBLE.md` (the shared world, this character's voice, lexicon, cross-references),
`report-scene-infra.md` (validator, cache, replace endpoints, Goblin casts by name, audio-step limits),
`report-goblins.md` (reels per Goblin, clip manifest), `recon-scenes-tests.md` §2 (step reference — field names
exactly as the executor reads them) and your character's `data/character-N/parts.json`, `servo_calibrations.json`,
`linear_actuator_calibrations.json`, `movement-config.json`, `super-powers.json`.

## The shape of the show (same for every character)

Ten scenes, named `<Character>: <Title>`, ids 1–10, each with a one-line `description` of the story beat:

- 2 **lurk pieces** — silent movement only (no `sayThis`/`audio`/`askAI`), 20–60 s, built from the idle poses and
  a light or two; safe to rotate while lurking. Mina's lurk pieces are the exception: they carry one of her three
  Romanian lullabies as a pre-rendered `audio` step (generate them with eleven_v3 and the `[sings]` tag from the
  bible lyrics, upload to the audio library with `POST /audio-library/api/upload`, tag `mina-lullaby`).
- 1 **wake greeting** — 5–12 s: a movement burst plus one short line that invites the guest to speak (the wake
  path can play it before the AI conversation starts).
- 3 **story pieces** — 45–120 s: music bed or ambience from the audio library (concurrent), movement that follows
  the music and the lines, two to five `sayThis` lines in the bible's voice, lights, and where the story calls for
  it a Goblin cast (`goblin-video` with `goblinName: "Goblin 1|2|3"` and a clip from that Goblin's reel manifest,
  `waitMs` for the clip length). Each story piece advances this character's thread from the bible. The operator
  wants the animatronics to trigger each other: where the story calls for it, use `fleet-say {node:'<Character>',
  text}` for a one-line answer from another character in their own voice, or `fleet-scene` to call one of their
  short pieces (the step skips a node that is busy with a guest, so write the piece to stand on its own too).
- 1 **cross-castle send-off** — 20–40 s: lines that hand the guest to another character (Dragomir → Orlok/Mina,
  Renfield → Pumpkinhead, Groundbreaker → anyone, Pumpkinhead about Renfield's pumpkin sales, Mina about the
  knight, Orlok summoning), with movement toward that character's direction where the rig can.
- 3 **event parts** (scenes 8, 9, 10) — this character's part in each of the three fleet events scripted in
  `docs/characters/FLEET-EVENTS.md` by the fleet-event author: the ceremony, the Count's orders, and the shared
  song (your lines, verse and chorus, are given there; implement them exactly, with the movement the script
  describes, so the Orlok conductor can call `fleet-scene` on them with the timing it expects). Each part begins
  with a 100 ms `wait` so the conductor's call lands cleanly and ends in your Home pose.

Poses (`poses.json`): a `Home` pose; at least six `idle`-tagged poses with `weight > 0`, `holdVariance` and
`transitionDurationMs` set, small safe moves spread across the parts the character can move — and because head
tracking holds the head/pan servo while lurking (the servo priority manager denies the idle loop on that part),
at least half of the idle poses must move something other than the head (an arm, a light, the jaw a crack, the
pen, the coffin door a few millimetres, a motor pulse) or the character will not move at all while tracking; expressive poses
used by the scenes (name them for the story beat). Every servo angle inside its calibrated window; no pose or
step drives a part listed broken in `config/physical-faults.json`; Orlok parts 4 and 5 never together; Sir
Dragomir part 1 only inside 372–406° and never full-range presets; PumpkinHead motor ≤ 40 %; Groundbreaker's head
motor is dead (his show is voice, video, lights of other nodes and timing); Renfield's pen servo moves fast and
often in every piece (and his shake motor shakes when the master is named).

`sayThis` text uses the bible's voice rules (tags sparingly, ≤ 25 words a line, Romanian words for Orlok, no
Romanian accent for Mina, third person for Pumpkinhead, legal lexicon for Renfield, barks for Groundbreaker).
Use `concurrent` deliberately: a concurrent step lets everything after it start immediately (not just the next
step), so bracket parallel blocks with a `wait`.

## Proof before you hand back

1. `node scripts/validate-scenes.mjs <charId>` clean; `npm run validate:schemas` and `npm run test:pact` green.
2. `node scripts/prerender-scene-tts.mjs <charId>` warmed every line (no quota surprises on show night).
3. Dry run of every scene through the node's listener (`?dryRun=1` on :3100) — all ten succeed.
4. Write the files to `data/character-N/poses.json` and `scenes.json` in this repo (the lead pushes them to the
   node and refreshes locks); do not touch any other character or any code; do not commit.
5. Report `report-scenes-<char>.md`: the ten scenes (title, beat, parts used, audio, casts), the pose list, the
   validator output, the dry-run result, anything that needs hands (a missing clip, an uncalibrated part).
