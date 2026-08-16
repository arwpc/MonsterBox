# v9.0 Retrospective & Roadmap

Six specialists worked the v9.0 build — hardware, Python layer, voice/AI, poses,
security, docs — plus a test runner. Each was asked, at the end, two questions:
*how could you have performed better?* and *how should your part of MonsterBox be
improved?*, with a specific brief on interface and UX.

This is the consolidated answer. It is a working document: **✅ DONE** marks what
shipped in v9.0.0, everything else is a proposal with a priority.

---

## 1. How the team failed, and the fixes that generalize

Six independent retrospectives converged on the same three failure modes. That
convergence is the most useful signal in this document, because it means these
are properties of the work, not of any one agent.

### 1.1 Measuring in the units of the sensor instead of the units of the constraint

The voice specialist proved jaw motion with *135 register transitions vs 0 at
rest* and called it healthy. The number was real. But the constraint is written
in degrees, and converting would have shown the jaw sweeping 0–180° on a part
whose hand-set markers are 63–131 — the exact hardware-damage bug "discovered"
two rounds later, on a path that had already been certified green.

> **Rule: convert every measurement into the units of the limit before claiming health.**

### 1.2 Trusting an instrument that was never validated

The hardware diagnostician concluded the elbow was silent and therefore probably
dead. Then calibrated the microphone against known ground truth and found it
could not hear a servo that provably moved — the instrument, not the servo, was
the problem. The same agent's first I²C sampler read the wrong registers and
fabricated a confident "0 transitions." The voice specialist's first jaw tracer
did the same thing.

Three instruments, three failures, one root cause: a noise floor feels like
validation and isn't.

> **Rule: every instrument needs a positive control (something you know moved) and a
> negative control (something you know didn't) before it may produce evidence. If a
> measurement confirms the story you were handed, distrust the measurement first.**

### 1.3 Grep results published as findings

The docs scribe listed five `profile.bounds` readers as having "the same latent
bug" on the strength of a pattern match. Two of them were benign — a placeholder
carries exactly 0/180, which is identical to the fallback those two sites already
used. Reading three lines would have shown it.

> **Rule: a grep result is a to-do list, not a finding. If a claim names a file and a
> line, someone must have opened that line.**

### 1.4 Reaching for "report it" when the fix was smaller than the report

The Python specialist found `services/hardwareService/motor.js` — an unreferenced
module with a friendly API that would drive a GPIO pin derived from a *speed*
value — and wrote a paragraph about it, leaving the trap armed. Deleting the file
or making it throw was three lines. Conservatism should protect working behavior,
not a live hazard in dead code. ✅ **DONE** — both traps now throw.

### 1.5 Process changes worth adopting

| Change | Why |
|---|---|
| **Evidence class on every claim** — `code-read` / `measured` / `reported` / `inferred` | Several reports relayed another agent's numbers in the passive voice, so a reader cannot tell which came from an instrument |
| **Cheap-certain checks before expensive-uncertain ones** | Lamp poses (90 seconds, GPIO readback, near-zero risk) were left untested while eight actuations were spent on a fragile fuse that could not be observed at all |
| **Establish observability before actuation** | Especially on hardware with a failure history — actuations on a fragile rail are a budget |
| **Test the parser on one sample before the timed capture** | A wrong `awk` field silently discarded the only GPIO evidence in a run |
| **Say "unproven" early and often** | The most valuable single output of the hardware round was *retracting* evidence |

---

## 2. Product roadmap

Priorities are the specialists'. `[M]` must-have · `[H]` high-value · `[N]` nice-to-have.

### 2.1 Hardware & safety

The through-line: **nothing in this system closes the loop.** `success` means the
I²C write returned, or the process exited 0.

- `[M]` **Per-rail current sensing (INA219/INA260).** A few dollars, and it answers
  nearly everything this build could not: did it move, is the elbow connected, why
  does the fuse blow, is the supply sagging. An entire session was spent unable to
  distinguish "PWM present, servo dead" from "PWM present, servo fine."
- `[M]` **Stall watchdog** (depends on current sensing). `maxDurationMs` is a blind
  timer; cut PWM on sustained over-draw and mark the part faulted.
- `[M]` **Explicit channel release.** Nothing ever de-energizes a PCA9685 channel —
  ch15 held a 1924 µs pulse all session with *no part mapped to it*. Needs a
  `release` action, a startup reconciliation, and a shutdown park.
- `[M]` **A "prove this part moved" workflow** that writes a persisted verification
  record (method, evidence, confidence, timestamp). This is the structural answer
  to *API success is not proof of motion* — today that truth lives only in prose.
- `[H]` **End-stop limit switches** on open-loop actuators, and until then an
  honest position model with a growing error band that reads **Unknown** after any
  power cycle rather than showing a stale number.
- `[H]` **Deny-by-default for uncalibrated parts** — a servo with no real
  calibration should get a narrow conservative window, not 0–180.
- `[H]` **Validate power groups on load** — warn when members have different
  voltage classes, which is exactly the latent hazard on the arm rail.
- `[H]` **`tools/diagnostics/`** — a validated I²C reader, GPIO sampler, frame-diff
  and audio band analyzer, plus a harness that refuses to emit a verdict without a
  declared positive control. Roughly 40% of the hardware round went into building
  these in `/tmp` and throwing them away.
- `[H]` **One event timeline** on a monotonic clock. Proving the 405 ms
  serialization gap required hand-correlating three files.
- `[N]` **Serial-bus servos** for the fused rail — native position, load, voltage
  and temperature feedback would permanently settle both open questions.

### 2.2 Python hardware layer

- `[M]` **Generalize the daemon.** `jaw_servo_daemon.py`'s own docstring records
  ~580 ms → <1 ms per command. Someone already ran this experiment, got a 500×
  result, and applied it to one subsystem. Worse: `pca9685_control.py` caches the
  I²C bus to avoid resetting the chip per command, but the cache is per-process
  and every command is a new process — **so it caches nothing, and every servo
  move still re-initializes the chip.** The strongest argument isn't speed though:
  the fused-rail interlock is a cross-part invariant that no one-shot process can
  enforce. It exists today only as long as everyone goes through Node.
- `[M]` **One response envelope** — `{ok, op, part, data, error:{code,message,hint}, timing_ms}`.
  The layer currently returns at least four different shapes.
- `[M]` **Stdout is the result channel, one JSON object, everything else stderr.**
- `[M]` **An error taxonomy** (`E_CONFIG`, `E_BUS_IO`, `E_BUSY`, `E_SAFETY`, …). Today
  a missing pin in parts.json surfaces to the operator as
  `int() argument must be ... not 'NoneType'`.
- `[M]` **Wrappers must be able to refuse.** The bow actuator is quarantined *in
  Node*; `python3 linear_actuator_control_v2.py '{...}'` still moves it. A limit
  enforced only in the caller is a convention, not a limit.
- `[H]` **Report clamps.** Ask for 8 s, get 5 s, never be told.
- `[H]` **Opt-in simulation only.** `stepper_cli.py` simulates success when no GPIO
  backend is present — green in CI, dead in the garage.

### 2.3 Voice & AI

- `[M]` **One conversational path.** The ElevenLabs Agent and our own TTS/STT are two
  brains with different voices, latencies and jaw drivers — which is precisely why
  per-frame jaw sync existed on one and not the other.
- `[M]` **Attach the jaw driver to the audio sink, not to each caller.** The jaw bug
  happened because two call sites independently decided how to animate.
- `[M]` **A latency budget, measured and displayed.** Observed round trip was ~10–13 s.
  A guest walks past in eight.
- `[M]` **Pre-rendered response bank + TTS cache.** On Halloween the network will
  wobble. A character that degrades to atmospheric-but-not-conversational is a
  success; one that degrades to silence is a broken prop.
- `[M]` **Session lifecycle tied to presence,** not a toggle — reuse the existing
  motion detection. Fixes cost, the 600 s cap, and talking to an empty room at once.
- `[M]` **Perceptual jaw mapping.** Linear RMS→angle means conversational speech
  uses about a third of available travel. Track a rolling loudness percentile and
  map across the full calibrated range.
- `[H]` **Real barge-in.** Echo suppression currently blinds the mic for the whole
  utterance plus 2.5 s, so the character *cannot* be interrupted by construction.
- `[H]` **Version the character's voice identity as one reviewable file.**

### 2.4 Poses & animation

- `[M]` **`executePose` returns degraded/failed, not `.some()`.** ✅ **DONE** — it now
  reports success only when every part succeeded, and names the failures. This is
  what hid an actuator that never moved behind a head that did.
- `[M]` **Per-pose `jitterDeg`.** One field, one line: the same pose never lands
  twice. Highest quality-per-effort change available — eight idle positions
  repeating is what reads as "machine."
- `[M]` **Per-pose transition duration, and make easing real.** Every motion in the
  system currently happens at exactly one speed: whatever the servo does on its own.
  `transitionProfile` is decorative today.
- `[M]` **Pose health, computed at load** — `ok` / `degraded` / `blocked` from safety
  config, with `blocked` poses excluded from idle automatically.
- `[M]` **The editor must refuse to add a quarantined part** and render
  `blockReason` verbatim — that text is already written and is good.
- `[H]` **Distance-weighted next-pose selection** so the head stops behaving like a
  windshield wiper, plus micro-motion during holds.
- `[H]` **Amplitude scaling in scenes.** `executePose` already accepts a
  `providedPose` "e.g. amplitude-scaled". The hook exists and nothing uses it.
- `[H]` **Additive/offset poses** so a breathing or lean layer composes over a scene
  instead of fighting it.

### 2.5 Security & ops

The honest threat model: there is no data worth stealing here. **The asset is
motion** — the ability to make tens of kilograms of servo-driven hardware move
unexpectedly near people. Budget accordingly.

- `[M]` **Delete the password.** Every problem in this area is downstream of using
  SSH password auth: the committed literal, argv exposure, rotation burden, the
  `.env` trap, twenty scripts. Per-node ed25519 keys with `command=` forced
  commands removes all of it at once.
- `[M]` **Resolve the `.env` contradiction.** The app never loads `.env`, yet
  `.env.example` advertises `MB_ADMIN_TOKEN` and `MONSTERBOX_SSH_PASSWORD`. That is
  not a gap, it is a documented trap. Decision, not engineering.
- `[M]` **Secret scan as a gate step.** The gate is the natural home for the
  mechanism that prevents recurrence.
- `[M]` **A `/api/system/posture` self-check** reporting which variables are set
  (names and booleans only), whether TLS is self-signed, what control capabilities
  therefore exist. Converts invisible misconfiguration into visible.
- `[H]` **Pin node certificate fingerprints** — mDNS is unauthenticated and
  inter-node HTTPS uses `rejectUnauthorized: false`, so TLS currently provides
  encryption but no identity.
- `[H]` **Deploy from a git ref and record the deployed SHA.** `deploy:all` currently
  pushes the working tree, uncommitted experiments included.
- **Explicitly NOT worth doing:** secrets vault, user accounts, RBAC, WAF, IDS,
  browser-trusted TLS, signed artifacts, rate limiting. A shared admin token, SSH
  keys with forced commands, pinned node identity and a segmented network is the
  correct stopping point.
- **Worth more than all of the above:** a watchdog that parks servos on loss of
  operator contact, and a physical cutoff on anything that can pinch.

### 2.6 Docs & information architecture

- `[M]` **Four surfaces with declared audiences:** Operator Manual (Aaron, on a
  phone, on the night), Fleet Status (generated), Engineering Reference (mostly
  generated), History (CHANGELOG only). README becomes a front door, not a
  changelog five "What's New" sections deep.
- `[M]` **Generate what is derivable:** API reference from the route tree, character
  sheets from `parts.json`, the fleet table from the issue registry. All three were
  hand-corrected during this build; none should ever have been hand-written.
- `[M]` **The tracker should be data, not prose** — one record per issue, rendered
  to Markdown. The strikethrough ritual becomes a status flip, and the UI can then
  query it.
- `[M]` **Extend the version audit to `views/`, `public/js/` and `docs/`.** ✅ **DONE
  in part** — a hardcoded `'6.0.0'` fallback was found rendering in the navbar.
- `[H]` **Check that every `file:line` reference in docs still resolves.**
- `[H]` **Staleness banners** — a hardware claim older than N days should render as
  stale automatically rather than reading as current.

---

## 3. The interface

All six specialists were asked about UX independently. Their convergence was
strong enough to be treated as a specification.

### 3.1 What everyone said

| Recommendation | Asked for by |
|---|---|
| **A global control bar with an always-visible emergency stop** | all six |
| **Mobile is a first-class form factor, thumb-zone, 44px+ targets** | all six |
| **Consistency must be enforced mechanically, not by intention** | voice, docs |
| **The UI must express uncertainty honestly** | hardware, pose, docs |
| **Bounds rendered as unreachable geometry, with provenance** | hardware, pose |

✅ **DONE in v9.0.0:** global control bar with hold-to-fire stop on every page;
the responsive layer (touch targets, hover scoped to hover-capable devices,
tables that become cards, full-screen modal sheets, safe-area insets); and
`npm run audit:design-system` in the gate as a shrink-only ratchet.

### 3.2 The honesty problem — the most important idea here

The interface currently reports success for things it has not established.
`/api/calibration/:partId/goto` returns `success:true` when the I²C write lands;
there is no encoder. Part 4 accepted six commanded moves in total silence and
every one was a green success.

The proposed fix is a three-word vocabulary used product-wide, **never a bare number**:

- **Sent** — the write succeeded. *This is all `success: true` ever meant.* Grey.
- **Believed** — an open-loop estimate. Hollow marker, italic, with age.
- **Verified** — corroborated by independent measurement, with method and timestamp.

Rules that follow: no open-loop write renders as green success; button feedback is
"Command sent," not "Success"; confidence decays visibly and resets to **Unknown**
after a power cycle; and **partial failure renders as failure** — the headline
verdict is the worst outcome, not the best.

The single highest-value idea proposed by any agent, for how cheap it is:

> **"Did it move? [Yes] [No]"** after an open-loop actuation. One tap. It makes the
> operator the encoder the hardware lacks, and it generates exactly the data the
> fleet status document is currently hand-written from. Orlok's silent elbow would
> have surfaced the first time anyone poked it.

### 3.3 Shared components that would do most of the work

- `[M]` **`PartStatusChip`** — one component, used on the dashboard, in pose rows, in
  calibration and in the fleet view. Resolves in priority order: quarantined →
  faulted → uncalibrated/placeholder → never-verified → position → energized.
  Coherence comes from a shared component, not from discipline.
- `[M]` **`BoundedControl`** — radial for servos, linear for actuators, switch for
  lights. Identical bound colouring, provenance disclosure, hover readout and lock
  states everywhere. The legal arc is the only draggable region, so an unsafe angle
  cannot be authored because the geometry does not exist.
- `[M]` **One notification mechanism.** There are currently four (`alert()` ×108,
  `showAlert` ×146, `showToast` ×141, `showNotification` ×61) plus 40 native
  `confirm()` calls. Native dialogs cannot be styled, are unusable on mobile, and
  cannot show what is about to be destroyed.
- `[M]` **A `busy` state on every control.** Usually missing and it matters most
  here: a servo takes 500 ms+, an unacknowledged tap gets tapped again, and a
  double-tap double-fires a motor.

### 3.4 Destructive actions

Friction should scale with irreversibility × blast radius, not be applied
uniformly. A single `confirm()` treats rebooting one node and wiping a character
identically, and trains the operator to click through without reading.

- **Hold-to-confirm** for physical fleet actions. ✅ **DONE** for stop-everything.
- **Undo windows instead of confirmation** for creative work — soft-delete plus an
  eight-second toast beats a modal in both the common and the error case.
- **Every destructive control names its target in its own label.** "Reboot" is
  ambiguous; "Reboot Orlok" is not.
- **Never render a destructive control that will silently fail** — if SSH is
  unconfigured, the button is visibly disabled and explains why.

**Emergency stop is the exact inverse: one tap, no confirmation, no hold.** Any
friction on E-stop is a defect. Fixed position, never scrolls away, larger than
the accessibility minimum, and **one shade of red reserved for it alone** — if red
means five things, E-stop is no longer findable at a glance, and findability under
stress is its only requirement. It should latch after firing, and *re-arming* is
where hold-to-confirm belongs.

The honest caveat the UI should not obscure: a web app is not a safety device.
For anything that can pinch, the physical cutoff is the must-have.

### 3.5 Arm / disarm

Proposed by hardware and security independently, and completely missing today:
hardware pages should be **disarmed by default**. Browse, inspect and author
freely; no command reaches hardware until you deliberately arm. Armed state draws
a coloured border around the viewport and auto-disarms after inactivity.

This is standard motion-control practice, and it would have made the dead "Test"
button obvious to a human immediately.

### 3.6 Information architecture

Today `/` is not a dashboard — it renders the conversation view, and the
dashboard, conversation UI, superpowers strip and five accordions are one page
with a 2,298-line script. The navbar has three items, one of which is a Setup
dropdown containing twelve links across five unrelated jobs. `/live` — a whole
show-night dashboard — is unreachable by navigation, while configuration is one
click away. That is backwards for the moment that matters.

Proposed top level: **four verbs, not a gear.**

```
[MB]  PERFORM   BUILD   CONFIGURE   FLEET     [Orlok ▾] [● 3/5] [🔇] [STOP]
```

- **PERFORM** — show night, default on a phone. `/live` promoted here. Nothing that
  can reconfigure anything.
- **BUILD** — Animation Studio, Pose Editor, Audio, Video.
- **CONFIGURE** — grouped by subject (Character, Voice & AI, Audio, System), not by
  subsystem.
- **FLEET** — orchestration, Goblins, discovery, deploy.

Also: **Help points off-box** to GitHub Pages in a new tab. On a prop that may have
no WAN on Halloween night, the Help button is a dead end. Ship docs locally at
`/help`. `[M]`

### 3.7 Vocabulary

Half of consistent UX is one word per idea. Proposed canon: **Part** (not
component/device/hardware), **Character** for the persona and **Node** for the Pi
it runs on (the app conflates these), **Scene**, **Pose**, one name for
super-power/superpower/Monster Feature, and precise separation of **Markers**
(operator-set) / **Profile** (stored calibration) / **Safety limits** (the hard
ceiling) — three different things used interchangeably today.

### 3.8 On a phone, next to the animatronic

This is a **different product mode, not a responsive reflow.** Arm's length from
the part, one hand, possibly gloves, bad light, ambient noise.

- `[M]` **Hold-to-move deadman switch** — the part moves only while your thumb is
  down. The single best safety affordance for a phone next to a moving machine.
- `[M]` **"Verify moved"** returning one unambiguous line, including
  `INCONCLUSIVE — no sensor available`. An interface that can say "I don't know" is
  more trustworthy than one that can't.
- `[M]` **Push-to-talk** into the character's agent from the phone's own mic — makes
  solo testing possible without a second person.
- `[H]` **Haptics** for dispatch, verified motion, and safety block. Over a shop vac
  you cannot hear and can barely see; buzz is the reliable channel.
- `[H]` **Stale-data honesty** — a connection pill and "updated 40s ago" rather than
  a silently frozen number. On a diagnostics page a frozen value says "healthy"
  when it means "disconnected."
- `[N]` **Speak the result through the character's own speaker** — "elbow, eighty-nine
  point six, unverified" — so your eyes stay on the part. Practical, on-theme, and
  the most delightful idea anyone proposed.

---

## 4. If only a handful get built

1. **Current sensing on the fused rail, surfaced as a "Verify moved" button.**
   Converts the largest open question in this machine — *did it actually move?* —
   from an essay into a green check.
2. **Sent / Believed / Verified, with a shared `PartStatusChip`.** Makes the product
   honest and consistent in one change, and it is mostly front-end.
3. **Armed-by-exception plus a permanent emergency stop.** Safety and coherence
   together. ✅ Half done — the stop exists everywhere now; arming does not.
4. **Per-pose jitter and distance-weighted idle selection.** Two small changes that
   move the character from "cycling through positions" to "alive."
5. **Generalize the Python daemon.** The fuse interlock is unenforceable without it,
   and the chip re-init cache is currently a no-op.
6. **Finish the design-system migration.** The ratchet is in the gate; the floor is
   1,429 violations. Every one removed is permanent.

---

## 5. The argument for doing the interface work first

The voice specialist put it best, and it applies to the whole system:

> The reason all four of these bugs survived this long is a UX problem, not an
> engineering one: **nothing in the interface would have shown any of them.** A
> duty-cycle gauge, a jaw-travel percentage, a live interim transcript and honest
> connection dots would each have made one of these bugs obvious on day one,
> without a specialist.

That is the strongest case for prioritizing the interface — not because it looks
better, but because **a well-designed instrument panel is how a system tells you it
is lying to you.**
