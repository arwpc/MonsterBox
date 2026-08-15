# v9.0 — Orlok Autonomous Build Mission

**Objective:** Ship **v9.0**: a fully working, Halloween-ready **Orlok** (char_id 3,
`192.168.8.120`, the primary dev box) — all parts functioning, a populated pose library,
realtime video and audio, and tested realtime STT/TTS on the latest ElevenLabs systems.

**Operating mode: FULLY AUTONOMOUS.** Do not ask the operator anything, do not pause for
approval, do not present plans for sign-off. Decide, act, self-verify, and keep working
until the Definition of Done is met. If a choice is ambiguous, pick the option that best
serves a reliable, on-hardware-verified Orlok by Halloween, record the decision in your
work log, and proceed. Recover from failures and retry on your own.

This mission is executed by a **team of expert subagents** already defined in
`.claude/agents/`. You are the **orchestrator**: decompose the work, fan out to the experts
in parallel where the work is independent, adversarially self-verify their results, and
synthesize. Run the whole thing to completion.

## Expert agent team (delegate to these)
- **hardware-diagnostician** — proves parts physically move; isolates dead channels; investigates the fuse. (read-only)
- **python-wrapper-specialist** — fixes/hardens `python_wrappers/*.py`; guarantees `py_compile`.
- **elevenlabs-ai-specialist** — verifies current ElevenLabs offerings; upgrades the canonical TTS/STT in place; tests live.
- **pose-author** — builds & validates the `poses.json` library within calibrated bounds.
- **test-runner** — runs area/hardware/actual-usage suites; triages real vs flaky vs environmental.
- **security-triager** — Dependabot + leaked-credential triage; existing-dep fixes only.
- **docs-scribe** — keeps `KNOWN-BUGS.md`, `CHANGELOG.md`, `README.md`, `docs/` and the version record truthful.
- **character-auditor** — run before any cross-character edit (existing agent).

## Non-negotiable rules (these replace human approval)
1. **No new npm dependencies, frameworks, or transport layers — ever.** Patch/update to
   *existing* deps is allowed. Preserve all existing API contracts. **Version comes only
   from `package.json`** — never hardcode it.
2. **Hardware safety is self-enforced.** Before commanding Orlok's **ch4 Elbow / ch5
   Forearm** at all: (a) add per-part `speedPct` caps to their calibration profiles, (b)
   serialize ch4+ch5 dispatch so they are never commanded concurrently, and (c) re-implement
   the hardware safety-limit layer at `services/hardwareService/index.js:1567`. Only then
   move them, ramping from the smallest motion. Never full-range-sweep unsupervised. Never
   retract the **Bow-at-Waist actuator (part 3)** below its current min. API `success:true`
   is not proof of motion — confirm physically.
3. **Preserve node-local runtime state** — `config/app-config.json` (selectedCharacter) and
   `data/character-3/**` runtime data are never committed. (Note: hostname auto-select may
   rewrite `selectedCharacter` on restart — expected.)
4. **The gate is the guardrail.** Run relevant area tests before/after each change and
   `npm run test:smoke` as a sanity check; run the **character-auditor** before cross-character
   edits; run `npm run gate` before every push (it blocks schema/resolver/independence/smoke/
   pact regressions). Never bypass the gate.
5. **Commit small, push often.** Small `v9.0.0: [phase] …` commits; push over SSH
   (`git remote set-url origin git@github.com:arwpc/MonsterBox.git`, then `git push origin main`).
   Keep progress durable in the repo so state survives a restart.

## Phase 0 — Sync
`git fetch origin` and fast-forward to latest `origin/main` (stash node-local runtime mods
first if the tree is dirty, pop after).

## Phase 1 — Organize all issues (autonomous)
Read `docs/troubleshooting/KNOWN-BUGS.md` fully; add signals from `git log`, `CHANGELOG.md`,
both allowlists (`eslint-rules/no-direct-character-resolution.allowlist.json`,
`tests/baseline/character-independence-allowlist.json`), and the Dependabot alerts. Fan out
(hardware / cross-cutting software / security+data-hygiene) to build a prioritized backlog
(severity × blast-radius), and have **docs-scribe** write it back into the one tracker file.
Then proceed straight into the build — no check-in.

## Phase 2 — Confirm the toolchain is modern, then use it
The expert team and this mission already encode the orchestrator–worker pattern. Briefly
confirm current Anthropic best practice (spawn `claude-code-guide` and/or WebFetch
docs.anthropic.com/en/docs/claude-code — subagents, hooks, MCP, plan mode, background tasks/
workflows, and the multi-agent-system guidance); refine the agent definitions or add a
guardrail only if it clearly helps, keeping everything config-level. Then drive Phase 3 with
the team, running independent experts in parallel.

## Phase 3 — Definition of Done for v9.0
Validate everything on **real hardware**, not just test-mode.
1. **All parts functioning & calibrated** — every part in `data/character-3/parts.json`
   physically actuates within calibrated bounds (servos, continuous servos, linear
   actuators, motors, lights, sensors); the ch4+ch5 fuse issue resolved or safely mitigated
   per rule 2. *(hardware-diagnostician + python-wrapper-specialist)*
2. **Populated poses** — a full expressive `data/character-3/poses.json` (neutral/idle,
   gestures, reusable scene fragments), each validated within bounds. *(pose-author)*
3. **Realtime video** — the webcam streams end-to-end through the real MJPEG path
   (`controllers/webcamController.js` / orchestration proxy), including the Fleet Command
   Center; wire the simulated `hardwareService` `startStream`/mic stubs to the real capture
   path or route around them — no no-ops shipped.
4. **Realtime audio** — one-shot playback, audio loops, and mic capture all work on Orlok's
   USB audio.
5. **Realtime STT + TTS on the latest ElevenLabs systems** — assume the current integration
   is stale; verify current offerings and upgrade the single canonical TTS/STT
   implementations in place (within rule 1); fix conversation start/stop not opening/closing
   the ElevenLabs WebSocket (`routes/conversation.js:668`); prove the full loop live: speak →
   transcribe → AI respond → jaw-synced speech. *(elevenlabs-ai-specialist)*
6. **Integration & showtime reliability** — scenes, TTS-synced jaw animation, head-tracking,
   idle loop, armed mode, and queue loops run cleanly for extended periods with controlled
   SD-card writes and stable memory; `npm run test:actual-usage` and the hardware tests pass
   (real failures fixed and re-run). *(test-runner)*
7. **Release** — bump `package.json` to **9.0.0**; update `CHANGELOG.md`, `README.md`,
   `docs/`, and move resolved items in `KNOWN-BUGS.md` to Recently-Fixed *(docs-scribe)*; run
   `npm run gate`; commit, tag `v9.0.0`, push over SSH; then a final autonomous end-to-end
   verification pass, logged.

## Work log
Maintain a running log of decisions and progress by keeping `KNOWN-BUGS.md` and
`CHANGELOG.md` updated as you go (so a restart can resume). When every DoD item is green and
hardware-verified, the mission is complete.
