# Brief — UI engineer (Phase 4: the AI settings page and the Studio follow the new services)

Context to read first: `MISSION.md` (D6), `report-conversation.md` (ai-status now returns `latency` {last 20
turns, p50/p90} and `conversationMode`), `report-lurk.md` (lurk-state, prefs, hold/release, the `ai` fleet key),
`report-personas.md` (the agent settings that matter: turn model, eagerness, timeout, LLM, max_tokens),
`report-scene-infra.md` (fleet step types; the Studio palette was left for this pass), `CLAUDE.md` → Code Style
(client JS in `public/js/*.js` is ES5 IIFE: `var`, no arrow functions, no template literals; inline EJS scripts
may use ES6+).

You own `views/ai-settings/**`, `public/js/ai-settings*.js`, `public/css/ai-settings.css`,
`routes/aiSettingsRoutes.js` (read-model only), `views/scenes/studio.ejs` and `public/js/studio*.js` (the step
palette and step editors only), and their tests under `tests/browser/ai-settings.spec.js` and
`tests/browser/scenes.spec.js` / `studio-goblin-step.spec.js`. Do not touch services or other routes; describe
hooks in your report. Do not commit. Other workers may restart monsterbox.service; wait for :3100.

Deliver, each proven by a tool result:

1. **AI settings page, conversation panel** (read-only, live): the node's duplex mode (`conversationMode`), the
   lurk state (`state`, `sleepInMs`), the per-turn latency table from `ai-status.latency` (last turns: guest speech
   end → transcript → first audio → playback, interrupted yes/no; p50/p90), refreshed every 5 s while the page is
   open, with a plain explanation that the remaining latency is the agent's end-of-turn wait. No new endpoints:
   everything comes from `GET /conversation/api/ai-status`.
2. **Agent turn settings, read-only with a deep link:** show the current agent's `turn_model`, `turn_eagerness`,
   `turn_timeout`, soft timeout, LLM, `max_tokens`, `client_events` (interruption present?), RAG on/off, from the
   committed snapshot `config/elevenlabs/agents/<name>.json` (resolve the snapshot by the character's agent id;
   the route may read the file; never call ElevenLabs from the page), with a link to
   `https://elevenlabs.io/app/agents/<agent_id>`. Mark the snapshot's refresh time.
3. **Lurk prefs** on the same page: `inactivityTimeoutMs`, `pirWake`, `capabilityOptOut` (checkbox list of the
   capabilities the node reports) through `GET/POST /conversation/api/lurk-state/prefs`, and a Wake / Sleep pair
   (`POST /wake`, `POST /sleep`) that reflects the server state.
4. **Studio palette:** the five fleet step types (`fleet-scene`, `fleet-say`, `fleet-audio`, `fleet-stop-audio`,
   `fleet-mode`) with field editors matching `services/scenes/fleetSteps.js`'s header (node by name, scene id or
   name, wait, timeoutMs, text, audioId, volume, loop, mode, maxMs, reason, force), and `goblinName` + `waitMs` on
   the goblin-video editor. Keep the pinned test honest: update `tests/unit/*` that pins `studio.ejs` deliberately
   with the reason.
5. **Character independence:** everything through `resolveCharacter(req)` / `?characterId`; test with two
   characters; no names or ids in source (the gate's `audit:independence`).
6. **Proof:** pages return 200 for two characters; `tests/browser/ai-settings.spec.js` and the Studio spec updated
   and green against :3100 (`MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test
   tests/browser/ai-settings.spec.js tests/browser/scenes.spec.js --reporter=list`); `npm run gate` green;
   screenshots of the new panel if Playwright can capture them.

Report to `report-ui.md` (what changed, file:line, proof, hooks, unproven). If the write under `docs/` is
refused, return the full text.
