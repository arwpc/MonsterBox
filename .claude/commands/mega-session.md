# v11 Mega Session

You are running the v11 stabilization session on the MonsterBox fleet. Operating mode, by
standing operator directive: **fully autonomous — never pause for approval**; short, frequent
status updates (lead with the outcome, a few lines); the operator adds ideas mid-session via
noisy dictation — fold each into the plan in one line and keep working. Reserve questions for
genuine safety forks on unproven hardware.

## Orient (do this before any work)
1. `git status` + `git log --oneline -15`, and sync against the operator's node per the
   `monsterbox-fleet` skill — the newest code may not be on this node.
2. Read `docs/development/V11-HANDOFF.md` end to end. It is the authoritative scope: what is in
   v11, what Aaron explicitly deferred, the hard safety constraints and the incident behind each.
3. `/log-review` to true up KNOWN-BUGS against reality.
4. Check for prior in-flight workflow results before redoing anything (`journal.jsonl` under the
   session dirs; agent work also persists on the filesystem when journals are empty).

## The mission, in Aaron's words
"I want this codebase rock solid and stable and every part of it working before I make any other
changes." **Do not expand scope.** New findings get written down, not chased.

## Work items, in order
1. **Voices** (elevenlabs-ai-specialist): prove by ear-check that each node plays its DESIGNED
   voice. Mina: no Romanian accent, does whisper, no singing. Suspect the low/zero
   quality-vs-latency setting from the earlier ElevenLabs integration; find the writer of any
   flattened config, don't just restore values.
2. **Canonical STT** (elevenlabs-ai-specialist): define THE canonical STT implementation from
   current ElevenLabs documentation, route every consumer through it, delete the rest. Proof is
   a cross-node transcript.
3. **Dashboard freshness + audio dropdowns**: fix the three root causes (nothing re-reads server
   state after load; POST responses discarded so refused toggles stay lit; audio device info not
   rendered), not the 23 symptoms. Add the input/output dropdowns with persistence Aaron asked
   for, verbatim in the handoff §5.1.
4. **Head tracking**: two servo kinds × two camera mounts (`cameraMount: 'head' | 'fixed'`),
   per handoff §5.2. Dispatch on `profile.capability.kind`, which is currently read and thrown away.
5. **Poses/scenes rebuild** — ONLY after the operator's calibration session; only parts with real
   measured windows. 7 poses + 5 scenes per character. Wipe the garbage first (backup exists:
   `pre-pose-scene-reset-2026-08-20` tag + `ARCHIVE/pre-reset-2026-08-20/`).
6. **Verify + ship**: gate, pact, hardware spot-check per the handoff's verification bar, docs,
   bump to 11.0.0, tag.

## Hard rules (each backed by an incident — details in the skills)
- Never command Orlok parts 3, 4, 5 or Dragomir part 1. No software speed/current cap exists.
- Audio is proven by ear-check; deploys are proven by grep on the node; scene "success" is not
  motion.
- Node-local files never travel between nodes or into commits.
- Load `monsterbox-hardware` before touching parts, `monsterbox-testing` before running suites,
  `monsterbox-fleet` before touching other nodes, `fable-orchestration` before fanning out
  agents (model/effort table, Pi concurrency limits, agent-shape rules, write results to disk).

## Cadence
Orchestrate, don't grind: the lead scouts, delegates bounded schema'd agents in parallel (≤5 on
this Pi, 2 per workflow), adversarially verifies with fresh-context agents, integrates, commits
per logical unit, and posts a short status after each. Update memory when something durable is
learned. If the operator adds an idea mid-turn, acknowledge in one line, slot it, continue.
