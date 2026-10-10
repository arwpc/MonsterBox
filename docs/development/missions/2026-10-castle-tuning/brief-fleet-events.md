# Brief — fleet-event author (Phase 3a scripts, then 3c rehearsal)

The operator, 2026-10-09 21:25: "I love the big orchestrated scenes with music, video, and movement when they all
participate — create three new events using scenes to have them perform some cool ceremony, have Orlok issue
orders in another one and have the animatronics interact, and perhaps try to have them all sing the same song
together. Get crazy, and run one of those every half hour, be sure animatronics and goblins return to their
original state afterwards. Don't forget the music!"

Read first: `MISSION.md` (D4, D5, D7), `docs/characters/STORY-BIBLE.md`, `report-scene-infra.md` (the fleet step
types, validator, TTS cache), `report-goblins.md` (reels and clip manifests per Goblin), `report-lurk.md` (the
event hold/release API), and `scripts/yard-theater/` (the older moment runner — reuse its ideas, its verify script
and its per-node skip logic; the events themselves are conductor SCENES, not moment files).

## Phase 3a — write the three event scripts first (`docs/characters/FLEET-EVENTS.md`)

For each event: the story, the music bed (a track from `data/audio-library/` — same ids on every node — or a new
instrumental you add to the library), the Goblin casts (play-once from each Goblin's reel manifest so the reels
resume), and a beat-by-beat timeline that names, for every character, the exact lines and movement of their
part. Each character's part becomes that character's scenes 8, 9 and 10 (written by the scene authors to your
script), and the Orlok conductor scene calls them with `fleet-scene` at the right moments. Keep each event 3–5
minutes, keep every spoken line ≤ 25 words in the bible's voice, and write parts that still make sense if one
node is missing (Mina is powered off tonight; Goblins 1 and 4 are off the network; the step types skip an absent
node with a warning).

1. **The Lighting of the Castle** (ceremony, conductor scene 101): dusk-to-dark ritual — the knight calls the
   watch, Renfield reads the covenant, Pumpkinhead counts the souls in the patch, Groundbreaker breaks ground,
   Mina's voice rises from below, Orlok names the night; lights and eyes, Goblin fire/moon/skull casts, one music
   bed that swells; ends with all six (concurrent `fleet-say`) speaking the castle's name together.
2. **The Count's Orders** (conductor scene 102): Orlok issues orders one by one; each character answers in
   character and then DOES something (a movement burst, a cast, a line to another character); Dragomir refuses
   an order about Pumpkinhead, Renfield writes everything down, Groundbreaker misunderstands and does something
   big, Pumpkinhead complains about Renfield's pumpkin sales, Mina answers softly from below; Orlok's hand light
   and head drive the beats; Goblins show what Orlok commands.
3. **One Song for Warner Castle** (conductor scene 103): an original song (your lyrics — nothing from any real
   song), simple meter, one verse per character in their own voice with `[sings]`, a chorus everyone sings at once
   (concurrent `fleet-say` on all nodes), over a shared music bed started on every node together; movement keeps
   time (head sways, pen taps, the coffin door opens on Mina's verse). Consider weaving Mina's Romanian lullaby in
   as the bridge she teaches the others.

## Phase 3c — build and prove (after the scene authors deliver scenes 8–10 per character)

- Conductor scenes in `data/character-3/scenes.json` ids 101–103 (Orlok hosts): `fleet-mode hold all` →
  `fleet-audio all` music bed (concurrent) → the beats (`fleet-scene`, `fleet-say`, `goblin-video`, Orlok's own
  movement) → `fleet-stop-audio all` → `fleet-mode release all`. Every Goblin cast is play-once with `waitMs`.
- `scripts/fleet-events/run-next.mjs`: rotates 101→102→103 (state in `data/fleet-events-state.json`), refuses
  during quiet hours (23:00–08:00) or when any node's `/conversation/api/ai-status` shows a live guest
  conversation (retry in 5 min), plays the conductor through `POST /scenes/api/<id>/play?characterId=3` on this
  node, and on any failure sends `fleet-mode release` to every node and `resume` to every Goblin. Add the cron
  through the schedule service's managed block (`*/30 17-22 * * *`, a `raw` action with the node script) so it
  appears on /schedule.
- Proof: `node scripts/validate-scenes.mjs 3` clean; a dry run of each conductor (`?dryRun=1`) shows every
  `fleet-*` step resolving its node; a real run of one event at 20 % fleet volume (daylight, or with the operator's
  go-ahead at night) captured by `scripts/yard-theater/verify-moment.mjs`-style mic witnesses; after each event,
  every node reports `lurking` with idle loop/music/head tracking back as configured and every online Goblin
  reports its reel looping (`playback-status` twice, 10 s apart).
- Report `report-fleet-events.md`: the three scripts (summary), the conductor step lists, rehearsal results per
  node, the schedule line, anything that needs hands.
