# Build v9.0 — Orlok (autonomous)

Execute the v9.0 Orlok build mission **fully autonomously** — do not ask the operator
anything, do not pause for approval, do not present plans for sign-off. Decide, act,
self-verify, and keep working until the Definition of Done is met.

## Step 1 — Familiarize
Read, completely:
1. `CLAUDE.md` — rules, architecture constraints, code style, testing protocol.
2. The auto-loaded `MEMORY.md` and any relevant topic memory files.
3. `docs/development/V9-ORLOK-MISSION.md` — **the authoritative mission** (objective, rules, phases, Definition of Done).
4. `docs/troubleshooting/KNOWN-BUGS.md` — the single fleet issue tracker (Orlok section + audit appendix).

## Step 2 — Confirm you are on Orlok
Verify this node is Orlok (char_id 3). Check `config/app-config.json` / hostname; the fleet
roster is in `config/animatronics.json`. If this is NOT the Orlok node, stop and say so —
this mission drives real Orlok hardware and must run on that node.

## Step 3 — Execute the mission
Run `docs/development/V9-ORLOK-MISSION.md` end-to-end: Phase 0 (sync) → Phase 1 (organize
issues) → Phase 2 (confirm toolchain) → Phase 3 (build to the v9.0 Definition of Done).
Orchestrate the expert subagents in `.claude/agents/` (hardware-diagnostician,
python-wrapper-specialist, elevenlabs-ai-specialist, pose-author, test-runner,
security-triager, docs-scribe, character-auditor) — the orchestrator–worker pattern — fanning
out independent work in parallel and adversarially self-verifying results.

Honor every non-negotiable rule in the mission: no new dependencies/transports; hardware
safety self-enforced (ch4/ch5 speed caps + serialization + safety layer BEFORE moving them;
never retract part 3 below min); preserve node-local runtime state; the `npm run gate` is the
guardrail and is run before every push; version comes only from `package.json`; commit small
and push over SSH.

Do not stop until v9.0 is shipped (tagged, pushed, and verified end-to-end on real hardware).
