# Calibration page: CRUD and settings persistence, fixes applied

Date: 2026-10-10, node `mina` (character 2 selected, untouched). Working tree only: nothing committed, service NOT restarted. The lead restarts once and re-verifies with the curl recipes below.

Work order: `report-calibration-crud-api.md` (findings F1-F15 and section 5). Contract: `docs/development/PART-MODEL-CALIBRATION-UX-CHAIN.md` (invariant 1: resolve `characterId` once per request and thread it to the hardware/store hop; invariant 5: a control the operator can change must reach a consumer or not exist).

Files changed (7): `routes/setup/calibration.js`, `routes/api/partsApi.js`, `controllers/webcamController.js`, `server/calibration/router.js`, `server/calibration/store.js`, `views/setup/calibration.ejs`, `views/setup/models.ejs`. Nothing under `data/`, `config/`, `tests/`, `python_wrappers/`.

## 1. What changed, per finding

Line numbers are from the working tree after the edits.

### F1 (High) Linear-actuator limits and motor timeout saved where the hardware never read them
- `routes/setup/calibration.js:740-767` (PUT `/api/parts/:id`): after the deep merge, `maxExtension` / `maxRetraction` / `maxDuration` present in the merged config are hoisted to TOP-LEVEL unless the caller sent that top-level key itself. The hardware layer (`services/hardwareService/index.js:2239-2256`, the part normaliser that `controlPart()` feeds the actuator with) reads TOP-LEVEL first, so this is what makes an Edit-tab save reach the actuator. The config copy is kept, so the Edit tab's loader keeps working.
- `routes/setup/calibration.js:1188-1200` (jog): reads `part.config.maxExtension ?? part.maxExtension ?? 15000` (same for retraction) and `controlBoard` from top-level or config. `:1250` (stop): `controlBoard` from top-level or config.
- `routes/setup/calibration.js:596-598`: list row now carries `maxExtension`, `maxRetraction`, `maxDuration` (top-level, else config).

### F2 (High) Switching MDD10A to BTS7960 left the other board's pins on disk; conflict detection ignored BTS pins
- `views/setup/calibration.ejs:5373-5388` (`savePartChanges`): for motor / linear_actuator the PUT now sends explicit `directionPin: null, pwmPin: null` when the board is BTS7960, and `rpwmPin/lpwmPin/renPin/lenPin: null` when it is MDD10A. The server spread persists nulls; the list row coerces them back to null.
- `routes/setup/calibration.js:526-533` (`pinsFor`): counts `rpwmPin/lpwmPin/renPin/lenPin`, and `config.gpioPin` for `led_ring`.

### F3 (High) The list row dropped controlBoard, BTS pins and limits
- `routes/setup/calibration.js:568-598`: row adds `controlBoard` (top-level or config), `rpwmPin`, `lpwmPin`, `renPin`, `lenPin`, `maxExtension`, `maxRetraction`, `maxDuration`. New fields use `!= null` so a GPIO 0 survives; existing pin fields keep their `|| null` coercion (unchanged contract).

### F4 (High) The Add modal offered `head_tracking`, which the schema gate refuses
- `views/setup/calibration.ejs:4219-4222`: `head_tracking` removed from `partTypes` (comment left in its place). `:3791`: the dead `head_tracking` Controls renderer branch deleted.
- Left alone, deliberately: the Overrides field-map entry `head_tracking: [...]` at `:2169` (unreachable without a part of that type, harmless) and `MODEL_FILE_BY_TYPE.head_tracking` on the server.
- `node scripts/validate-schemas.mjs`: passes for all six characters, so no fleet file carries a `head_tracking` part.

### F5 (Medium) Create accepted identity values that Update refuses
- `routes/setup/calibration.js:626-632` (POST `/api/parts`): `validatePartConfigPatch(payload.config)`; 400 with the validator's message on failure, exactly like PUT.

### F6 (Medium) Edit-tab model saved where the list could not see it ("Needs Model" never cleared)
- `routes/setup/calibration.js:569-572, 578, 605`: row `modelId = p.modelId || config.modelId || null`, `needsModel: !modelId`.
- `routes/setup/calibration.js:757-759` (PUT): `updates.config.modelId` arriving without a top-level `updates.modelId` is hoisted to top-level `modelId` (top-level is the authoritative home; the config copy is kept because the webcam Controls tab and `/effective` still read it as a fallback).
- `views/setup/models.ejs:672`: "Apply model" now PUTs `{ modelId }` top-level; `:708` "Push defaults" sends `{ modelId, config: merged }`.
- `views/setup/calibration.ejs:3673, 3711`: the webcam Controls tab's model lookup reads `part.modelId || part.config.modelId`.

### F7 (Medium) Edit-tab servo "Invert direction" never saved, and would not have been read
- `views/setup/calibration.ejs:5430-5434, 5439`: servos no longer send `invertDirection` at all (a servo's inversion is the profile's `capability.invert`, written by the Controls tab Invert via `POST /api/calibration/:id/set-invert`).
- `:5711-5715`: the servo Edit card's select is replaced by a hint pointing at the Controls tab.
- `:5455-5475`: motor and linear_actuator read `#editInvertDirection` as a `<select>` (`.value === 'true'`) and send `config.invertDirection`, which the runtime does consume for those two types (`services/hardwareService/index.js:435-464, 2242-2243`).
- `:5816-5824, 5890-5898`: Invert select added to the motor and linear actuator Edit cards; `:6272-6273, 6331-6332` populate it from `config.invertDirection` (else top-level).

### F8a (Medium) Global `PUT /api/parts/:id` wrote the SELECTED character regardless of `?characterId`
- `routes/api/partsApi.js:448-454`: resolves with `resolveCharacter(req)` (query > params > selected) instead of `cfg.selectedCharacter`. The write still goes through `writeJsonAtomic`, which asserts the character lock (423 preserved). Response shape unchanged.

### F8b (Medium) Webcam "Apply & Save" / Night Mode persisted to the SELECTED character
- `controllers/webcamController.js:9, 47-70, 267-268, 309`: `setControls` resolves the parts file from the request (`getPartsFilePathFor(req)` via `resolveCharacter`), reads and persists through that path. All other webcam handlers untouched.
- `views/setup/calibration.ejs:25-48`: `window.mbCharId()` and `window.mbCharQuery()` factored out of `mbPartsUrl()`; `:3753, 3782`: both `controls/set` calls append `?characterId=<displayed>`.

### F9 (Medium) Microphone had two gain keys; the Edit tab's was dead
- `views/setup/calibration.ejs:6075-6078`: the card field is now "Input Gain (%)", range 0-200, default 100 (unity). `:5535-5548`: Save writes `config.inputGainPercent` (clamped 0-200), never `config.gain`. `:6407-6410`: loader reads `inputGainPercent` (100 when absent).
- Extra, same card, same bug class (settings that "do not take"): the mic loader showed `config.device || 'default'` while Save writes `config.deviceId`, so opening the Edit tab on a mic whose `deviceId` is `hw:9,0` and pressing Save wrote `deviceId: "default"` over it. Loader now reads `deviceId` first and leaves the field blank (placeholder) when unset (`:6404-6407`). The speaker loader had the identical shape against `audioDeviceId` and got the same fix (`:6422-6425`). Neither was in the audit; flagged here for the lead.

### F10 (Medium) Create on a locked character answered 500, not 423
- `routes/setup/calibration.js:657-667`: `res.status(statusFor(error)).json({ success:false, error: error.message || 'Failed to create part', code: error.code, message: error.message })`.

### F11 (Low) Stepper model never resolved in `/effective`
- `routes/setup/calibration.js:895`: `MODEL_FILE_BY_TYPE.stepper = 'motor_models.json'`.

### F12 (Low) Alias type spellings were second-class
- `routes/setup/calibration.js:319-338, 361, 372, 376`: `normalizePartType()` lower-cases `type`, maps `-` to `_`, and maps `continuous_servo` to `servo` with `config.servoType = 'continuous'` when `servoType` is absent. Applied in memory in `loadCharacterParts()` (all three return paths). The file is NOT rewritten on read; note that the next save of that character's parts through this router will persist the canonical spelling (schema-valid, same semantics for every consumer).
- `:509-512`: the `?type=` filter on the list normalises the same way.

### F13 (Low, latent) Calibration store delete fell back to a bare legacy key
- `server/calibration/store.js:369-374` (`delete`) and `:394-396` (`deleteMany`, same line of evidence in the audit): the bare legacy key is a target only when `cid == null`; a scoped call that finds no scoped profile now returns false instead of erasing a shared legacy profile.

### F14 (Low) The Add modal could not create an `led_ring`
- `views/setup/calibration.ejs:4216-4219`: `led_ring` added to `partTypes` (no top-level pin). `:4331-4333, 4562-4581`: `generateLedRingConfig()` with Data Pin (default 18) and Pixel Count (default 16). `:4881-4889`: create writes `config.gpioPin` and `config.pixelCount`, the keys the LED code and `tests/browser/calibration-led-gpio.spec.js` read. No model select is offered because `controllers/modelsController.js` (out of scope) has no `led_ring` mapping for `/setup/models/api/:type`.

### F15 (Low) Speaker volume/bass/treble persist but nothing reads them
- Not changed (UI-honesty issue, no persistence defect). Recorded for the lead.

### Section 5 (the correctness fix): `/api/calibration` profile routes now honour the request's character
- `server/calibration/router.js:22-45`: `charIdOf(ctx)` (returns `undefined`, never `null`, when unresolved, because both stores read `null` as "explicitly unscoped" = legacy bare key) and `loadPartsFor(characterId)` (reads `data/character-N/parts.json`, falls back to the global `loadParts()` exactly as before).
- `:218-382` `getOrAutoCreateProfile(partId, characterId)`: `store.getRaw(partId, characterId)`, `loadPartsFor(characterId)` at all four part lookups, `store.upsert(profile, characterId)` at all four writers (three reconciles and the auto-create).
- Routes resolving `const characterId = charIdOf(await resolveCharacter(req))` and passing it: GET `profile` (:391), GET `position` (:402), `nudge` (:575, reusing `nudgeCharOpt`), `stop` (:690, also `markUnknown`), `home` (:747-769, `markMoving`/`markHomed`/catch-path `update`), `goto` (:833, also `markMoving`), `release` (:931, `loadPartsFor`), `set-min` (:972), `set-max` (:1022), `set-invert` (:1068), `learn-openloop` (:1086), `sensors` (:1119). `jog-raw` already resolved.
- POST `profile` (:426-427) and POST `calibrated` (:510): an explicit BODY `characterId` keeps its existing meaning (backward compatible), otherwise query > params > selected. This is the one place a stricter "query always wins" reading of the brief was NOT taken, to avoid changing an existing contract.
- `persistPosition(partId, currentP, extra, characterId)` (:159-172) passes the character to `actuatorPositionStore.markStopped`; all five call sites pass it. `persistServoPosition` already did.
- Response shapes are identical everywhere. On this node the page sends no `characterId` to these routes and the resolver falls back to the selected character, so behaviour here is unchanged; the fix is that an explicit `?characterId=N` now lands on N's key.

## 2. Static checks (all run on this node, nothing restarted, no suite, no hardware call)

```
node --version                       v23.11.1
node --check routes/setup/calibration.js        OK
node --check routes/api/partsApi.js             OK
node --check controllers/webcamController.js    OK
node --check server/calibration/router.js       OK
node --check server/calibration/store.js        OK
inline <script> bodies extracted (EJS tags stubbed) and node --check'ed:
  views/setup/calibration.ejs script#1 (197 lines)  OK
  views/setup/calibration.ejs script#2 (62 lines)   OK
  views/setup/calibration.ejs script#3 (5672 lines) OK
  views/setup/models.ejs script#1 (597 lines)       OK
npm run validate:schemas    ✓ Schema validation passed (6 character(s): character-1 .. character-6).
npm run audit:resolver      ✓ No direct character-state reads outside the allowlist.
npm run audit:independence  ✓ Character-independence audit clean (21 total matches, all allowlisted).
```
(`audit:independence` first flagged a character name inside a comment I had written in `partsApi.js`; reworded, now clean.) No eslint config exists at the repo root, so `npx eslint` was not run.

## 3. Verification after restart (curl, read-only GETs plus writes to throwaway `QA-FIX-*` parts on characters 3 and 5)

Setup. Character 2 stays selected throughout; snapshot its files so the "nothing else moved" claim is provable.

```bash
cd /home/remote/MonsterBox; B=http://localhost:3100; J='Content-Type: application/json'
md5sum data/character-2/parts.json data/character-1/parts.json data/character-4/parts.json data/calibration_profiles.json > /tmp/qa-before.md5
```

F5 / F10 (create validation, lock status):
```bash
curl -s -w '\n%{http_code}\n' -X POST "$B/setup/calibration/api/parts?characterId=5" -H "$J" \
  -d '{"name":"QA-FIX-bad","type":"servo","config":{"servoType":"bogus","controllerType":"pca9685","channel":99}}'
#  expect 400, error 'Invalid servoType "bogus" ...', nothing written to data/character-5/parts.json
curl -s -w '\n%{http_code}\n' -X POST "$B/setup/calibration/api/parts?characterId=1" -H "$J" \
  -d '{"name":"QA-FIX-locked","type":"light","pin":25}'
#  expect 423 with "code":"CHARACTER_CONFIG_LOCKED" (was 500); character-1/parts.json md5 unchanged
```

F1 / F3 / F6 (actuator limits reach top-level, row carries them, model clears the badge):
```bash
ID=$(curl -s -X POST "$B/setup/calibration/api/parts?characterId=3" -H "$J" \
  -d '{"name":"QA-FIX-linact","type":"linear_actuator","description":"qa","controlBoard":"MDD10A","directionPin":22,"pwmPin":23,"maxExtension":15000,"maxRetraction":15000}' | jq -r .part.id)
curl -s -X PUT "$B/setup/calibration/api/parts/$ID?characterId=3" -H "$J" \
  -d '{"config":{"maxExtension":12000,"maxRetraction":9000,"modelId":"1759010196402"}}' | jq '.part | {maxExtension, maxRetraction, modelId, config}'
#  expect top-level maxExtension 12000, maxRetraction 9000, modelId "1759010196402" (hoisted), config also carries them
jq --arg id "$ID" '.[] | select(.id==$id) | {maxExtension, maxRetraction, modelId}' data/character-3/parts.json
#  expect the same on disk
curl -s "$B/setup/calibration/api/parts?characterId=3" | jq --arg id "$ID" '.parts[] | select(.id==$id) | {controlBoard, maxExtension, maxRetraction, maxDuration, modelId, needsModel}'
#  expect controlBoard "MDD10A", 12000, 9000, maxDuration null, modelId set, needsModel false
```

F2 / F3 (board switch clears the other board's pins; BTS pins in the row and in conflict detection):
```bash
curl -s -X PUT "$B/setup/calibration/api/parts/$ID?characterId=3" -H "$J" \
  -d '{"controlBoard":"BTS7960","rpwmPin":19,"lpwmPin":20,"renPin":24,"lenPin":25,"directionPin":null,"pwmPin":null,"config":{"controlBoard":"BTS7960"}}' >/dev/null
jq --arg id "$ID" '.[] | select(.id==$id) | {controlBoard, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin}' data/character-3/parts.json
#  expect directionPin null, pwmPin null, BTS pins 19/20/24/25 (this is the payload the page now sends)
L=$(curl -s -X POST "$B/setup/calibration/api/parts?characterId=3" -H "$J" -d '{"name":"QA-FIX-light","type":"light","pin":19}' | jq -r .part.id)
curl -s "$B/setup/calibration/api/parts?characterId=3" | jq --arg a "$ID" --arg b "$L" '.parts[] | select(.id==$a or .id==$b) | {id, rpwmPin, pin, gpioConflict}'
#  expect gpioConflict true on both (pin 19 vs rpwmPin 19); was false before because BTS pins were not counted
```

F7 (invert for motor/linear reaches config; servo card no longer offers it):
```bash
curl -s -X PUT "$B/setup/calibration/api/parts/$ID?characterId=3" -H "$J" -d '{"config":{"invertDirection":true}}' | jq .part.config.invertDirection
#  expect true (the page now sends this for motor / linear_actuator only)
#  browser: open /setup/calibration, select a servo, Edit tab shows the Controls-tab hint instead of an Invert select;
#  select a motor or linear actuator, the card has the Invert select and Save persists config.invertDirection.
```

F8a (global PUT honours ?characterId; lock holds):
```bash
curl -s -X PUT "$B/api/parts/$ID?characterId=3" -H "$J" -d '{"description":"QA-FIX via global PUT"}' | jq .success
jq --arg id "$ID" '.[] | select(.id==$id) | .description' data/character-3/parts.json      # expect the new description
curl -s -o /dev/null -w '%{http_code}\n' -X PUT "$B/api/parts/1?characterId=1" -H "$J" -d '{"description":"x"}'   # expect 423
```

F8b (webcam controls persist to the request's character; safe because device 99 does not exist so no v4l2 call is made):
```bash
CAM=$(curl -s -X POST "$B/setup/calibration/api/parts?characterId=3" -H "$J" -d '{"name":"QA-FIX-cam","type":"webcam","config":{"deviceId":99}}' | jq -r .part.id)
curl -s -X PUT "$B/setup/calibration/api/webcam/parts/$CAM/controls/set?characterId=3" -H "$J" -d '{"controls":{"brightness":5},"persist":true}' | jq '{persisted, hardwareApplied}'
#  expect persisted true, hardwareApplied false
jq --arg id "$CAM" '.[] | select(.id==$id) | .config.controls' data/character-3/parts.json    # expect {"brightness":5}
```

F9 (gain key): `curl -s -X PUT ".../api/parts/<micId>?characterId=3" -d '{"config":{"inputGainPercent":120}}'` stores `inputGainPercent`; the browser check is the Edit tab's "Input Gain (%)" field (0-200) on any microphone, and that Save no longer writes `config.gain` nor `deviceId:"default"`.

F11 / F12 (stepper model resolves; alias spelling is first-class):
```bash
S=$(curl -s -X POST "$B/setup/calibration/api/parts?characterId=5" -H "$J" -d '{"name":"QA-FIX-stepper","type":"stepper","stepPin":5,"dirPin":6}' | jq -r .part.id)
curl -s -X POST "$B/setup/calibration/api/parts/$S/model?characterId=5" -H "$J" -d '{"modelId":"motor_stepperonline_nema17_59ncm"}' >/dev/null
curl -s "$B/setup/calibration/api/parts/$S/effective?characterId=5" | jq '.model != null'     # expect true (was null)
A=$(curl -s -X POST "$B/setup/calibration/api/parts?characterId=5" -H "$J" -d '{"name":"QA-FIX-alias","type":"linear-actuator","directionPin":22,"pwmPin":23}' | jq -r .part.id)
curl -s "$B/setup/calibration/api/parts?characterId=5" | jq --arg id "$A" '.parts[] | select(.id==$id) | {type, needsCalibration}'
#  expect type "linear_actuator", needsCalibration true (row never flagged it before)
curl -s -w '\n%{http_code}\n' "$B/setup/calibration/api/linear_actuator/$A/status?characterId=5"   # expect 200 exists:false (was 404)
```

F13 (store-level, no server needed; scratch file only):
```bash
F=/tmp/claude-1000/qa-cal.json; echo '{"7":{"partId":7,"autoGenerated":true}}' > $F
node --input-type=module -e "
import { JsonCalibrationStore } from './server/calibration/store.js'; import fs from 'fs';
const s = new JsonCalibrationStore('$F');
console.log('scoped (cid=5) delete ->', await s.delete(7, 5), '| bare key kept:', '7' in JSON.parse(fs.readFileSync('$F')));
console.log('unscoped (cid=null) delete ->', await s.delete(7, null));"
#  expect: scoped -> false, bare key kept: true;  unscoped -> true
```

Section 5 (profile routes land on the requested character while character 2 is selected):
```bash
curl -s "$B/api/calibration/$ID/profile?characterId=3" | jq '.profile.capability.kind'
#  expect "openloop-linear" (typed from character-3's QA actuator); before the fix it was typed from character 2's part $ID
jq 'keys | map(select(startswith("3:")))' data/calibration_profiles.json      # expect "3:<ID>" present
curl -s -X POST "$B/api/calibration/$ID/set-invert?characterId=3" -H "$J" -d '{"invert":true}' | jq .invert
jq --arg k "3:$ID" '.[$k].capability.invert' data/calibration_profiles.json   # expect true, and no "2:<ID>" change
curl -s -X POST "$B/api/calibration/$ID/calibrated?characterId=3" -H "$J" -d '{"calibrated":false}' | jq .success   # 200
```

Cleanup and proof that only characters 3 and 5 moved:
```bash
curl -s -X DELETE "$B/api/calibration/$ID/profile?characterId=3" >/dev/null
for p in $ID $L $CAM; do curl -s -X DELETE "$B/setup/calibration/api/parts/$p?characterId=3" >/dev/null; done
for p in $S $A;         do curl -s -X DELETE "$B/setup/calibration/api/parts/$p?characterId=5" >/dev/null; done
md5sum -c /tmp/qa-before.md5
#  expect character-2, character-1, character-4 parts.json OK. calibration_profiles.json: OK unless a reconcile touched a
#  character-2 key during the window (compare `jq 'keys'` before/after if it differs).
```

## 4. Notes for the lead
- No public response shape changed. Two contracts were kept on purpose: POST `profile` and POST `calibrated` still honour a BODY `characterId` first (then the resolver), because a fleet client already relied on it.
- F12 normalises on read only; the canonical spelling reaches disk on the next save of that character's parts (schema-valid either way).
- F6 hoists `config.modelId` to top-level without deleting the config copy; top-level is authoritative for the list, the badge and `/effective`.
- `head_tracking` still exists in the Overrides field map (`calibration.ejs:2169`) and `MODEL_FILE_BY_TYPE`; both unreachable now and left to keep the change small.
- The adapter cache in the calibration router is still keyed by bare partId (pre-existing, tracked in KNOWN-BUGS); character threading stops at the store and the position store, as the brief asked.
- Found while fixing F9 and fixed in the same card: the microphone and speaker Edit loaders mirrored `'default'` into the device field, so a plain Save overwrote `deviceId` / `audioDeviceId` with `"default"`.

## Second pass (UI audit follow-up, 2026-10-11)

Work order: `report-calibration-crud-ui.md` (its own F-numbers; the table "Status after the lead's commit a0388040" lists what remained). Same rules: working tree only, no restart, no suite, no hardware call. Files touched this pass: `views/setup/calibration.ejs`, `routes/setup/calibration.js`, `server/calibration/router.js`, `controllers/modelsController.js` (one mapping, admitted to scope for UI F12). Line numbers are from the working tree after this pass.

### UI F1 (operator-blocking) Edit tab "Delete Part" threw ReferenceError
- `views/setup/calibration.ejs:4278-4287`: `window.deleteSelectedPart = deleteSelectedPart` next to the existing `window.loadParts` export. The same class was fixed in the same place: `deleteMarker` (the marker chips' inline `onclick`), `renderMarkers`, `loadMarkers` and `populateEditServoModels` are exported too.
- Verify (UI): select any `QA-FIX-*` part, Edit tab, "Delete Part" opens the confirm naming the part; confirming removes it; the browser console has no `deleteSelectedPart is not defined`. Static: `grep -c "window.deleteSelectedPart = deleteSelectedPart" views/setup/calibration.ejs` prints 1.

### UI F2 (operator-blocking, the complaint) and F8: Advanced JSON reverted form values; ignored for nine types
- `views/setup/calibration.ejs:5736-5752` (`renderEdit`): the prefilled textarea keeps a snapshot of what was rendered (`dataset.rendered`); a delegated `input`/`change` listener on `#tabEdit` records every form field the operator touches in this selection (`window.__mbEditDirty`, reset per selection).
- `:5366-5401` (`savePartChanges`): the JSON is parsed once; only keys whose value differs from the rendered snapshot count as edited (`advChanged`); `fromJson(key)` yields a value only when the key was edited AND its owning form field was not touched. `:5436-5451` (motor / linear_actuator) and `:5462-5468` (stepper) use it in place of the two "Allow Advanced JSON to override" blocks, which applied the stale prefill on every Save. `:5471-5480` (F8): edited keys the form does not own are merged into `config` for every type; the top-level wiring keys never go into config. Invalid JSON is reported by toast and ignored; the form values still save.
- Rules now: form value typed this session always wins; an untouched form field yields to a key the operator edited in the JSON; an unedited JSON never changes anything.
- Verify (UI, motor `QA-FIX-motor` with directionPin 22 / pwmPin 23 created via the API on character 3, page on the selected character works the same): (a) type Direction 25 / PWM 27, leave the JSON alone, Save: `jq '.[] | select(.name=="QA-FIX-motor") | {directionPin, pwmPin}' data/character-N/parts.json` shows 25 / 27 (was 22 / 23 before this pass). (b) Change only the JSON `"pwmPin": 12`, Save: pwmPin 12. (c) Type PWM 13 in the form and set the JSON to `"pwmPin": 14`, Save: 13. (d) Stepper: step / dir / enable, microstepping, steps/rev typed in the form persist. (e) F8: light, add `"qaJsonKey": "from-json"` to the JSON, Save: `config.qaJsonKey` is on disk.

### UI F4 (hardware-dangerous) "Revert to Model" erased a servo's wiring
- Client `views/setup/calibration.ejs:2367-2377, 2387`: the Revert handler drops `controllerType`, `channel`, `address`, `servoType`, `pca9685Frequency` from the keys it clears; for a servo (all five of its override fields are identity) it toasts "Nothing to revert" and sends no request; for other types the success toast names what was released. Button tooltip (`:785`) says identity is kept.
- Server `routes/setup/calibration.js:318-331` (`identityClearRefusal`), applied in the overrides route (`:889-892`) and, because a null deep-merges in as `config.channel = null`, in `PUT /api/parts/:id` as well (`:720-725`): a `null` for any of those keys is refused with 400 and a message that says what to do instead. Setting a value is unchanged (still validated by `validatePartConfigPatch`); nulls for non-identity keys still delete.
- Verify:
```bash
curl -s -w '\n%{http_code}\n' -X POST "$B/setup/calibration/api/parts/$SV/overrides?characterId=3" -H "$J" -d '{"overrides":{"channel":null,"controllerType":null}}'
#  expect 400, "Refusing to clear channel, controllerType ..."; disk unchanged
curl -s -w '\n%{http_code}\n' -X PUT "$B/setup/calibration/api/parts/$SV?characterId=3" -H "$J" -d '{"config":{"servoType":null}}'      # expect 400
curl -s -w '\n%{http_code}\n' -X POST "$B/setup/calibration/api/parts/$ID/overrides?characterId=3" -H "$J" -d '{"overrides":{"speedMaxPct":null}}'   # expect 200 (non-identity null still deletes)
#  UI: servo, Model tab, Revert -> toast "Nothing to revert ..." and no request in the network log; channel/address/controllerType/servoType intact on disk.
```
(`$SV` is a `QA-FIX-servo` created with `{"type":"servo","config":{"servoType":"standard","controllerType":"pca9685","channel":7,"address":64}}`.)

### UI F6 Invert promoted a 0-180 placeholder to trusted
- `server/calibration/router.js:1071-1078`: `set-invert` no longer sets `autoGenerated = false`; it writes `capability.invert` only. Only set-min / set-max and the Calibrated stamp change `autoGenerated` / `calibrated`.
- Verify:
```bash
curl -s "$B/api/calibration/$SV/profile?characterId=3" | jq '{auto: .profile.autoGenerated, calibrated}'            # fresh: auto true, calibrated false
curl -s -X POST "$B/api/calibration/$SV/set-invert?characterId=3" -H "$J" -d '{"invert":true}' | jq .invert           # true
curl -s "$B/api/calibration/$SV/profile?characterId=3" | jq '{auto: .profile.autoGenerated, calibrated, inv: .profile.capability.invert}'
#  expect auto true, calibrated false, inv true (before this pass: auto false, calibrated true)
curl -s -X DELETE "$B/api/calibration/$SV/profile?characterId=3" >/dev/null   # cleanup
```

### UI F11 / F12 / F13 model plumbing
- F11 `views/setup/calibration.ejs:6325-6330`: `loadEditServoValues` fills the servo Model select (`populateEditServoModels`, now exported) before selecting the part's model; a pick saves as `config.modelId`, which the PUT hoists to top-level (first pass F6). Verify (UI): servo, Edit tab, Model select lists the servo registry with the part's model preselected; pick another, Save, the badge shows it after the reload and `jq '.modelId'` matches.
- F12 `controllers/modelsController.js:15-18`: `led_ring: 'led_ring_models.json'` (the same file `MODEL_FILE_BY_TYPE` in `routes/setup/calibration.js` resolves). Verify: `curl -s "$B/setup/models/api/led_ring" | jq '.success, (.models|length)'` prints `true` and `1` (was 400 "Unsupported model type").
- F13 `views/setup/calibration.ejs:4352-4356`: the Add modal offers a model for every type with a registry (adds motor, linear_actuator, light, led, motion_sensor, led_ring; sensor has no registry file). Verify (UI): Add Part, type Motor, the Model select is visible and populated from `/setup/models/api/motor`.

### UI F14 / F15 / F10 markup
- F14 `views/setup/calibration.ejs:4583, 4602, 4621, 4784` and the four matching closers: `< div ...>` / `</div >` corrected, so the webcam, microphone, speaker and stepper modal sections no longer leak literal "< div" text. Static: `grep -c '< div' views/setup/calibration.ejs` prints 0.
- F15 `:593-596`: the unwired header "Invert" switch (`#invertDir`) is removed; it rendered for every part type and had no handler. The working control is "Invert Servo Direction" in the calibration panel. Static: `grep -c 'id="invertDir"' views/setup/calibration.ejs` prints 0.
- F10 `:651-700`: a Markers card in the Edit tab (above Advanced JSON) with Min / Mid / Max fields each with Save, a custom name + value + Add row, and the `#customMarkers` chip area; the JS that had bound these ids for years now has markup. `:4081-4104` (`saveMarkerFromField`) refuses a blank value and surfaces the server's 400 (outside the span) / 409 (Min/Max would collapse) messages; `:4130-4150` the Add handler reads the value field; `:4156-4161` binds the three Save buttons; `:1176` `selectPart` loads the markers on selection. Verify (UI, servo): Min 20, Save, chip/field persists and `jq '.[] | select(.id=="<id>") | .markers'` shows `{name:"Min", value:20, unit:"deg"}`; Min 200 toasts "Servo marker must be within 0-180"; custom "Snarl" 45 adds a chip whose x deletes it.

### Static checks (second pass)
```
node --check routes/setup/calibration.js          OK
node --check server/calibration/router.js         OK
node --check controllers/modelsController.js      OK
inline <script> bodies (EJS tags stubbed) node --check'ed:
  views/setup/calibration.ejs script#1 (197 lines)   OK
  views/setup/calibration.ejs script#2 (62 lines)    OK
  views/setup/calibration.ejs script#3 (5776 lines)  OK
  views/setup/models.ejs script#1 (597 lines)        OK
npm run validate:schemas    ✓ Schema validation passed (6 character(s)).
npm run audit:resolver      ✓ No direct character-state reads outside the allowlist.
npm run audit:independence  ✓ Character-independence audit clean (21 total matches, all allowlisted).
```

### Notes for the lead (second pass)
- Public API shapes unchanged. New refusals: 400 on a null identity key through the overrides route and through `PUT /api/parts/:id` config (message names the keys). No client in the repo sends those nulls except the old Revert, which no longer does.
- The Playwright spec's Revert step on a servo now gets a toast and no request; its assertion that channel / address / controllerType / servoType survive should pass either way.
- UI F17 (modal GPIO `required` never validated) and F18 (stamp-off writes a calibration backup) were not in this work order and are untouched.
