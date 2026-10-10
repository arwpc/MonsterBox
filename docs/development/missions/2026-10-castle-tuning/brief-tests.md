# Brief — test engineer (Phase 4: tests follow the new services, the new shows, and the hardware)

Context to read first: `MISSION.md` (D6 and the status log), every `report-*.md` in this directory (each ends with
what it proved and what it left unproven), `recon-scenes-tests.md` §7 (test coupling), `CLAUDE.md` → Testing and
the `monsterbox-testing` skill (the one browser invocation that works here, the ports, what lies).

You own `tests/**`, `scripts/test-runner.mjs`, the test scripts in `package.json`, and `.gitignore` lines for
test artefacts. Nothing else; describe needed hooks in your report. Do not commit.

Deliver, each proven by a tool result:

1. **Tests never mutate operator state.** This morning the gate's timeout killed mocha mid-test and left synthetic
   parts (`987655`, `987657`) in Orlok's LIVE `data/character-3/parts.json`; the next run then failed on a shifted
   channel. Find every unit/system test that writes under `data/` (parts, poses, scenes, super-powers, calibration,
   app-config, audio library) and make it use an isolated data dir or a restored fixture, with a Mocha root hook
   that proves the live files are byte-identical after the run (fail loudly otherwise). The multi-turn servo test
   is the known offender; grep for others.
2. **Browser specs follow the new contracts.** Lurk/AI toggles are server-driven (`/conversation/api/lurk-state`,
   `/wake`, `/sleep`, `/ai-status` with `state`, `latency`, `conversationMode`); the dashboard Loop All posts
   `scene_id`; fleet has an `ai` key; scenes are the new ten per character plus Orlok's conductors 101–103 and the
   fleet step types; callouts/lurk scenes are off by default. Update `conversation-refactor.spec.js`,
   `orchestration.spec.js`, `actual-usage-testing.spec.js`, `scenes.spec.js`, `studio-goblin-step.spec.js`,
   `head-tracking-dashboard.spec.js` and whatever else asserts the old behaviour. Run the suite the only way that
   works here: `MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 npx playwright test tests/browser
   --reporter=list`; :3100 drives REAL hardware, so any play must use `?dryRun=1`; never run
   `tests/system/orchestration.test.js` against the live listener.
3. **System tests use the new scene data** (`tests/system/ai-motion.test.js`, `dashboard-api.test.js`, and any
   that read `scenes.json`/`poses.json`): character-independent, reading ids from the file rather than
   hardcoding them.
4. **Hardware tests per character part list.** A new `tests/hardware/parts-alive.test.js`, run manually ON a
   node (`npm run test:hardware:parts`, never in the gate): reads that node's own character (resolver), its
   `parts.json` and `config/physical-faults.json`, and for every movable part NOT listed broken performs the
   smallest safe motion through the calibration API (a few degrees for a servo inside its window, 300 ms at
   ≤ 25 % for a motor, ≤ 40 % for PumpkinHead, a 0.5 s jog for an actuator, on/off for a light) and judges the
   result by the hardware output, rejecting `simulated:true`. It must skip Sir Dragomir's part 1 and Orlok's
   parts 4 and 5 unless `MB_HARDWARE_ALLOW_HAZARDS=1`. Prove it on Orlok (daytime: the operator allowed motion;
   parts 2–5 are broken and vetoed).
5. **Unit coverage gaps named by the reports:** the fleet-event runner (`scripts/fleet-events/run-next.mjs`:
   rotation, quiet hours, busy deferral, release-on-failure, lock) — give it an importable core or test it as a
   child process with `--base` pointed at a stub server; `scripts/push-show.sh` dry-run; the conductor files
   parse and validate (`install-conductors.mjs --validate-only` against :3100).
6. **Keep the gate green** (`npm run gate`, now with a 180 s smoke cap) and `npm run test:unit` at 0 failing.

Report to `report-tests.md`: what changed per file and why, the suite results (unit, pact, system, browser:
numbers), the hardware test output on Orlok, known-flaky vs real, and anything that needs hands. If the write
under `docs/` is refused, return the full text.
