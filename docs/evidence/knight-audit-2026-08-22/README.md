# Knight type-hardening surface audit — 2026-08-22

Six parallel readers swept every motion surface (calibration page, unified page,
pose editor, Animation Studio, dashboards/Body Map), every drive path
(hardwareService dispatch, scene executor, pose engine, head tracking, jaw
realtime, servo daemon), the type-agreement machinery (overrides API, profile
rebuild, model registry, schemas), and test coverage. Nine findings went through
adversarial verification (8 confirmed, 1 refuted); 45 more are recorded
unverified in `findings-wf_bfc7aab3-cab.json` — treat those as leads with exact
file:line evidence, not settled fact.

## Fixed the same night (see git log for v10.4.0 commits of 2026-08-22)

- Sweep test paced by real travel time (was: all six legs fired instantly).
- Servo daemon physical-faults refusal now reaches the caller as an error
  (was: `{'status':'ok'}` for a pulse that never left the chip — the magic-box
  hour). Denials no longer fall back to one-shot wrappers.
- `knight-finish.sh` no longer asserts the head's channel (box owns ch11).
- Pose editor + Animation Studio angle controls speak the part's real range
  (multi-turn 0-900); safety-window merge can no longer invert the slider.
- Dispatch treats a declared non-180 `rotationRangeDeg` as multi-turn even when
  the `servoType` string is lost; batch path diverts continuous servos away
  from held positional pulses and honors model defaults in type detection.
- `characterId` threaded through calibration router drives, click-to-track,
  head-tracking type detection, and the parts test route's store reads.
- servoType/rotationRangeDeg/channel writer validation; `multi-turn` added to
  every UI select that writes servoType.
- head-animation system test whitelist accepts `multi-turn`.

## Deliberately deferred (still open — check the findings file before touching)

- Unified legacy page (`/setup/calibration/unified`): PCA Test button spins
  continuous servos, fabricated client-side default profiles, dead
  `continuous_servo` gate hiding Home/confidence.
- Learn Movement (openloop motion-model training) broken both ends on the main
  page (never renders; posts a body the API rejects).
- Pose/scene engines: LED `turnOn/turnOff` dispatch mismatch, linear-actuator
  position-0-1 target missing, `move_actuator` drops `position`, sensor steps
  read the legacy root parts.json, part-63 `move_servo` fallback.
- Jaw realtime: no refusal of uncalibrated servos (0-180 fallback), no
  multi-turn scale seam (multi-turn parts should be refused as jaw servos).
- Body Map nudges ride the calibrationOverride nudge route (runtime paths must
  never override); uncalibrated multi-turn drivable full-range via goto {p}
  (may be intentional under the 2026-08-20 no-software-limits ruling).
- Un-stamping Calibrated re-arms placeholder rebuild writers that can overwrite
  retired measured bounds; measured-profile kind disagreements are silent.
- Studio preset dropdown indexes profiles by bare partId (store keys are
  `characterId:partId`); hyphenated `linear-actuator` type invisible to the
  calibration machinery.
