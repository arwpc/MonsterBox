# Report: Calibration page part CRUD, UI half (operator complaint 2026-10-10)

Worker: calibration CRUD UI auditor (report saved for the lead). Work ran 2026-10-10 23:00 to 2026-10-11 00:10 CDT on
the live Mina node (hostname `mina`, character 2 selected, `:3100` production listener, `NODE_ENV=production`).
Operator complaint: "Confirm CRUD for all part types in Calibration and confirm all save settings for all part types,
several do not work. It keeps me from making changes to get parts working."

Deliverable: `tests/browser/calibration-part-crud.spec.js` (18 tests, durable, character-independent: it reads the
selected character from `/api/config`, names every throwaway part `QA-UI-<type>-<run>`, uses only GPIO 19-25/27 and
PCA9685 0x40 channels 5-9/12-13, answers every motion/probe route in-page through a hazard net, deletes what it
created in `afterEach`/`afterAll`, and proves `parts.json` and `calibration_profiles.json` are back to the pre-run
bytes). No application code was changed. Report only.

Re-run (the only invocation that works on a node):

```bash
MB_USE_RUNNING_SERVER=1 BASE_URL=http://localhost:3100 \
  npx playwright test tests/browser/calibration-part-crud.spec.js --reporter=list
```

Each test writes `tests/test-results/<test>/ui-events.json` (toasts, console errors, every >=400 response, every
write, hazards). Assertions after a save are soft, so one broken field does not hide the next; a test still fails.
Every failure line names the field and the control.

PRE-FIX / POST-FIX. The service was restarted at 23:29:53 CDT with the lead's calibration CRUD fixes (commit
a0388040). Runs 1-3 (23:05-23:30) saw the OLD code and are the evidence for the matrix and findings below; run 4
(23:31-23:37, complete) and run 5 (23:40, stopped after 7 tests at the coordinator's request) saw the NEW code and
are summarised in "Status after the lead's commit a0388040". Pre-fix: 16 of 18 fail. Post-fix (run 4): 14 fail,
3 pass, 1 skips itself (head_tracking is no longer offered). What still fails post-fix is listed in that section
with its cause.

## Summary

The operator is right, and the pattern is specific. Creating parts works for every type the Add Part modal offers,
and deleting works through two of the three delete controls. The breakage is concentrated in the Edit tab's Save
for the movement parts and the audio parts, and in two controls that do nothing or destroy data:

| Area | Verdict | Finding |
|---|---|---|
| Edit tab "Delete Part" | dead (ReferenceError on every click) | F1 |
| Edit tab Save for motor / linear_actuator / stepper pins, board, limits | typed values silently reverted | F2 |
| Edit tab Save for microphone / speaker | any save (even a rename) overwrites the device id with "default" | F3 |
| Model tab "Revert to Model" on a servo | erases channel / address / controllerType / servoType | F4 |
| Edit tab for a BTS7960 motor or actuator | shows MDD10A with empty pins; a limits-only save then retypes the board | F5 |
| Calibration panel "Invert Servo Direction" | marks a never-measured 0-180 span as trusted | F6 |
| Edit tab "Invert Direction" select (servo) | never saved | F7 |
| "Advanced Configuration (JSON)" | ignored for 9 of 12 types | F8 |
| Add Part modal | lacks `led_ring`; offers `head_tracking`, which the schema (and the gate) rejects | F9 |
| Markers | no editor in the page at all; API works | F10 |

What works, verified against the server after each action: Add via the modal for servo (standard and continuous,
GPIO and PCA9685), motor, linear_actuator, stepper, light, led, sensor, motion_sensor, webcam, microphone, speaker
(every field the modal offers lands as entered, including the modal's model pick, top-level `modelId`); Edit-tab
Save for servo (name, description, enabled, pin, servoType, controller, address, frequency, channel on the board
picture), light, led, led_ring (all seven geometry fields; colours from the LED Animation page survive), sensor,
motion_sensor (pin, sensitivity, window), webcam (device path, id, size, fps) and the numeric fields of microphone
and speaker; config keys the form does not own survive a save (the server deep-merges); Model assign for every type
with a registry; override Save for servo, linear_actuator, led, motion_sensor, webcam, speaker; the Calibrated
stamp on and off; the preset "Set Here" refusal when no position is known (toast, no write); Delete through the
card-footer "Remove" button and through "Delete Selected" (bulk), each with the confirm dialog naming the part.

## Matrix (pre-fix: runs 1-3 against 7dcb5cad)

Rows are part types (schema enum: `config/schemas/parts.schema.json`). Columns are what the page offers for that
type. ok = verified on the server after the action; FAIL(Fn) = finding; n/a = the page offers nothing for this
type; API = exercised through the API because the page has no control. Delete columns: E = Edit tab "Delete
Part", R = card-footer "Remove", B = bulk "Delete Selected".

| Type | Add (modal) | Edit tab Save | Model assign | Overrides | Markers | Profile saves | Delete |
|---|---|---|---|---|---|---|---|
| servo (standard, PCA9685) | ok, incl. modal model | ok except Invert Direction FAIL(F7); Model select empty (F11) | ok | save ok; Revert FAIL(F4) | API ok; no UI (F10) | invert ok but FAIL(F6); stamp on/off ok; preset refusal ok; header Invert dead (F15) | E FAIL(F1); R ok; B ok |
| servo (continuous, GPIO) | ok | ok | ok | not exercised | API ok | profile kind continuous-servo ok | R ok |
| motor | ok (no model offered, F13) | pins / duration / board FAIL(F2) | ok | not exercised | API ok | n/a | B ok |
| linear_actuator | ok (no model offered, F13) | Edit tab shows wrong board (F5); limits / board FAIL(F2) | ok | save ok | API ok | profile kind openloop-linear ok | E FAIL(F1) |
| stepper | ok, incl. modal model; stray markup (F14) | all five fields FAIL(F2) | ok | not exercised | API ok | n/a | R ok |
| light | ok (no model offered, F13) | pin / brightness ok; JSON FAIL(F8) | not exercised | not exercised | API ok | n/a | R ok |
| led | ok (no model offered, F13) | ok | ok | save ok | API ok | n/a | B ok |
| led_ring | not offered (F9); created via API | ok, colours survive | model list empty (F12) | n/a (no schema) | API ok | n/a | E FAIL(F1) |
| sensor | ok | ok | n/a (no registry) | n/a | API ok | n/a | R ok |
| motion_sensor | ok (no model offered, F13) | ok | ok | save ok | API ok | n/a | B ok |
| webcam | ok, incl. modal model; stray markup (F14) | ok | ok (modal) | save ok | API ok | n/a | E FAIL(F1) |
| microphone | ok, incl. modal model; stray markup (F14) | device id FAIL(F3); rate / gain ok | ok (modal) | not exercised | API ok | n/a | R ok |
| speaker | ok, incl. modal model; stray markup (F14) | device id FAIL(F3); volume / bass / treble ok | ok (modal) | save ok (carries the clobbered id) | API ok | n/a | B ok |
| head_tracking (modal only) | created, but type not in schema (F9) | rename ok | not exercised | n/a | API ok | n/a | E FAIL(F1) |

Not exercised, by rule: anything that moves or probes hardware (Test, Go, Home, Sweep, Nudge, Jog, Set Min, Set
Max, Clear, Clear All, Learn, motion/head tracking, webcam device probe, webcam controls, mic gain slider, STT
test). Presets cannot be added without a prior goto (the page captures the live position), so only the refusal
path was tested. The webcam part used a fake `/dev/video9`; the audio parts used fake PipeWire ids after the Scan
buttons were shown to populate the real lists.

## Findings, ranked by operator impact

### F1. Edit tab "Delete Part" does nothing (uncaught ReferenceError)

Evidence: every test that pressed `#deletePartBtn` logged `pageerror: deleteSelectedPart is not defined`; the
confirm dialog never opened; the part stayed. Run 1 and run 2, five part types.

Cause: `deleteSelectedPart` is declared at `views/setup/calibration.ejs:5063` inside the IIFE that runs from line
986 to 5180; the click handler that calls it is bound in `renderEdit` at line 5550, which lives in the global
script scope after the IIFE closed. `loadParts` got the `window.loadParts = loadParts` treatment at 4197;
`deleteSelectedPart` did not.

Fix (one line): next to `window.loadParts = loadParts;` add `window.deleteSelectedPart = deleteSelectedPart;`.
Workaround today: the "Remove" button in the device-card footer and "Delete Selected" both work.

### F2. Motor, linear actuator and stepper: pins, board and limits typed in the Edit form are reverted on Save

Evidence (run 1, motor `QA-UI-motor-*`): typed Direction 25 / PWM 27 over 23 / 24, toast "saved successfully",
server still holds 23 / 24; switching the board select to BTS7960 and saving kept `controlBoard: "MDD10A"`.
Stepper: step/dir/enable pins, microstepping and steps/rev all came back unchanged. Actuator: see F5 for the
cascade. This is the operator's "I can't change pins" complaint: Mina's Coffin Door (part 4) carries
`directionPin 17 / pwmPin 18` top-level and `controlBoard` in config, exactly the fields this bug pins in place.

Cause: `savePartChanges` reads the form, then "lets Advanced JSON override" it: `calibration.ejs:5265-5283`
(motor/actuator: controlBoard, directionPin, pwmPin, rpwm/lpwm/ren/len, maxDuration, maxExtension,
maxRetraction) and `5296-5306` (stepper: stepPin, dirPin, enablePin, microstepping, stepsPerRevolution). The
textarea it parses, `#editConfig`, is pre-filled by `renderEdit` with the part's CURRENT values
(`5505-5527`), so unless the operator also edits the JSON, the stale JSON wins over every form field it names.
`maxDuration` escaped only because the list route does not return it, so the JSON never contains it.

Fix: remove the two override blocks (the form owns those fields; the JSON card is for keys the form lacks), or
apply them only when the textarea differs from what `renderEdit` rendered (store the rendered string on the
element, e.g. `c.dataset.rendered = c.value`, and skip the block when `txt === c.dataset.rendered`).

### F3. Microphone and speaker: any Edit-tab save overwrites the device id with "default"

Evidence (run 1): microphone created with `config.deviceId = qa.fake.input.*`; the Edit tab showed "default"
in Device Name; after changing only sample rate and gain and saving, the server held `deviceId: "default"`.
Speaker identical with `audioDeviceId`. On this node that is the ReSpeaker XVF3800 ALSA sink and source: renaming
Mina's microphone part on this page would detach it from the array.

Cause: the loaders read a key nothing writes, `loadEditMicrophoneValues` `const device = config.device ||
'default'` (`calibration.ejs:6319`) and `loadEditSpeakerValues` (`6334`), while the savers write `config.deviceId`
(`5474`) and `config.audioDeviceId` (`5484`). The field is therefore always "default", and `if (micDevice)` is
always true. Also `loadEditSpeakerValues` shows 80 for a stored volume of 0 (`config.volume || 80`, `6335`).

Fix: read `config.deviceId || config.device || 'default'` for the microphone and `config.audioDeviceId ||
config.device || 'default'` for the speaker; use `??` for volume/bass/treble.

### F4. Model tab "Revert to Model" erases a servo's wiring

Evidence (run 1, `QA-UI-servo-model-*` on channel 7): after Assign + one override + Revert, the server held no
`channel`, no `controllerType`, no `address`, no `servoType`. The toast said "Overrides reverted to model
defaults". No servo model carries those keys (`data/models/servo_models.json` defaults are pulse widths,
rotationRangeDeg, servoType only), so nothing takes their place; the hardware layer then falls back to
`config.channel || 0` and `controllerType || 'gpio'`, that is, a different servo or no servo.

Cause: `OVERRIDE_SCHEMAS.servo` lists `controllerType`, `channel`, `address` as overrides
(`calibration.ejs:2103-2105`); the Revert handler posts `null` for every schema key (`2308`) and the server
deletes null-valued keys (`routes/setup/calibration.js:798`, the F9 contract).

Fix: keep the null-delete contract, but exclude wiring identity from the revert (post null only for schema keys
whose model defaults define a value, or hard-exclude `channel`, `address`, `controllerType`, `servoType`), and
say in the confirm what will be released.

### F5. A BTS7960 part created in the modal shows as MDD10A with empty pins; a limits-only save then retypes it

Evidence (run 1, `QA-UI-actuator-*` created with BTS7960 pins 19/20/21/22): the Edit tab opened with the board
select on MDD10A and the RPWM field blank. Run 2 goes on to save a limits-only edit on that view; see the run-2
notes for whether the server kept `controlBoard: "BTS7960"` and the four pins (by code, the save sends
`controlBoard: "MDD10A"` from the select and the stale-JSON override of F2 keeps it there).

Cause: the device list is fed by `GET /setup/calibration/api/parts`, whose projection
(`routes/setup/calibration.js:538-566`) returns `pin, directionPin, pwmPin, stepPin, dirPin, enablePin` but not
`controlBoard`, `rpwmPin`, `lpwmPin`, `renPin`, `lenPin`, `maxDuration`, `maxExtension`, `maxRetraction`. The Edit
loaders then infer the board from `part.rpwmPin != null` (`calibration.ejs:6134`, `6212`) and get MDD10A. Mina's
Coffin Door survives only because its config duplicates `controlBoard` and the limits.

Fix: add the missing fields to the projection (`controlBoard: p.controlBoard || null, rpwmPin: p.rpwmPin ?? null,
... maxExtension: p.maxExtension ?? null`), and have the loaders also read `config.rpwmPin` etc. (they already do
as a second choice).

### F6. "Invert Servo Direction" promotes a never-measured span to trusted

Evidence (run 2, `QA-UI-servo-cal-*`): fresh profile `autoGenerated: true`, bounds shown "(unmeasured)". After the
invert toggle alone, the Calibrated switch was on, "(unmeasured)" gone, and `GET /api/calibration/:id/profile`
reported `calibrated: true` with the untouched 0-180 placeholder as `bounds`. `calibratedBounds()` now hands that
guess to scenes, poses, jaw and head as a measurement.

Cause: `server/calibration/router.js:1024`, `set-invert` sets `profile.autoGenerated = false`. The other writers
that clear the flag (`953, 964, 998, 1009`) are set-min / set-max, real measurements. Inverting a direction is
not one.

Fix: delete that line; invert is a direction fact, not a calibration (the same distinction the F11 stamp and F13
timestamp work made).

### F7. Edit tab "Invert Direction" select never saves

Evidence: servo saved with the select on "Yes"; the server has no `config.invertDirection`.

Cause: `getEditConfigValues` reads `.checked` of a `<select>` (`calibration.ejs:5376`), which is `undefined`, so
the guard at `5384` skips it every time.

Fix: read `.value` and persist `v === 'true'`; or remove the select, since invert is a profile fact set in the
calibration panel (F6) and the part-field copy is a second source of truth.

### F8. "Advanced Configuration (JSON)" is ignored on save for 9 of 12 types

Evidence (run 1, light): JSON edited to `{"brightness":60,"qaJsonKey":"from-json"}`, Save, toast, server has no
`qaJsonKey`. Only motor, linear_actuator and stepper parse `#editConfig` (`calibration.ejs:5267`, `5298`), and only
for the fixed key list of F2; for servo, light, led, led_ring, sensor, motion_sensor, webcam, microphone and
speaker the textarea is write-only.

Fix: parse the textarea once for every type and deep-merge it under `config` (the server already deep-merges), or
remove the card. Doing both F2 and F8 as "JSON is applied only when edited, and then merged for every type" is
one small change in `savePartChanges`.

### F9. Add Part modal: `led_ring` missing, `head_tracking` offered but schema-invalid

Evidence: `#addPartType` offers motor, stepper, linear_actuator, light, led, servo, sensor, motion_sensor, webcam,
microphone, speaker, head_tracking. Creating a `head_tracking` part succeeds (run 1, deleted afterwards); the
schema enum has no such type, so `npm run validate:schemas` (gate step 1) would fail for the character.

Cause: `partTypes` at `calibration.ejs:4206-4219`.

Fix: add `led_ring` (requiresPin false; GPIO and geometry live in config and the Edit tab already has the form)
and drop `head_tracking` from the modal, unless it is meant to be a part type, in which case add it to
`config/schemas/parts.schema.json`.

### F10. Markers: the page has no marker editor

Evidence: `#addMarkerBtn`, `#newMarkerName`, `#customMarkers` do not exist in the DOM for any part; the API works
(add 45 deg, rename, delete, all verified in `parts.json`).

Cause: the JS binds those ids (`calibration.ejs:4045-4080`, `4138-4165`) but no markup declares them (checked
across `views/` and `public/js`). The delete confirm still promises to remove "Markers".

Fix: render the editor (a name field, a value field, Add, chips with delete) or remove the dead JS and the
mention; the jaw and head guardrails read Min/Max markers, so an editor is the better outcome.

### F11. Edit tab servo "Model" select is empty

`populateEditServoModels` (`calibration.ejs:4977`) is never called; the select shows only "Select model..." and
would write `config.modelId` rather than the top-level `modelId` the badge and list read. Fix: call it from
`loadEditServoValues`, or remove the select (the Model tab is the real writer).

### F12. Model tab lists nothing for `led_ring` (and logs a 400 on every selection)

`GET /setup/models/api/led_ring` answers 400 "Unsupported model type": `controllers/modelsController.js`
`TYPE_TO_FILE` lacks `led_ring` while `routes/setup/calibration.js:819` maps it to `led_ring_models.json`, which
exists. Fix: add `led_ring: 'led_ring_models.json'` to `TYPE_TO_FILE`.

### F13. Add Part modal offers a model only for five types

`calibration.ejs:4256` shows the model group for servo, stepper, webcam, speaker, microphone. Registries exist for
motor, linear_actuator, light, led, motion_sensor too, so those are born with the "Needs Model" badge. Fix:
extend the list (the models API already serves them).

### F14. Stray "< div" text in the modal for webcam, microphone, speaker, stepper

Template strings open with `< div class="row" >` (`calibration.ejs:4480`, `4499`, `4518`) and `< div class="card
mb-3" >` (`4660`); the browser renders the text and drops the wrapper. Fix: remove the spaces.

### F15. Device-card header "Invert" switch is unwired

`#invertDir` (`calibration.ejs:584`) has no handler; toggling it issues no request. The working control is
"Invert Servo Direction" in the calibration panel. Fix: remove it, or make it call `toggleInvert`.

### F16. Switching control board leaves the other board's pins in parts.json

`savePartChanges` nulls the retired board's pins locally but only sends non-null fields
(`calibration.ejs:5322-5334`), so `directionPin`/`pwmPin` stay beside new BTS pins, and the list route's GPIO
conflict badge counts them (`routes/setup/calibration.js` `pinsFor`). Fix: send explicit nulls for the retired
board's pins; the PUT spreads top-level fields, so null lands.

### F17. Modal GPIO pin is "required" but never validated

`#addGpioPin` carries `required` (also for PCA9685 servos, where it is unused), but `createPartFromCalibration`
(`calibration.ejs:4763`) never calls `reportValidity()`; a blank pin is accepted. Low.

### F18. Clearing the Calibrated stamp writes a full-file calibration backup, and ten are kept

`JsonCalibrationStore._snapshotIfLosingMeasurements` (`server/calibration/store.js:260-300`) copies the whole
`calibration_profiles.json` to `data/calibration-backups/` whenever a write drops a measured profile OR demotes one
to a placeholder, and rotates at ten files. Stamping a part Calibrated off (`POST /api/calibration/:id/calibrated
{calibrated:false}` sets `autoGenerated = true`) is a demotion, so every use of the F11 switch's off position, and
every delete of a measured part, costs one of the ten slots. By the end of run 3 the directory held exactly ten:
the operator's five September backups and five from these runs, one write away from rotating a real one out.
This session moved its five into `data/calibration-backups/qa-ui-spec-runs/` (moved, not deleted; the rotation
only counts files directly in the directory), and the spec now parks its own the same way. Suggested: count only
drops (not stamp-off demotions) as backup-worthy, or raise `keep` and log the rotation. Info, not a defect in
the page.

## Status after the lead's commit a0388040 (service restarted 23:29:53 CDT, runs 4 and 5 ran against it)

The API-half worker's fixes (`report-calibration-crud-fixes.md`, its own F-numbers) landed while this audit was
running. Mapped onto the findings above, from the live tree (`grep` after the commit) and runs 4-5:

| This report | Lead's fix in a0388040 | Live state |
|---|---|---|
| F3 mic/speaker device id clobbered | their F9 extra: loaders read `config.deviceId` / `config.audioDeviceId` | fixed (run 4: both device ids survive a save). Note the mic gain field now writes `config.inputGainPercent` (0-200), no longer `config.gain`; the spec accepts either |
| F5 BTS7960 part shown as MDD10A | their F3: list row carries `controlBoard`, BTS pins, limits | fixed (run 4: the Edit tab shows BTS7960 and its pins). The F2 cascade now bites harder: the JSON textarea carries the limits too, so Max Extension / Max Retraction typed in the form are reverted as well |
| F7 servo Invert Direction select never saved | their F7: select removed for servos, added for motor / linear_actuator (reads `.value`) | fixed by removal; the spec skips the assertion when the select is absent |
| F9 modal lacks led_ring / offers head_tracking | their F14 and F4 | fixed (run 4: test 1 passes, head_tracking test skips itself) |
| F16 stale pins after a board switch | their F2: explicit nulls sent, BTS pins counted for conflicts | fixed on the wire; not observable through the UI while F2 holds the board select in place |
| F1 Edit tab "Delete Part" dead | not addressed | still fails: `window.deleteSelectedPart` is never exposed (`grep -c "window.deleteSelectedPart" views/setup/calibration.ejs` = 0); every run-4 and run-5 Edit-tab delete logs the ReferenceError |
| F2 form values reverted by the stale JSON textarea | not addressed | still fails for motor, linear_actuator, stepper (both "Allow Advanced JSON to override" blocks present) |
| F4 Revert to Model erases servo wiring | not addressed | still fails (`clears[f.key] = null` over a schema that lists channel / address / controllerType) |
| F6 Invert promotes a placeholder to trusted | not addressed | still fails (`server/calibration/router.js:1073`, `profile.autoGenerated = false` in `set-invert`) |
| F8 Advanced JSON ignored for 9 types | not addressed | still fails |
| F10 no marker editor | not addressed | still fails |
| F11 Edit-tab servo Model select empty | partly: the row now reads `config.modelId` too | the select is still never populated |
| F12 led_ring models 400 | not addressed (`controllers/modelsController.js` unchanged) | still fails |
| F13 modal model group for five types only | not addressed | still fails |
| F14 stray `< div` text | not addressed (4 occurrences) | still fails |
| F15 header Invert switch unwired | not addressed | still fails |

So the operator-blocking set that remains is F1, F2, F4, F6 (and F8 as the companion of F2). F2 is the one that
matches the complaint word for word; with a0388040's projection fix it now also reverts the actuator limits.

## Pre-existing browser specs (run once each, after this spec)

Run one at a time after this spec, same invocation, on the same node. None fails; nothing pre-existing has to be
separated from the findings above.

| Spec | Result | Note |
|---|---|---|
| `tests/browser/setup-parts.spec.js` | 6 passed (17 s) | page load, selectors, controls present |
| `tests/browser/calibration-led-gpio.spec.js` | 2 skipped | Mina has no `led_ring`; the spec skips itself. The led_ring geometry save it covers was exercised here on an API-created ring (matrix row led_ring: ok, colours survive) |
| `tests/browser/calibration-panels.spec.js` | 8 passed (34 s) | calibration panel shows for servo, hides for webcam / speaker / microphone |
| `tests/browser/webcam-calibration.spec.js` | 24 passed, 2 skipped (2.6 min) | the two skips are the hardware-controls checks (no v4l2 controls answered); the tracking-settings save is answered in-page by that spec |

Why they stay green while the operator's complaint is real: they test presence and visibility (a tab opens, a field
exists, a button is shown). Only `calibration-led-gpio` and `webcam-calibration` read a value back from the server,
and both save a part type whose Edit-tab save works. None presses Delete Part in the Edit tab, none saves a motor,
actuator, stepper, microphone or speaker, none reverts a model, none toggles Invert. The new spec does.

### Run notes (three runs of the new spec on the node, 2026-10-10 23:05 to 2026-10-11 00:0x CDT)

- Run 1 (5.0 min, 16 failed / 2 passed): every finding above reproduced; two spec-side defects fixed afterwards
  (an init-script `MutationObserver` call before `documentElement` existed; a forced checkbox click that, with the
  default 1280x720 viewport, landed on Mina's microphone row under the fixed bottom bar. The spec now uses a tall
  viewport and never forces a click, so an overlay fails the test instead of clicking through it).
- Run 2 (4.8 min, 16 failed / 2 passed): same findings; added F5's cascade (the limits-only save on a BTS7960
  actuator retyped it `controlBoard: "MDD10A"` while its four BTS pins stayed) and F6 (Invert alone switched the
  Calibrated stamp on). One spec-side race remained: the page's `selectPart()` clicks the Controls tab after an
  awaited models fetch, which undid an Edit-tab click made too early; the helper now waits for the page's own
  selection chain before touching a tab.
- Run 3 (5.1 min, 16 failed / 2 passed): every finding identical to runs 1 and 2. One spec-side race left: under
  automation the page sets `MB_TEST_MODE` (`navigator.webdriver`, `calibration.ejs:2`) and its Save Overrides
  handler clicks back to the Controls tab 1.2 s later (`2283-2290`), which undid an Edit-tab click made right after
  an override save (webcam test tail). The helper now waits that out.
- Run 4 (post-fix, 23:31-23:37, 5.7 min, 14 failed / 3 passed / 1 skipped): the first run against a0388040.
  Test 1 passes (led_ring offered, head_tracking gone), the head_tracking test skips itself, mic and speaker
  device ids survive their saves, the actuator Edit tab shows its BTS7960 board and pins. Two failures were the
  spec reaching for what the fix changed: `#editInvertDirection` is gone from the servo card (now optional in the
  spec) and `#revertOverridesBtn` was hidden behind the override save's 1.2 s test-mode tab return (the spec now
  re-opens the Model tab first). The mic "gain" assertion failed because the key is now `config.inputGainPercent`
  (accepted by the spec now). One worker also reported `[live-data-guard] data/character-2/super-powers.json:
  changed`: this spec never touches that file; it was written by someone else during the run.
- Run 5 (post-fix, 23:40, stopped after 7 of 18 tests at the coordinator's request): identical verdicts to run 4
  for the seven tests it ran (1 and 3 pass; 2, 4, 5, 6, 7 fail on F1, F2, F4, F6, F10, F11, F13, F15).

## Restoration proof

Snapshot taken 23:04 CDT before any run: `/tmp/claude-1000/-home-remote-MonsterBox/a9ea956d-c217-4abd-bed9-86493eae93bc/scratchpad/crud-ui-snapshot/`
(parts.json, calibration_profiles.json, servo_calibrations.json, linear_actuator_calibrations.json, with
`md5sums-before.txt`).

| File | Before | After (00:05 CDT, after run 5 was stopped and the by-hand sweep ran) |
|---|---|---|
| `data/character-2/parts.json` | md5 `19b67bda5b68685d283e6ee380719dfd` | md5 `19b67bda5b68685d283e6ee380719dfd`, `cmp` identical, zero `QA-UI` strings, ids 1-10 untouched |
| `data/calibration_profiles.json` keys | 23 keys, none `2:11+` | 23 keys, no extra, no missing, no `2:11+`; only `2:2` and `2:3` differ (the lead's measured neck 110-136 / eye 70-110 windows and `center` presets, written at 22:57 CDT, as announced) |
| `data/character-2/servo_calibrations.json`, `linear_actuator_calibrations.json` | `{}` / `{}` | unchanged (md5 `8a80554c…`, `99914b93…`) |
| `data/calibration-backups/` | 5 operator files (Sep 21-27) | the same 5 at top level; the 8 snapshots these runs caused are in `qa-ui-spec-runs/` (moved, not deleted) |

How the spec keeps it that way on every run: `afterEach` deletes every `QA-UI-*` part and every calibration
profile a created id acquired (un-stamping first, so the store writes no backup); `afterAll` compares both files
with the bytes it read in `beforeAll`, restores `parts.json`'s exact bytes when only whitespace differs (the server
rewrites it without the trailing newline), reports any content difference without touching it, and parks the
backups it caused. Every run printed `parts.json: byte-identical` or `JSON-identical ... exact pre-run bytes
restored` and `calibration_profiles.json: byte-identical to the pre-run snapshot` after each worker.

Nothing this audit did reached hardware: every run's `ui-events.json` has `hazards: []` (no motion or probe route
was requested), the fixture guard logged no intercepted command, and the only writes were to `QA-UI-*` parts and
their profiles. The character selector was never touched (`window.__MB_CHAR_ID` = 2 asserted on every page).

## Appendix: side effects observed

- The calibration store wrote five backups during runs 1-3 (one per measured-profile drop or stamp-off demotion on
  the throwaway servo, see F18): `calibration_profiles-2026-10-11T04-06-36-916Z`, `04-15-16-701Z`, `04-15-18-753Z`,
  `04-24-37-124Z`, `04-24-39-275Z`. All five were moved to `data/calibration-backups/qa-ui-spec-runs/` (gitignored
  directory; nothing deleted); the operator's five September backups are back under the ten-file cap. The spec
  parks the ones it causes at the end of every run (`parkRunBackups`).
- `/var/log/monsterbox.err` carries one `Calibration profile DELETED for 2:<id>` line per throwaway profile the
  spec removed (the route logs every profile delete by design). Nothing else from this work reaches the logs.
- Selecting a QA microphone or webcam part starts the Controls tab's VU poll and stream; the spec answers those
  reads in-page, so no Python interpreter or camera was opened for a QA part.

## Final runs after the fixes (lead, 2026-10-11 00:04-00:12 CDT, server at the final code)

| Run | Code under test | Result |
|---|---|---|
| Runs 1-3 (23:05-23:30) | before any fix | 16 of 18 fail |
| Run 4 (23:31) | fix pass 1 (a0388040) | 14 fail, 3 pass, 1 skip |
| Run 6 (23:55) | fix pass 2 (16a38fe7) | 6 fail, 11 pass, 1 skip |
| Run 7 (00:05) | pass 2 + spec corrections | 1 fail, 16 pass, 1 skip |
| Run 8 (00:12, single test) | same | the last test passes: **17 pass, 1 skip** |

Of the six failures in run 6, four were this spec's own detection (`deleteViaEditTab` waited for the confirm
host to be *visible*; the host is an unstyled wrapper whose backdrop and modal are fixed-position children, so
it has no box; `confirmDialog()` already checked presence, which is why the Remove-button path passed), and
two were assertions made stale by intended changes (the device-card header `#invertDir` was removed as unwired,
F15; `pca9685Frequency` was briefly treated as wiring identity and is not, so Revert releases it again). The
Edit-tab Delete, the Advanced-JSON revert of pins / board / limits, Revert-to-Model stripping identity keys and
Invert blessing a placeholder are fixed and proven by the spec. Each run ends with parts.json JSON-identical and
byte-restored and calibration_profiles.json byte-identical to its pre-run snapshot.
