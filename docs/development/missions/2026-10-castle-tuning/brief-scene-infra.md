# Brief — scene-infra engineer (Phase 1e; prerequisite for the scene rebuild)

You own: `services/scenes/**`, `routes/scenes/**`, `routes/poses/**`, `controllers/posesController.js`,
`services/poses/**`, `services/elevenLabsTTSService.js` (cache only), `scripts/validate-scenes.mjs` (new),
`config/schemas/` if a field must be added, and their tests. Nothing else — the lurk-engineer owns
`routes/conversation.js`/`server.js`/`public/js/dashboard.js`, the conversation-engineer owns the WebSocket and
playback services, the goblin-engineer owns `services/goblin*`. Describe needed hooks in your report.

Context to read first: `MISSION.md` (D4, D6), `recon-scenes-tests.md` §0, §2, §3.3, §4, §5, §7, §8.

Deliver, each proven by a tool result:

1. **`askAI` speaks once.** The agent already plays its reply (`sceneExecutor.js:295-299`); drop the second TTS
   playback (`:314-338`) and keep the reply text in the step result and speech log.
2. **`audio` steps are not killed at 30 s.** The non-jaw path runs `speaker_cli.py play` under `runWrapper`'s
   30 s default. Give the audio step a timeout derived from the clip's library duration (+ 10 s margin, cap
   15 min), or route it through the Node player that does not cap. A 125 s track must play to the end; prove it
   with a dry measurement (timestamps in the log) while the sink stays muted.
3. **TTS disk cache for `sayThis`** keyed on sha256(text + voice id + model + stability/similarity), stored under
   `data/tts-cache/<char>/<hash>.mp3` (gitignored; NOT under `data/audio-library/files/`, which the library
   rescan would register as tracks). Cache hits skip the ElevenLabs call; a miss generates and writes
   atomically; an optional `nocache:true` on the step bypasses. Add `scripts/prerender-scene-tts.mjs` that
   warms the cache for every `sayThis` step of a character's scenes (so the show never depends on live quota).
4. **A scene/pose validator** (`services/scenes/sceneValidator.js` + `scripts/validate-scenes.mjs <charId|all>`):
   schema validity; every `partId` exists for that character and is not listed in `config/physical-faults.json`
   (warn, not fail, for faults — the executor skips them); every `poseId` exists; every `audioId` resolves
   (library id or filename); `goblin-video` targets resolve by name or id and name a file in the known clip
   manifest (`backups/goblins-gold-2026-09-25/goblin-192-168-8-14/videos.manifest.tsv` until the goblin-engineer
   publishes a manifest API); durations sane; servo angles inside the calibrated window from
   `calibratedBounds()`/`store.get()` where a window exists; the hazard rules: Orlok parts 4 and 5 never in one
   step/pose, Sir Dragomir part 1 only inside 372–406° and never `usePreset __MIN__/__MAX__`, PumpkinHead motor
   speed ≤ 40. Exit non-zero with `file:scene:step` messages. Wire it into `npm run validate:schemas` or the gate.
5. **Bulk replace endpoints with validation and a backup**: `POST /scenes/api/replace {scenes:[...]}` and
   `POST /poses/api/replace {poses:[...]}` (character via `resolveCharacter(req)`): validate with (4), write a
   timestamped backup of the old file next to it (or under `data/backups/`), then write atomically. Return 423
   with `CHARACTER_CONFIG_LOCKED` on a locked character (today scenes/poses return 500/400 on lock refusal —
   fix those routes too). `POST /scenes/api/import` keeps its merge semantics but must validate.
6. **Goblin casts by name**: in `executeGoblinVideoStep`, resolve `goblinId` OR a new `goblinName` through
   `goblinManagerService.resolveGoblin(nameOrId)` if that export exists, else a local case-insensitive name match
   over the registry; keep the proof-of-playing and return-to-queue behaviour; accept `waitMs` on the step to
   hold the scene for the clip (default 0).
7. **Queue start-config accepts both `scene_id` and `sceneId`** (the dashboard sends the latter).
9. **Cross-node step types (mission decision D7)** so scenes can trigger each other and the fleet events can be
   conductor scenes: `fleet-scene {node (animatronic id or character name), scene (id or name), wait (default
   true), timeoutMs}` runs that scene on that node (`POST https://<ip>:3000/scenes/api/<id>/play?characterId=N`,
   or the local executor when the node is this one; resolve nodes through the orchestration node registry so a
   discovered IP wins over the static one; skip an offline node fast with a warning, like
   `scripts/yard-theater/perform.mjs` does with its preflight); `fleet-say {node|'all', text, wait}` through the
   orchestration say path in that node's own voice; `fleet-audio {node|'all', audioId, volume, loop}` and
   `fleet-stop-audio {node|'all'}` through the orchestration play-audio/stop-audio paths (library ids are the same
   on every node because the audio library deploys); `fleet-mode {mode:'hold'|'release', node|'all'}` calling
   `POST /conversation/api/lurk/event-hold` / `event-release` on each node (the lurk-engineer is adding them;
   until they exist, log and continue). All four are non-fatal, honour `concurrent`, and refuse (warn + skip) a
   node that reports an active guest conversation unless `force:true`. Add them to the schema enum, to
   `tests/pact` `KNOWN_STEP_TYPES`, to the validator (node must exist in `config/animatronics.json`, scene must
   exist in that character's file when it is in this repo), and to the Studio's step palette if that is a small
   change in `views/scenes/studio.ejs` (otherwise note it for the UI pass). Call the orchestration service's
   exported functions rather than re-implementing HTTP; do not edit that service.
8. **Tests**: unit tests for the validator (fixtures per hazard rule), the cache, the askAI single-play, the audio
   timeout derivation, the replace endpoints (lock refusal → 423); keep `tests/unit/scene-step-resilience.test.js`
   and `tests/unit/fleet-honesty.test.js` green (they pin source shapes — update them deliberately if you change
   the pinned lines, with the reason in the report).

Rules: no new npm dependencies; do not commit; never `git add -A`/stash/checkout; no audio at volume (Orlok's
sink is muted at the device level — leave it); `?dryRun=1` only on :3100 for play tests; never run
`tests/system/orchestration.test.js` against the live listener. Report to `report-scene-infra.md` (what changed,
file:line, proofs, hooks needed, unproven items) and return a short summary.
