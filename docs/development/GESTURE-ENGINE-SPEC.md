# Conversation-Driven Gesture Engine — Specification

**Status:** Proposed (specification only — no implementation in this document's commit)
**Scope:** All five characters, strictly limited to hardware each character has TODAY.
**Coordination:** A concurrent work session is making significant updates to the
ElevenLabs integration. Section 10 defines the contract boundaries so the two efforts
compose instead of collide. Nothing in this spec modifies existing services; it defines
one new handler, one new data file per character, and ElevenLabs-side configuration.

---

## 1. Vision

When a character speaks, its body should already be in motion. When a guest offends
Orlok, he should turn his face away before the cold reply lands. When Mina whispers,
the coffin lid should crack open an inch. When Sir Dragomir grants a knighthood, the
magic box should open as he says the words.

**Alive. (Or living dead.)**

### Anti-goals — the 1950s-robot failure modes this spec exists to prevent

1. **Sequential single-motor motion.** One servo moves, stops; the next moves, stops.
   Nothing alive moves one joint at a time. Every gesture in this spec is a composite:
   multiple parts moving on overlapping timelines.
2. **Freeze-while-talking.** A figure that locks solid the moment it speaks reads as a
   loudspeaker in a costume. Speech and motion must overlap.
3. **Symmetric, metronomic timing.** Equal-duration in/out moves at constant velocity
   read as mechanical. Organic motion eases in, eases out, overshoots slightly, settles.
4. **Teleporting between poses.** Instant part jumps break the illusion permanently.
   All transitions go through the transition engine's velocity-eased curves.
5. **The dead stop.** Between gestures the figure must never be perfectly still while a
   conversation is active — the ambient layer (Section 3, L1) guarantees a floor of life.

### Principles of lifelike motion (normative)

- **Concurrency is mandatory.** A gesture that moves only one part is a calibration
  exercise, not a gesture. Minimum two parts (or one part + one light/audio element)
  per gesture, on overlapping timelines.
- **Asymmetric onsets.** The head leads, the body follows (80–250 ms stagger). Reaction
  gestures start fast and settle slow; deliberate gestures start slow and land firm.
- **Ease everything.** Use `transitionEngine` easing (`ease_in_out` default; `ease_out`
  for reactions; overshoot-and-settle for arrivals). Never linear, never instant.
- **Motion leads speech.** Mirror the jaw system's `audioLeadTimeMs` insight: begin the
  gesture at (or just before) the sentence it accompanies. A gesture that arrives after
  its line reads as broken.
- **Return is part of the gesture.** Every gesture defines its return path (usually to
  the ambient layer, not to a hard "neutral"), with a slower, lazier curve than the
  onset. Snapping back to neutral is a 1950s tell.
- **Speech never waits for motion.** Motion is fire-and-forget from the conversation's
  point of view. A failed or slow gesture must never delay or block TTS.

---

## 2. What exists today (build on, do not duplicate)

| Capability | Where | Notes |
|---|---|---|
| Jaw ↔ speech sync | `services/jawAnimationSuperPowerService.js` | Audio-envelope driven, `audioLeadTimeMs` |
| Head ↔ person tracking | head-tracking superpower | Pan servo follows guests via webcam |
| Eased motion | `services/movement/transitionEngine.js` | Velocity-based easing incl. overshoot+smoothstep settle |
| Per-servo arbitration | `services/movement/priorityManager.js` | Advisory claims, priority preemption |
| Concurrent multi-part execution | `services/poses/poseEngine.js` | Servo batch + other parts via `Promise.all` |
| Idle ambient motion | `services/movement/idleLoopService.js` | Idle loops per character |
| Pose storage | `data/character-{id}/poses.json` | Named part-position sets |
| Scripted choreography | scene executor `concurrent` flag | `sayThis` + pose steps simultaneously |

The gesture engine is a thin coordination layer over these — it introduces **no new
motion primitives** and **no new hardware**.

---

## 3. Architecture — four motion layers + arbitration

```
 L3  Semantic gestures      ← ElevenLabs agent tool calls ("menacing_lean")
 L2  State choreography     ← conversation lifecycle (start/listening/speaking/end)
 L1  Ambient life           ← low-amplitude motion floor during active conversation
 L0  Jaw sync + head track  ← existing systems, untouched
 ─────────────────────────────────────────────────────────────
     priorityManager        ← arbitrates every servo claim across layers
     transitionEngine       ← eases every motion from every layer
     safety layer           ← clamps everything (Section 8)
```

- **L0 (existing, untouched):** jaw animation and head tracking keep their current
  ownership and behavior.
- **L1 Ambient life:** while a conversation is active, a per-character low-amplitude
  loop (breathing-scale movements: ±2–4° drifts on non-critical servos, slow light
  pulses) runs at the LOWEST priority. Any higher layer preempts it per-servo; it
  resumes on release. This is the "never a dead stop" guarantee. Implementation can
  reuse `idleLoopService` patterns with a conversation-scoped profile.
- **L2 State choreography:** fixed, small gesture set bound to conversation lifecycle
  events the WebSocket bridge already observes (conversation started, user speaking,
  agent speaking, conversation ended). No LLM involvement; totally deterministic.
- **L3 Semantic gestures:** the agent's LLM calls a client tool (Section 5) naming a
  gesture from that character's vocabulary; the handler executes the composite recipe.
  This is where "turn away when offended" and "bow to the Queen" live.

Priority order (using `priorityManager` levels): safety/e-stop > L3 semantic >
L2 state > head-tracking > L1 ambient > idle. Jaw servo is claimed by L0 whenever
speech is active and is **excluded** from all gesture recipes during speech.

---

## 4. Gesture recipe schema

One new file per character: `data/character-{id}/gestures.json`. Schema (versioned):

```json
{
  "version": 1,
  "gestures": [
    {
      "id": "turn_away_dismissive",
      "label": "Turn away, dismissive",
      "intent": "offense taken; contempt; ending a topic",
      "steps": [
        { "partId": "15", "type": "servo", "target": 140, "delayMs": 0,
          "durationMs": 900, "easing": "ease_out" },
        { "partId": "5",  "type": "servo", "target": 30,  "delayMs": 150,
          "durationMs": 1100, "easing": "ease_in_out" }
      ],
      "holdMs": 1200,
      "return": { "mode": "ambient", "durationMs": 1800, "easing": "ease_in_out" },
      "cooldownMs": 6000,
      "maxPerConversation": 3
    }
  ]
}
```

Rules:
- `steps` run CONCURRENTLY, offset by `delayMs` — the schema makes overlap the default
  and sequential motion impossible to express accidentally.
- `target` values must fall inside the part's calibrated bounds
  (`data/calibration_profiles.json`); the loader rejects any recipe that exceeds them.
  Where a named pose already exists, a step may reference it (`"pose": "Menacing Lean"`)
  instead of raw targets — preferred, since poses are pose-author-validated.
- `return.mode: "ambient"` hands the parts back to L1 (never a hard snap to neutral).
- `cooldownMs` and `maxPerConversation` prevent gesture spam (a character that does the
  same move every turn reads as a toy).
- Lights participate as steps (`"type": "light", "level": 0–100, "rampMs": …`) —
  Hand of Azura and Burning Rose are gesture instruments, not just props.

---

## 5. ElevenLabs side (configuration only)

### 5.1 Client tool

Each agent gets one client tool, fire-and-forget (no response expected — motion never
blocks speech):

```json
{
  "name": "gesture",
  "description": "Perform a physical gesture with your animatronic body. Use at most one per reply, only when the moment calls for it.",
  "parameters": { "gesture_id": "one of this character's gesture vocabulary" }
}
```

Until the MonsterBox handler ships, these tool calls are harmless no-ops — the config
can be deployed ahead of the code.

### 5.2 "# Body" prompt section

Each agent's prompt gains a short section mapping intent → gesture, in-voice. Example
(Orlok):

```
# Body
You have a body. Use it — one gesture per reply at most, chosen for the moment:
- offense, contempt: gesture(turn_away_dismissive)
- threat, warning: gesture(menacing_lean)
- speaking of Mina or the depths: gesture(slow_scan_down)
- granting magic, blessing a child: gesture(hand_glow)
- receiving a known guest: gesture(courtly_bow) — deeper station, deeper bow
- beckoning someone closer: gesture(beckon_reach)
- the kiss, when it is earned: gesture(kiss_bow)
Never announce the gesture. The body speaks; the voice does not narrate it.
```

### 5.3 Timing model

Tool calls are emitted during LLM generation, i.e. at or before the TTS of the
accompanying sentence begins streaming — the gesture handler fires immediately on
receipt, which lands motion at sentence-start: exactly the "motion leads speech"
principle. Word-level sync is explicitly out of scope for v1 (would require TTS
timestamp plumbing; sentence-level reads natural on hardware of this scale).

---

## 6. MonsterBox side (one new handler — the only new code)

`services/gestureEngineService.js` (new file) + a small hook where the ElevenLabs
WebSocket bridge dispatches client-tool events:

1. Receive `gesture` tool call `{gesture_id}` for the active character.
2. Load that character's `gestures.json` (cached; hot-reload on file change is nice-to-have).
3. Validate: gesture exists, cooldown clear, conversation cap not hit → else silent no-op.
4. Claim needed servos via `priorityManager` at L3 priority (skip parts denied by a
   higher-priority owner — partial execution is fine and lifelike; jaw is never claimed
   during speech).
5. Execute steps concurrently with `transitionEngine` easing; lights via existing
   hardware service calls.
6. After `holdMs`, run the return curve, release claims to L1/ambient.
7. Log one line per gesture (SD-card-friendly: no high-frequency logging).

Failure policy: any error → release claims, log once, do nothing else. **The
conversation must be bulletproof against the body.**

---

## 7. Per-character vocabularies (existing hardware ONLY)

Parts verified against `data/character-{id}/parts.json` on 2026-08-16. No new physical
functionality is assumed anywhere below.

### 7.1 Orlok (character-3) — the full instrument

Hardware: head pan ch0 · jaw ch3 · elbow ch4 · forearm ch5 · Right Arm actuator ·
Left Arm actuator · Bow-at-Waist actuator · Hand of Azura relay light · PIR · webcam.
Existing poses: Neutral Standing, Glance Left/Right, Arm Raise Slight, Forearm Twist,
Menacing Lean, Slow Scan, Hand Glow.

| Gesture | Composite recipe (concurrent parts) | Fires when |
|---|---|---|
| `turn_away_dismissive` | head sweeps away (fast-out) + slight arm retract (150 ms later) + hold + slow return | contempt, "Mind your place" |
| `menacing_lean` | Bow actuator partial-extend + head levels onto guest + elbow raises slightly, staggered | threats, `[slow]` warnings |
| `slow_scan_down` | head pans down-arc slowly + Hand of Azura dims | Mina, the depths, `[whispers]` |
| `hand_glow` | Hand of Azura ramps up + forearm twist toward guest (light leads, arm +200 ms) | granting magic, blessing a child |
| `courtly_bow` | Bow actuator extend (depth scaled by rank: Queen > Master > Princess > guests) + head dips + arms drift back | known-guest recognition |
| `beckon_reach` | Right Arm extends toward road + head tilts + elbow eases up | BECKONING lines |
| `kiss_bow` | HALF bow (conservative extent) + head dip + jaw handled by speech audio ("Mwah" / kiss sound in TTS) + slow rise | the kiss, when earned |
| `recoil` | head back-arc + both arm actuators retract a step + Hand of Azura flickers | being startled, holy names, dawn talk |

**Safety notes binding on all Orlok recipes:** ch4 elbow and ch5 forearm are NEVER in
the same recipe step-window (serialization rule); Bow-at-Waist never retracts below its
current calibrated min and all bows use partial extents; `kiss_bow` stops well short of
guest space — the sound completes what the motion suggests.

### 7.2 Mina (character-2) — the coffin is the instrument

Hardware: jaw ch4 · neck ch8 · eye ch11 · Coffin Door actuator · Burning Rose light ·
laser light · PIR · webcam. Existing poses: none yet (pose-author work item — see 9.1).

| Gesture | Composite recipe | Fires when |
|---|---|---|
| `lid_crack` | Coffin Door opens a small calibrated crack + Burning Rose ramps faint + eye toward the voice | first trust, `[whispers]` secrets |
| `lid_close_soft` | Door eases shut + rose fades — timed so her voice continues through the closing | fear (Pumpkinhead talk), retreat |
| `listen_turn` | neck eases toward guest + eye leads by 120 ms (eyes move first — the single most lifelike trick available) | guest starts speaking |
| `dream_gift` | eye drifts up-away + rose pulses slowly + neck micro-sway | delivering an omen |
| `trance` | eye snaps a small arc off-target + rose flickers + neck stills DEAD for the trance words, then `listen_turn` return | the once-per-conversation trance |
| `rose_for_thomas` | Burning Rose swells bright and holds + eye down | Thomas, the letter |
| `choose_morning` | neck lifts + eye up + rose steady warm | "I choose the morning" closers |

Note: `trance` deliberately uses TOTAL stillness as the gesture — the exception that
proves the ambient rule: stillness is only alive when it is sudden, chosen, and brief.

### 7.3 Sir Dragomir (character-4) — economy of a soldier

Hardware: continuous-rotation head ch0 (**cannot hold absolute position** — timed
sweeps only) · jaw ch1 · Magic Box ch3 · webcam. Existing poses: Neutral, Mouth Open,
Magic Box Open, All Center.

| Gesture | Composite recipe | Fires when |
|---|---|---|
| `survey_road` | timed head sweep one direction, pause, sweep back (asymmetric durations) | "the road behind you", scanning talk |
| `head_snap_alert` | short sharp timed sweep toward guest + jaw sets closed | challenges, "Stai!" |
| `look_away_disdain` | slow timed sweep away + hold + very slow return | mockery received |
| `magic_box_reveal` | Magic Box opens as the knighting/deputizing words land + closes 3 s later | deputizing, rank ceremonies, "the watch has something for you" |
| `nod_commend` | two small timed head sweeps down-up (calibrated pulse pairs) | debrief commendations, "Bine." |

Constraint honored: every head move is expressed as calibrated timed runs
(continuous servo), defined and bounded in the recipe file — never position targets.
The Magic Box is his single theatrical flourish; the spec reserves it for ceremony so
it stays special.

### 7.4 PumpkinHead (character-1) — verify, then choreograph

Hardware (registry contains test artifacts — see 9.2): Wiper Motor · elbow ch15 ·
five "T Act" MDD10A actuators (23–27) · T Light · PIR · webcam. Existing poses: none.

Assuming post-verification: the wiper motor is rhythmic/continuous (sway, lurch) and
the T-actuators move body/vine elements.

| Gesture | Composite recipe | Fires when |
|---|---|---|
| `lurch_at` | wiper motor burst + elbow thrust + T Light flares — all inside 400 ms | the pounce, "BOO" moments (never for the 8-and-under crowd) |
| `vine_writhe` | 2–3 T-actuators run short offset strokes (staggered 200 ms apart — the offsets ARE the organic look) + light flicker | hunt talk, "the garden is hungry" |
| `carnival_sway` | wiper motor slow rhythm + light warm pulse | KID SPOOK MODE base layer |
| `count_the_souls` | elbow taps a slow beat + light dims per "count" | ledger talk with adults |

### 7.5 Groundbreaker (character-5) — one motor, maximum conviction

Hardware: one motor · webcam · speaker · mic. He is a 10×5 ft lit figure on the
roofline; his body IS the roof presence.

| Gesture | Composite recipe | Fires when |
|---|---|---|
| `roof_rumble` | motor run, long slow burst | territorial shouts, "THIS ROOF MINE" |
| `lean_over` | motor timed run one direction + hold + return (whatever axis the motor drives — verify on hardware) | looking down at a specific small one |
| `victory_shake` | two short motor bursts | someone comes down from the street (Street Duty WIN) |

With one motor, TIMING variety (burst length, double-taps, long slow runs) provides
the vocabulary. His speech carries the rest — by design he is 90% voice, 10% mass,
and the mass only has to move a little to be terrifying from the roofline.

---

## 8. Safety invariants (bind every layer)

1. Gestures execute ONLY through calibrated bounds — pose references preferred, raw
   targets validated against `data/calibration_profiles.json` at load time.
2. Orlok ch4/ch5 never commanded concurrently (serialization enforced at recipe-load:
   loader REJECTS any Orlok recipe with overlapping ch4/ch5 step windows).
3. Bow-at-Waist: never below current calibrated min; partial extents only; slow speeds.
4. Motion toward guest space (bows, reaches, lurches): conservative extents, `ease_out`
   arrivals, and stop margins — the audio completes the illusion, never the proximity.
5. Emergency stop and the orchestration mute/stop endpoints preempt everything
   (existing safety layer priority).
6. Kid-mode: gestures flagged `"kidSafe": false` (e.g. `lurch_at`) are suppressed when
   the agent is in a kid interaction. v1 heuristic: the prompt instructs the character
   itself never to call them with small children present (the same trust we already
   extend for language); a vision-based child-detection gate is future work.
7. SD-card discipline: no per-tick logging; one line per gesture.

---

## 9. Work items this spec creates

### 9.1 Pose/gesture authoring (pose-author agent, on each node's hardware)
- Mina: author the base pose set + calibrate lid-crack extent, neck/eye ranges.
- PumpkinHead: after registry cleanup (9.2), author poses and safe actuator strokes.
- Dragomir: calibrate timed-sweep durations for the continuous head (per-direction ms
  at fixed speed → effective angles); verify Magic Box travel.
- Groundbreaker: characterize what the motor physically drives, safe burst durations.
- Orlok: extend the existing 8 poses with `courtly_bow` depths and `beckon_reach`.

### 9.2 PumpkinHead parts registry cleanup (data hygiene, not code)
`data/character-1/parts.json` contains obvious test artifacts (five duplicate
"Auto Mic" entries, parts named "Test Motor/Actuator BTS7960", a servo with
`channel: null`). Before gesture work, verify which parts physically exist and
disable/remove the rest. Assigned ideally to hardware-diagnostician on that node.

### 9.3 New code (small, additive — for whichever session takes it)
- `services/gestureEngineService.js` (Section 6)
- Client-tool event hook in the ElevenLabs WebSocket bridge (a few lines: route
  `gesture` tool calls to the service)
- Loader validation (bounds check, ch4/ch5 overlap rejection)
- L1 ambient conversation profile (reuse idleLoopService patterns)
- L2 lifecycle bindings (conversation start/end/speaking/listening → fixed gestures)

### 9.4 ElevenLabs configuration (can be applied as soon as the judge run completes)
- `gesture` client tool per agent (fire-and-forget)
- `# Body` prompt section per agent with that character's vocabulary
- TTS→STT verification of any new non-verbal sounds (kiss, gasp, grunt) with each
  character's actual voice before they enter any prompt — same method that validated
  the breath tags on 2026-08-15.

---

## 10. Coordination contract with the concurrent ElevenLabs session

Another session is actively updating the ElevenLabs integration. To compose safely:

1. **This spec's ElevenLabs changes are additive and namespaced:** one new client tool
   named `gesture`, one new prompt section headed exactly `# Body`. Nothing else in
   any agent's prompt or config belongs to this feature.
2. **Prompt edits must be surgical** — insert/replace only the `# Body` section (anchor
   on the heading), never wholesale prompt rewrites, so concurrent prompt work is
   never clobbered. Fetch-fresh-before-write; re-fetch and re-apply on conflict.
3. **The WebSocket bridge hook must be a dispatch registration**, not an edit to
   message-handling internals — whatever event-dispatch shape the concurrent session
   lands, the gesture engine subscribes to client-tool events through it.
4. **Feature flag:** the handler no-ops unless `data/character-{id}/gestures.json`
   exists — deploying config before code, or code before recipes, is always safe.
5. Agent config snapshots before every change (pattern established:
   `~/elevenlabs-backups-<date>/`).

---

## 11. Acceptance criteria ("does it look alive?")

1. During any agent reply ≥2 sentences, at least two distinct parts (or one part +
   one light) are in motion at some overlapping moment — verified by motion logs.
2. No gesture ever plays back as: single part moves → stops → next part moves.
3. No visible snap-to-neutral: every return is eased and lands in ambient motion.
4. Speech latency with gestures enabled is within 50 ms of speech latency without
   (fire-and-forget verified under load).
5. A gesture failure (unplugged part, denied claim) produces zero conversational
   artifacts — the character keeps talking as if nothing happened.
6. The judge-panel personas (scripts/halloween-judges) re-run against gesture-enabled
   characters score equal or better on every criterion — regression gate.
7. The five-year-old test: a parent watching the mom-persona scenario live says some
   version of "okay, that thing is alive." This one is measured on Halloween.
