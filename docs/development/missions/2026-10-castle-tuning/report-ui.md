# Report: UI engineer (D6 phase 4: AI settings page and Studio palette)

Worker: ui-engineer, 2026-10-10 13:00–13:35 CDT on Orlok (saved by the lead). Not committed by the worker.
Scratch, screenshots and helper scripts in `/home/remote/mission-scratch/ui/`. One service restart at 13:19:16.

## Summary

| Brief item | State | Proof |
|---|---|---|
| 1. Conversation panel (duplex, lurk state, per-turn latency, 5 s refresh, explanation) | done | browser spec test 27; `ai-settings-conversation.png` |
| 2. Agent turn settings, read-only, deep link, snapshot time | done | spec test 28; page curled for characters 3, 1, 4 |
| 3. Lurk prefs + Wake / Sleep | done (prefs read from `GET /lurk-state`, see Hooks 1) | spec test 29 |
| 4. Studio palette: five fleet steps + goblin `goblinName` / `waitMs` | done | both tests in `studio-goblin-step.spec.js`; `studio-palette.png` |
| 5. Character independence | done | audits clean for these files; pages 200 for characters 1, 3, 4; spec test 30 |
| 6. Specs against :3100; gate | specs pass; gate was blocked by a comment in another file (fixed by the lead) | below |

## What changed

- **routes/aiSettingsRoutes.js** (read model only): `getCurrentCharacterInfo(req)` (:34) goes through
  `resolveCharacter(req)` (so `?characterId=N` works on `/ai-settings`, `/stt`, `/tts`; the direct
  `readConfig()` read is gone). `loadAgentTurnSummary(characterId)` (:59) takes `elevenLabsAgentId` from
  `data/characters.json`, scans `config/elevenlabs/agents/*.json` matching on `agent.agent_id` (never the file
  name), and returns turn model, eagerness, timeout, speculative turn, soft timeout, LLM, temperature,
  `max_tokens`, `client_events` (interruption / agent_response_complete flags), RAG, max duration, the deep link
  `https://elevenlabs.io/app/agents/<agent_id>`, the snapshot mtime and `metadata.updated_at_unix_secs`.
  ElevenLabs is never called. Passed to the view as `agentTurn` (:138); the page loads
  `/js/ai-settings-conversation.js` (:141).
- **views/ai-settings/index.ejs**: `#conversationLivePanel` (:234), `#agentTurnPanel` (:302, server-rendered,
  cells tagged `data-key`), `#lurkPrefsPanel` (:347: Wake/Sleep in the header, inactivity seconds, PIR wake
  checkbox, opt-out checkbox list, Save). Both live panels carry `data-character-id`.
- **public/js/ai-settings-conversation.js** (new, ES5 IIFE): `poll()` (:209) reads
  `GET /conversation/api/ai-status?characterId=N` every 5 s, pausing while the tab is hidden; `renderStatus`
  (:117: duplex mode and reason, lurk state with a countdown from `sleepInMs`, agent session, turn count);
  `renderLatency` (:147: one row per turn newest first with every leg, p50/p90 footer from the service's
  `summary`, the speech-end→transcript percentile computed in the page with the service's nearest-rank rule;
  the note that the node's share is tens of ms and the rest is the agent's end-of-turn wait); `renderLurk` /
  `renderOptOut` (:235, :267: prefs from `GET /conversation/api/lurk-state`, opt-out list = optable ∩ reported
  capabilities, unavailable ones disabled, `bound:false` disables the form, unsaved edits never overwritten);
  `savePrefs` (:309) posts `{inactivityTimeoutMs, pirWake, capabilityOptOut}`; `wakeOrSleep` (:336) posts
  `/wake {source:'ai-settings', explicit:true}` or `/sleep`; buttons follow the server state.
- **public/css/ai-settings.css**: three rules (latency table, key/value table), tokens only.
- **views/scenes/studio.ejs** (palette and editors only): a "Fleet" palette group `#fleetPalette` (:197), the
  five types in the Add Step modal (:1489), `STEP_META` (:779), timeline summaries (:818); node datalist from
  `GET /api/orchestration/nodes` (:432); fleet editors (:1273–:1390) writing exactly the fields `fleetSteps.js`
  reads (node with datalist + `all`, scene id or name, wait, timeoutMs, text, audioId with library datalist,
  volume, loop, mode, maxMs, reason; `force` hidden for release and stop-audio; empty optional numbers omitted;
  defaults: say/audio/stop/mode target `all`, mode = hold with reason `fleet-event`). Goblin editor
  (:1196–:1270): select writes `goblinName` and drops a legacy `goblinId` (:1401); unregistered names show
  "(not registered)"; new `waitMs` "Hold scene (ms)" 0–600000, default 0.
- **Tests**: `tests/browser/ai-settings.spec.js` new describe "AI Settings conversation, agent and lurk panels"
  (4 tests); `tests/browser/studio-goblin-step.spec.js` goblin test selects by name and expects
  `{goblinName, videoId, loop:false, waitMs:0}`; new "Studio fleet steps" test checks every `FLEET_STEP_TYPES`
  entry is in the palette and round-trips every editor. `tests/unit/multiturn-editor-range.test.js` needed no change.

## Proof

- Pages after the 13:19:16 restart: `/ai-settings` 200, `?characterId=1` 200, `?characterId=4` 200, `/scenes`
  200, `/scenes?characterId=1` 200. Deep links rendered for characters 3, 1, 4; char 3 cells: turn_v3, eager,
  5 s, speculative yes, soft timeout 3 s (≤ 1 per reply), gemini-3.5-flash-lite, max_tokens 140, interruption
  present, RAG off, max duration 1200 s, snapshot 2026-10-10 15:55:56 UTC; char 1's LLM gpt-5.4-mini.
- `ai-settings.spec.js` against :3100: 30 passed (then a live-data-guard note about `data/actuator-positions.json`,
  which is the server's own position tracking after the restart, not a spec write).
- `studio-goblin-step.spec.js` + `scenes.spec.js`: 22 passed. System tests `ux-redesign`, `ai-audio`: 50 passing.
- `npm run gate` stopped at audit:independence on `services/lurkStateService.js:1050` (a lead comment naming a
  character; reworded by the lead). Remaining steps by hand: audit:design-system clean; test:smoke 1103 passing,
  1 failing (the unit live-data guard reporting `data/audio-library/library.json` changed outside the test
  process); test:pact 72 passing.
- Screenshots in `/home/remote/mission-scratch/ui/`: `ai-settings-conversation.png` (FULL duplex, AWAKE, sleeps
  in 4:55, 4 turns, p50/p90), `ai-settings-agent-turn.png`, `ai-settings-lurk.png`, `studio-palette.png`.

## Hooks for others

1. `GET /conversation/api/lurk-state/prefs` does not exist (only POST); the page reads prefs from
   `GET /conversation/api/lurk-state`.
2. Fleet step colours in `public/css/studio.css` (added by the lead).
3. The gate blocker comment (fixed by the lead).
4. Whoever PATCHes an agent must refresh `config/elevenlabs/agents/*.json`; the panel shows only the snapshot.
5. Test engineer: the live-data guard flags runtime writes (`actuator-positions.json`, `library.json`) that are
   not spec writes.

## Unproven

Wake, Sleep and Save against the real server (the hazard guard answers them in the specs); the HALF duplex
display; the page on peer nodes before the final deploy; a goblin step with a non-zero `waitMs` saved from the
Studio.
