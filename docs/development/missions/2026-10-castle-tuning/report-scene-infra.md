# Report: scene-infra engineer (Phase 1e)

Worker report, 2026-10-09 ≈ 23:00 CDT (saved by the lead; the worker could not write under `docs/`). Items 1–7
and 9 of `brief-scene-infra.md` delivered; item 8 (tests) passes except one gate step, `audit:independence`,
which fails on other workers' files (`services/elevenLabsWebSocketService.js`, `services/serverPlaybackService.js`,
`scripts/goblins/build-reels.mjs`, `tests/unit/conversation-duplex.test.js`, `tests/unit/conversation-session.test.js`).
Nothing was committed by the worker. Orlok's default sink read `[MUTED]` before and after every test; no hardware
was driven; monsterbox.service was restarted once at 22:41:44 CDT and came back healthy on 10.7.0.

## Results by item

1. **`askAI` speaks once.** The second TTS playback is gone. The step waits for `askAgentQuestion` (the agent
   already plays its own reply), then puts the reply text in the step result and the speech log. To avoid logging a
   line twice, it only logs when the reply came on a one-shot socket (it checks `viaSession`). If the agent gives no
   reply, the step records a non-fatal failure instead of speaking the old canned "I heard your question…". Code:
   `sceneExecutor.js:362`.
   - Proof: a unit test checks the function contains no TTS or playback call. A live spoken run is UNPROVEN (sound).

2. **Long `audio` steps are no longer killed at 30 s.** The non-jaw path now calls
   `runWrapper('speaker_cli.py', args, {timeoutMs})` with a timeout of the clip's library duration plus 10 s. If the
   library has no duration it asks ffprobe; the timeout is capped at 15 min. Code: `sceneExecutor.js:157`, `:235`,
   `:275`.
   - Proof: the real executor played "06 - Snarling Werewolves" (124.8 s) at volume 0 into the muted sink. Log:
     start 03:39:24.654Z, "finished after 126.1 s", end 03:41:30.831Z, `success:true`, `elapsedMs:126141`, player
     mpg123, not simulated. Proof script and log: the worker scratchpad `w5/audio-proof.mjs`, `audio-proof.log`.

3. **TTS cache for `sayThis`.** New `services/scenes/ttsCache.js`; the executor uses it at `sceneExecutor.js:325`.
   - Key = sha256 of text, voice, model, stability, similarity. Clips go to `data/tts-cache/<char>/<hash>.mp3|wav`
     (gitignored). Writes are atomic. `nocache:true` on a step skips the cache both ways. Failures and test-mode
     stubs are never stored.
   - Warm-up: `scripts/prerender-scene-tts.mjs <charId|all> [--dry-run]`, or `--character N --text "..."` for one line.
   - Proof: one real render for character 3 took 1171 ms and wrote 48527 bytes; the rerun reported a cache hit. A
     dry run over all repo scenes found 53 unique lines, none cached yet.

4. **Validator.** New `services/scenes/sceneValidator.js` and
   `scripts/validate-scenes.mjs <charId|all> [--json] [--no-calibration] [--quiet] [--baseline f]`.
   - Hazard rules live in new `config/scene-hazards.json` as data (no new `.js` file names a character): Orlok parts
     4 and 5 never together (one pose, one step or one concurrent group); Sir Dragomir part 1 only inside 372–406°,
     never by preset, never a continuous spin; PumpkinHead's motor at most 40 % (a missing speed counts as the
     default 50).
   - Also checks: parts exist and match the step type (broken parts are warnings only); pose ids exist; audio
     resolves by library id, library filename or file on disk (catches the `audioFile` misspelling); Goblin targets
     resolve and the clip is in that Goblin's manifest (`backups/goblins-gold-*/<id>/videos.manifest.tsv`, or
     `data/goblin-manifests/` if published); durations (30 s wrapper cap, waits ≤ 10 min); servo angles inside this
     node's calibrated window (character-scoped entries only); scene and pose ids integer and unique; fleet steps
     name real nodes and scenes.
   - Wired in as `npm run validate:scenes` (`package.json:83`) and gate step 1b (`scripts/gate.mjs:45`).
   - Proof: a full run takes 0.4 s. Two real legacy errors are baselined in
     `tests/baseline/scene-validator-baseline.json` (may only shrink): Mina scene 100 uses `audioFile`; Orlok scene
     107 has a Goblin step with no `videoId`. 11 broken-part warnings.

5. **Bulk replace endpoints.** `POST /scenes/api/replace {scenes}` (`routes/scenes/api.js:555`) and
   `POST /poses/api/replace {poses, templates?}` (`controllers/posesController.js:193`, route `routes/poses/index.js:47`).
   - Order of checks: locked character → 423 `CHARACTER_CONFIG_LOCKED`; invalid content → 400 with
     `file:scene:step` messages; otherwise the old file is copied to `data/character-N/backups/` and the new one is
     written atomically. `?validateOnly=1` checks without writing. Pose replace warns about existing scenes whose
     pose would disappear. Import keeps its merge behaviour but validates. Every other scene and pose write route
     now answers 423 on a locked character (was 500 or 400).
   - Live proof on :3100: replace on char 1 gave 423 for scenes and poses; `POST /poses` on char 1 gave 423;
     validate-only of Orlok's live scenes gave 400 with the scene-107 error.

6. **Goblin casts by name.** `goblinId` or `goblinName` resolves through `resolveGoblin`, with a local
   case-insensitive fallback (`sceneExecutor.js:418`). New `waitMs` holds the scene for the clip (`:441`).
   Unit-tested; a live cast is UNPROVEN (no Goblin screen lit at night).

7. **Queue start-config accepts `sceneId`** as well as `scene_id` and `id` (`queueLibrary.js:73`), so the
   dashboard's Loop All works. Unit-tested.

8. **Tests.** New `tests/unit/scene-infra.test.js` (29 tests) and `tests/unit/scene-validator.test.js` (19 tests, a
   failing and a passing case per hazard rule). Full unit suite 1065 passing, 0 failing; `scene-step-resilience`
   and `fleet-honesty` untouched and green. Pact 72 passing; `validate:schemas`, `audit:resolver`,
   `audit:design-system` clean; `audit:independence` fails on the other workers' files listed above.

9. **Fleet steps (D7).** New `services/scenes/fleetSteps.js` and `fleetNodes.js`; added to the schema, pact and
   validator. All non-fatal; all honour `concurrent`.
   - `fleet-scene`: on this node it runs in-process (nesting limited to 3 deep); on another node it calls
     `/scenes/api/<id>/play`, and a scene given by name is looked up in that node's own library.
   - `fleet-say`: goes through each node's own `sayThis` path (that node's voice, cache and jaw), falling back to
     generate-and-play on older builds. Deliberately not the orchestration say path, which neither caches nor
     moves the jaw.
   - `fleet-audio`, `fleet-stop-audio`: the same endpoint chain the orchestration routes use.
   - `fleet-mode`: calls the lurk `event-hold`/`event-release` endpoints; a 404 is logged and the show goes on.
   - Before each call a 2.5 s `ai-status` check: an unreachable node is skipped with a warning; a node in a live
     conversation is skipped unless `force:true`, except that release and stop-audio are never refused.
   - Nodes resolve through the live registry (mDNS IP wins): by id, character id, name, hostname or a unique
     fragment (e.g. "dragomir"); ambiguous names are refused. All HTTP goes through `orchestrationService.httpNode`.
   - With `?dryRun=1` a fleet step only resolves its targets and sends nothing.
   - Live proof: dry-run `fleet-say all` listed all six nodes with Orlok as self; dry-run `fleet-scene Renfield`
     resolved to .249 and `fleet-audio dragomir` to .130; an unknown node gave a clear error; a real
     `fleet-mode release all` took 0.73 s and reported all six "unsupported" (endpoints not there yet), with
     matching lines in `/var/log/monsterbox.err`.

## Other files touched

`config/schemas/scenes.schema.json`, `tests/pact/character-contract.test.mjs`, `services/scenes/scenesService.js`
(`replaceScenes`, `backupDataFile`), `services/poses/poseRepository.js` (`replacePoses`), one line each in
`.gitignore` (`data/tts-cache/`, `data/character-*/backups/`), `package.json` and `scripts/gate.mjs`.

## Hooks needed from others

- **Lurk engineer:** `routes/conversation.js` needs `POST /conversation/api/lurk/event-hold` and `event-release`;
  `fleet-mode` already calls them with `{characterId, reason, maxMs?}` and `?characterId=N`.
- **Conversation engineer:** `askAI` relies on `askAgentQuestion` resolving only after the reply has finished
  playing (otherwise the next step overlaps the agent's line), and reads `aiResponse.viaSession`.
- **Goblin engineer:** publish per-Goblin clip manifests, including reel filenames, as
  `data/goblin-manifests/<goblinId>.tsv` or `.json`, so the validator can verify Goblin 4 clips and the reels.
- **Deploy:** `deploy-to-animatronic.sh` must exclude `data/tts-cache/` and `data/character-*/backups/` (with
  `--delete`, a deploy would push Orlok's cache and wipe clips a node rendered itself), or run the prerender on
  Orlok and then deploy to spread the cache.
- **UI pass:** fleet steps are not in the Studio palette yet (`views/scenes/studio.ejs`, about five places; a test
  pins that file).

## Unproven

- Anything that makes sound or light at night: a live spoken `askAI`, an audible cached `sayThis`, a live Goblin
  cast, real remote `fleet-scene`, `fleet-say` and `fleet-audio`.
- Skipping an offline node live (every node, Mina included, answered tonight); only the unit tests prove it.
- The calibration-window check on real data (no character-scoped windows on this node since the 2026-09-06 wipe).
