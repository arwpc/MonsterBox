# Follow Orders — Voice-Commanded Part Control

Spoken commands drive hardware: "raise your arm", "open the box", "close your
coffin door". Works for ANY character and every part type that moves or makes
sound (servo, continuous servo, linear actuator, motor, stepper, light, LED,
speaker), plus named poses and validated gesture recipes.

## Design in one paragraph

Transcripts come from the existing STT stack; a **deterministic local matcher**
(no LLM) resolves each phrase against the character's vocabulary; execution goes
only through the existing bounds-safe motion layer. The ElevenLabs persona/agent
configuration is **never modified** — the gesture client-tool experiment proved
that handing the LLM a vocabulary of action ids leaks them into speech
(`config/elevenlabs/gesture/README.md`), so matching happens entirely on the
MonsterBox side.

## Architecture

```
standalone listener (serverSTTListener      orderMatcher.matchOrder()        followOrdersExecutor
session with onUtterance callback)  ──►     ladder: stop → commands[] →  ──► stop  → per-part stop + releaseAll
                                            poses → gestures →               pose  → poseEngine.executePose
conversation-session taps                   parts (token overlap)            gest  → gestureEngine.performGesture
(committed_transcript + user_transcript) ─► gated by followOrders.enabled    part  → getEffectiveWindow → controlPart
```

- `services/followOrders/followOrdersSuperPowerService.js` — config in
  `data/character-{id}/super-powers.json` under `followOrders` (missing key =
  disabled). Written under the shared file lock; short cache (≤5 s) so fleet
  disable takes effect before the next utterance.
- `services/followOrders/orderMatcher.js` — pure function, unit-tested with zero
  I/O. Resolution ladder: STOP phrases (always honored) → operator-defined
  `commands[]` → pose names/tags → gesture intents → part name+verb with
  character-flavor stripping. Ambiguous part names (five identical "T Act"
  actuators) refuse with candidates; verb/type mismatches ("turn on the elbow")
  refuse with a reason.
- `services/followOrders/followOrdersExecutor.js` — all safety here: broken
  parts skipped (autonomous-caller convention), `excludeFromAutomatedTests`
  parts refused (multi-turn neck, fused rail), uncalibrated servos refused, all
  motion clamped into calibrated windows and duration-capped, motors get a
  guaranteed stop timer, `calibrationOverride` never set. Servo claims at
  `PRIORITY.GESTURE_SEMANTIC` (scenes still preempt).
- `services/followOrders/followOrdersListener.js` — transcripts in, orders out.
  Keeps a 50-entry order history ring buffer (the operator's debug window and
  the crosstest's evidence stream).

## Microphone ownership (ReSpeaker rule)

One capture process per device. The standalone listener owns the mic while
idle; when a conversation session starts it **yields** and orders flow from the
conversation's own transcripts; when the session ends the standalone listener
resumes automatically.

## Body awareness

`services/bodyStateService.js` tracks what each part was last **commanded** to
do (belief, not measurement — no encoders) and feeds live agent conversations
via ElevenLabs `contextual_update` socket messages (verified current API; no
persona change; non-interrupting; `context_id` supersedes stale state).
Conversation start delivers a body summary; changes stream in debounced and
event-framed: *"You just obeyed a spoken order: your right arm is now raised."*
The order utterance itself still reaches the agent as normal speech, so the
character reacts in character to being commanded — that is intended behavior.

## Operating it

- **Setup page**: `/setup/follow-orders` — enable, address-by-name, spoken
  acks/refusals, thresholds, custom commands builder, part aliases (with
  open/close inversion for backwards-mounted mechanisms), a dry-run
  "try a phrase" box, and the order history.
- **Dashboard**: Orders toggle + ON AIR badge in Monster Features (also on the
  Scare Console). Refuses honestly when a character lacks a mic or parts.
- **Fleet**: Orders button in the Fleet Command Center
  (`POST /api/orchestration/superpower/orders`). Fleet emergency stop and
  node-local panic both disarm it — a shouted command must not restart motion
  after the operator hits stop.
- **Acks**: default on ("As you command."), per-character silent option.
  Both listening paths are suppressed before the ack plays, so a character
  never obeys its own voice.

## Defaults

Always-obey (no name prefix required) per operator decision 2026-08-23;
`requireAddressByName` is the per-character knob for crowded show nights.
Spoken acks on. `minConfidence` 0.6, `cooldownMs` 2000, motion duration
default 1200 ms capped at 3000 ms (further capped by any calibration
`maxDurationMs`).

## Testing

- `npm run test:smoke` — matcher (32 cases) + body state (13) unit suites.
- `npm run test:system:follow-orders` — 21 HTTP contract tests.
- `tests/system/orchestration.test.js` — fleet fan-out with capture/restore.
- **Cross-animatronic live proof**: `scripts/follow-orders-crosstest.mjs
  --speaker <animatronicId> --listener <animatronicId> [--both]` — one
  animatronic speaks orders at another through real air, evidence bundles
  (transcript, match, execution, before/after frames from the opposing camera)
  land in `reports/follow-orders-crosstest/`, deterministic assertions run in
  the script, and an AI judge scores transcript fidelity, match correctness,
  execution honesty, and visible movement. Run from the node with fleet trust.
  Never in the automated gate.

## Honest limitations

- Body state is commanded, not measured; it resets on service restart.
- Far-field ASR will mishear — seed `addressAliases`/`partAliases` with the
  mishearings the history window shows after the first live night.
- An emergency stop persists `enabled:false`; re-arm with one fleet Orders-on.
