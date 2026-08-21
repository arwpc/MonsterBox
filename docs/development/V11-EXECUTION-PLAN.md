# v11 Execution Plan — 2026-08-20

Built from the 8-stream verified research corpus (`docs/evidence/v11-research/*.json` — every
claim carries file:line evidence; several handoff claims were REFUTED, so trust these files
over older docs). Governed by `V11-DECISIONS.md` (six dated operator rulings) and
`V11-HANDOFF.md` §2 safety constraints. Waves are ordered so no two concurrently touch the
same files; each wave ends with its own verification and a commit train.

## File-ownership rule (why the waves don't collide)

| Contended file | Owner |
|---|---|
| `views/ai-settings/tts.ejs`, `public/js/ai-settings-tts.js` | Wave 1 only |
| `services/aiConfigStore.js` | Wave 1 only |
| `services/elevenLabsWebSocketService.js`, `routes/api/elevenLabsApiRoutes.js`, `scripts/fleet-audio/earcheck.mjs` | Wave 2 only |
| `public/js/dashboard.js`, `dashboard-v2.js`, `views/conversation/showtime.ejs`, `routes/api/partsApi.js` | Wave 3 only |
| `server/calibration/*` (adapters, router, store), `controllers/motionTrackingController.js` | Wave 4 only (after Wave 0's router fix) |
| `server.js` startup-restore point | built once in Wave 4, extended in Wave 5 |
| `views/setup/calibration.ejs` | Wave 6 only |
| `scripts/deploy-to-animatronic.sh` | Wave 1 (pre-flight check) only |
| `docs/troubleshooting/KNOWN-BUGS.md`, `CLAUDE.md` | lead session only, between waves |

## Wave 0 — Safety & truth (DONE 2026-08-20, this session)

Deleted Orlok scene 106 (drove fuse-rail parts 4+5). Committed a `blockAllMotion` safety
block for Dragomir part 1 (was completely unguarded). Removed the absolute-servo calibration
profile from Orlok part 14 (a PIR motion sensor). Backed up Mina's and Dragomir's own
poses/scenes/calibration files (`ARCHIVE/own-nodes-2026-08-21/`, pushed to a rescue branch).
Resolved the part-15 "calibration eater": evidence says an operator Clear + supervised
jogging interrupted by Mina's crash, not a rogue writer — but the hunt found the single-part
`DELETE /api/calibration/:partId/profile` was character-UNscoped and silent; both fixed
(scoped like clear-all, and both delete paths now `console.warn` with prior bounds so
log-review sees destructive ops).

**Open Aaron question:** restore part 15's documented 3–169 window
(hand-measured 2026-08-19 23:45, recorded in V11-HANDOFF §3) or leave cleared for re-measure.

## Wave 1 — Voice/config integrity

Per V11-DECISIONS #2 and #5. Remove the TTS tuning sliders; `/ai-settings/tts` shows
identity read-only + agent deep link. `mergeJson` refuses null/empty `voice_id`;
`POST /tts/config` requires an explicit `characterId`; accepted changes warn-logged with
before/after. Delete `speed` everywhere (6 data files, store clamps, voice-identity test,
log-review comparison). `ai-audio.test.js` snapshots raw file bytes, not the GET view.
Gate learns to assert stability/similarity/voice_id against `config/elevenlabs/agents/`
snapshots; log-review compares against snapshots too (committed drift no longer goes blind).
Deploy gains a pre-flight refusal when any node's ai-config differs from canonical.
ElevenLabs side (MCP verified live): re-snapshot all six agents first, then Mina's singing
excision (SONG paragraph, "sings" tag, `KB_Mina_Songs.txt` — acceptance: no Romanian accent,
whispers, no singing), patch the three offline agents' measured stability values.
PumpkinHead's prompt contradiction was REFUTED — snapshot refresh only.

## Wave 2 — Canonical STT

Per V11-DECISIONS #1. Delete the caller-less `/stt/listen/*` trio + orphan
`conversationService` converse path; note the endpoint-preservation carve-out in CLAUDE.md.
The realtime Scribe implementation is CURRENT (verified against live ElevenLabs) — this is
consolidation, not upgrade: dead-code sweep (`_scheduleReconnect`, stale header/status
endpoint), declare the canonical boundary in the service header, reroute `earcheck.mjs`
capture through the app's own `POST /api/elevenlabs/stt/testSample` (PyAudio ladder), and
teach it mute + mixer awareness (2026-08-20 lesson: a −20 dB DAC reads as a dead node).
Proof: cross-node transcript (the method already demonstrated 2026-08-20).

## Wave 3 — Dashboard freshness + device dropdowns

Order matters within the wave: (1) fix `renderSpeakerSelect`'s forced reset to `speakers[0]`
FIRST or the refresh timer stomps the operator's choice every cycle; (2) wire
`refreshPageState()` into the existing 10 s character poll (complete it: motion sensor +
mute) — no new intervals; (3) honor POST responses (jaw/mute/lurk per-feature results,
revert + toast on refusal — this is Aaron's "jaw enable doesn't deploy"); (4) capability
gating onto the chips (Mina must not offer head tracking); (5) mic identity + output level
on the showtime stage; (6) the input/output device dropdowns, persisted per-character in
`parts.json` per V11-DECISIONS #4 — which requires fixing `PUT /api/parts/:id`'s
shallow-merge + id-stringification first; (7) master-volume ceiling: API clamps to 1.0 while
canonical is 1.3 — raise to 1.5 and stop lying; (8) delete or repoint the inert
`refreshBadges` poll. New-code style: `dashboard-v2.js` is ES5; `dashboard.js` is not (the
CLAUDE.md blanket claim was REFUTED — correct it). Tests: refused-toggle revert + device
persistence across reload.

## Wave 4 — Head tracking (software now, hardware proof later)

`MultiTurnServoAdapter` + `multiturn-servo` capability kind (position-scaled, pulse map
parameterized by `rotationRangeDeg`; no `unitsPerSec` — that model is wrong for multi-turn).
`cameraMount: 'head' | 'fixed'` in super-powers (+ schema enum — verify the hand-written
validator supports enum). Kind-dispatch where `servoKind` is currently read and discarded.
Three found defects: `detectServoType()` missing characterId; enable paths missing
characterId (kills two resolver-allowlist entries); `centerDeg` default 90-vs-0 split.
Boot re-arm per V11-DECISIONS #3: opt-in `autoArmOnBoot` flag, built on ONE shared
startup-restore point in `server.js` (mute-archetype). Hardware proof BLOCKED on: part 15
re-measure (Aaron) and Dragomir part-1 supervised calibration (Aaron, now safety-blocked
until then).

## Wave 5 — Persistence sweep

Ten RAM-only toggles confirmed (PIR watcher, idle loop, ElevenLabs headless sessions,
randomPose, autoAI, parrot, lurk master, movement-config `idle.enabled` never read, plus the
head-tracking armed bit handled in Wave 4). Motion features get the opt-in flag; non-motion
restore automatically. All hang off Wave 4's single startup-restore point.

## Wave 6 — Ghost/dead settings + USB identity surface

Remaining after v10.4 (several §5 claims REFUTED — webcam resolution/fps is wired,
listen-in volume is live): delete webcam Edit-Part `width`/`height` dead controls and
orphan `deviceIndex` keys; stop `startStream` echoing an unapplied `resolution`;
make `#speakerPart` authoritative or remove it; per-speaker volume/bass/treble ghosts →
remove (operator default); strip orphan stt-config keys fleet-wide, then tighten schemas
(`additionalProperties`). USB VID:PID: backend landed in v10.4 (5 of 9 models carry
signatures) — build the matcher + MATCH / NOT-PRESENT / DIFFERENT-MODEL badge; fleet stream
reads the 4 missing signatures off live hardware.

## Wave 7 — DEFERRED: poses/scenes rebuild

Out of v11 per V11-DECISIONS #6 ("when the hardware is all finally set in stone").
Pre-work already banked: garbage inventories per node (research corpus), rollback tag +
ARCHIVE + own-node backups, tightened poses-schema sketch, ready-to-run probe spec.
Reality check recorded: current §3 truth is ONE calibrated movable part per character
(Orlok jaw 33–98, Mina jaw 22–91, Dragomir jaw 97–151).

## Wave 8 — Verify + ship v11.0.0

Gate + pact green; browser suite via the ONE working invocation; deploy fleet-wide with the
new pre-flight; `/fleet-verify` symbol greps on every node; ear-check all live nodes
(record + transcribe); KNOWN-BUGS reconciled by /log-review; README/CHANGELOG/memory;
bump `package.json` to 11.0.0; tag and push.

## Standing blockers on Aaron

- Part 15: restore documented 3–169 or re-measure (Wave 0 question).
- Dragomir part-1 supervised calibration (Wave 4 hardware proof; safety block until then).
- Orlok ch4/ch5 dedicated 10 A circuits (unchanged; parts stay blocked).
- Mina node hardware instability (unexplained power-loss events 2026-08-20).
- `gh auth login` + claude.ai connector re-auth (GitHub MCP still unauthenticated).
