# Calibration page: CRUD and settings persistence, API-level audit

Date: 2026-10-10 (run 2026-10-11 03:54 to 03:57 UTC) on node `mina` (character 2 selected, untouched).
Scope: every write the Calibration page's own JavaScript makes, replayed with the exact payloads it sends, against `http://localhost:3100` with `?characterId=3` (Orlok, stale node-local copy) and `?characterId=5` (Groundbreaker, stale copy), plus one lock-holds pass on the LOCKED characters 1 and 4. Report only; no code changed.

## 1. Run summary

| Run | HTTP calls | Statuses | Checks | Failures | Unexpected file changes |
|---|---|---|---|---|---|
| character 3 matrix | 249 | 219 x 200, 6 x 400, 23 x 404, 1 x 409 | 407 | 11 | 0 (154 file snapshots) |
| character 5 matrix | 249 | same distribution | 407 | 11 (identical set) | 0 (154 file snapshots) |
| lock-holds (chars 1, 4) | 8 | 6 x 423, 2 x 500 | 10 | 2 (both F10) | 0 |
| webcam models CRUD (global registry) | 5 | 4 x 200, 1 x 404 | 5 | 0 | file restored byte-for-byte |

Every write was followed by an md5 sweep of `data/*.json` and `data/character-*/**/*.json`. No write to character 3 or 5 touched any other character's file, `data/parts.json`, or any locked character. The failures are the same eleven on both characters, so they are code defects, not data drift.

The operator's complaint ("several save settings do not work") is confirmed, but not where the server persists: every PUT/POST landed on disk for the right character with a 200. The breakage is in **which key** the page writes versus **which key the runtime reads**, in **what the list route exposes back to the Edit tab**, and in two client-side dead controls. Details in section 4.

## 2. Write-surface map (client to server)

All parts URLs go through `window.mbPartsUrl()` (`views/setup/calibration.ejs:24-38`), which appends `?characterId=<displayed>`; the server resolves it with `resolveCharacter(req)` (query wins). Server: `routes/setup/calibration.js`.

| Surface | Method and URL | Payload the page sends | Server |
|---|---|---|---|
| Add Part modal (`createPartFromCalibration`, ejs:4763-4900) | `POST /setup/calibration/api/parts` | `{name, type, description, modelId?, pin?}` plus per type: servo `config.{servoType, controllerType, channel, address, pca9685Frequency}`; motor/linear `controlBoard, directionPin, pwmPin` or `rpwmPin, lpwmPin, renPin, lenPin`, linear `maxExtension, maxRetraction` (TOP-LEVEL), motor `maxDuration:10000` (TOP-LEVEL); stepper `stepPin, dirPin, enablePin, config.{microstepping, stepsPerRevolution}`; webcam `config.{devicePath, deviceId}`; microphone `config.deviceId`; speaker `config.{audioDeviceId, volume, bass, treble}`; light/led/sensor/motion_sensor `pin` only | `router.post('/api/parts')` :574. Spreads payload, stamps id/enabled/created/updated. **No `validatePartConfigPatch`** (F5). Lock refusal answered 500 (F10). |
| Parts list / single | `GET .../api/parts`, `GET .../api/parts/:id` | none | :468, :617. The list row (538-561) omits `controlBoard`, BTS pins, `maxExtension/maxRetraction/maxDuration` and reads only top-level `modelId` (F3, F6). |
| Edit tab Save (`savePartChanges` ejs:5186-5365, `getEditConfigValues` 5368-5490) | `PUT .../api/parts/:id` | `{name, type, enabled, description, config}` + `pin` / `directionPin, pwmPin` / `rpwmPin, lpwmPin, renPin, lenPin` / `stepPin, dirPin, enablePin` / `controlBoard` only when non-null. `config` per type: servo `{servoType, controllerType, modelId, address, pca9685Frequency, channel}` (invertDirection never, F7); motor `{maxDuration, controlBoard}`; linear `{maxExtension, maxRetraction, controlBoard}`; stepper `{microstepping, stepsPerRevolution}`; light/led `{brightness, channel}`; led_ring `{gpioPin, pwmChannel, colorOrder, pixelCount, ringSplit, dma, dataRateHz}`; motion_sensor `{sensitivity, windowMs}`; webcam `{devicePath, deviceId, width, height, fps}`; microphone `{deviceId, sampleRate, gain}`; speaker `{audioDeviceId, volume, bass, treble}` | :637. Validates identity keys (645), deep-merges `config` (681-690), spreads the rest. 423 via `statusFor`. |
| Model tab | `POST .../api/parts/:id/model {modelId}`; `GET .../:id/effective` | ejs:2236, 2213 | :748 (top-level `modelId`), :884 (`MODEL_FILE_BY_TYPE` 814-827 has no `stepper`, F11) |
| Overrides | `POST .../api/parts/:id/overrides {overrides}` (blank field = `null` = delete) | ejs:2268, 2309 | :775, validates, null deletes key |
| Markers | `GET/POST .../:id/markers`, `POST .../:id/markers/:old/rename {newName}`, `DELETE .../:id/markers/:name` | ejs:4030, 4063, 4128, 4172 | :929-1069 |
| Delete part | `DELETE .../api/parts/:id` | ejs:4099, 546 | :711 |
| Standard servo positions | `POST .../api/standard_servo/:id/save-position`, `GET .../positions`, `POST .../positions/:name/update`, `DELETE .../positions/:name`, `GET .../status` | writes `data/calibration_profiles.json` key `<cid>:<id>` | :1330-1406, scoped by `resolveCharacter` |
| Continuous servo | `POST .../api/continuous_servo/:id/reset` | deletes the profile key | :1448 |
| Linear actuator | `POST .../api/linear_actuator/:id/save-position {position:'min'|'max'}`, `/reset`, `GET /status` | profile + `actuator-positions.json` | :1204-1300 |
| Mic gain (Controls tab slider and auto-tune) | `GET .../api/parts/:id` then `PUT .../api/parts/:id {config:{inputGainPercent}}` | ejs:3463-3467, 6551-6553 | PUT :637 (deep-merge) |
| Webcam models | `GET /setup/calibration/api/webcam/models` only (page is read-only here); POST/PUT/DELETE exist | global `data/models/webcam_models.json` | :1521-1525 |
| Webcam controls "Apply & Save" / Night Mode | `PUT .../api/webcam/parts/:id/controls/set {controls, persist:true}` | **not executed** (drives v4l2) | `controllers/webcamController.js:234-294`, persists to the SELECTED character (F8b) |

## 3. Matrix (identical results for character 3 and character 5)

Columns: Create / Read / Update-fields / Model / Overrides / Markers / Type-calibration save / Delete / Lock-423. "OK" means 200 and the value verified on disk in `data/character-N/parts.json` with the other config keys intact.

| Part type | Create | Read | Update-fields | Model | Overrides | Markers | Type-cal save | Delete | Lock-423 |
|---|---|---|---|---|---|---|---|---|---|
| servo (gpio, standard) | OK | OK | name, description, enabled:false, pin, servoType, controllerType, channel, address, pca9685Frequency all OK; foreign keys (`motionTracking`, `rotationRangeDeg`, `customNote`) survived the merge; `config.modelId` saved but list ignores it (**F6**); `invertDirection` accepted by server but never sent by the client (**F7**); channel 99 refused 400 | OK; effective resolves `servo_miuzei_25kg` | OK; `null` deleted `rotationRangeDeg`, `customNote`; `servoType:"bogus"` refused 400 | Min/Max/custom add, rename, GET, DELETE all OK; 200 deg on a 180 span refused 400; Min==Max refused 409 | save-position created key `3:16` only, preset `{angle:90, p:0.5, speed, duration}`, `autoGenerated:true`; positions list, update (speed 70), status (`placeholder:true`), delete all OK; profile removed by reset with no other key touched | OK (404 after) | 423 for PUT/DELETE/marker; create answers **500** (**F10**) |
| servo (pca9685, continuous) | OK, but **create accepted `servoType:"bogus"`, `channel:99`** (**F5**) | OK | n/a | n/a | n/a | n/a | reset with no profile: 200 "already clean"; standard save-position correctly 404 | OK | as above |
| continuous-servo (alias) | OK (no type check) | row never flags `needsCalibration` (**F12**) | OK | effective 200, no model mapping | n/a | n/a | n/a (routes exact-match `servo`) | OK | as above |
| continuous_servo (alias) | OK | same (**F12**) | OK | same | n/a | n/a | n/a | OK | as above |
| motor | OK | row lacks `controlBoard`, BTS pins, `maxDuration` (**F3**) | name, description, directionPin, pwmPin, controlBoard OK; `config.maxDuration` saved but top-level `maxDuration` (the Add-time value) unchanged and nothing reads either (**F1**); BTS7960 switch left `directionPin`/`pwmPin` on disk (**F2**) | OK (`motor_jeep_wagoneer_wiper`) | OK | OK | n/a | OK | as above |
| linear_actuator | OK | `needsCalibration:true` OK; row lacks limits/board (**F3**) | pins, controlBoard OK; **`config.maxExtension=12000`/`maxRetraction=9000` saved, top-level stays 15000 and the jog route reads top-level** (**F1**) | OK (`1759010196402`) | OK; null deleted `dwellMs` | OK | status 200 `exists:false`; reset 200; invalid position 400 with no write. save-position **not executed** (see section 6), code path honours `characterId` | OK | as above |
| linear-actuator (alias) | OK | never flags `needsCalibration` (**F12**) | OK | effective 200, no mapping | n/a | n/a | n/a | OK | as above |
| stepper | OK | step/dir/enable pins in row OK | pins, microstepping, stepsPerRevolution OK | model saved; **effective `model:null`** (**F11**) | OK | OK | n/a | OK | as above |
| light | OK | OK | pin, brightness, channel OK | OK (`relay_aceirmc_3v_1ch`) | OK; null deleted `brightness` | OK | n/a | OK | as above |
| led | OK | OK | same | OK (`led_standard_5mm`) | OK | OK | n/a | OK | as above |
| led_ring | OK via API; **Add modal cannot create one** (**F14**) | OK | all 7 geometry keys OK; `colors` and `palette` preserved (deep-merge contract holds, matches `tests/browser/calibration-led-gpio.spec.js`) | OK (`led_ring_diymall_x0040mb5ln_8bit`) | OK | OK | n/a | OK | as above |
| sensor | OK | OK | pin OK | OK (pir_generic, no `sensor_models.json` so effective resolves nothing, as designed) | OK | OK | n/a | OK | as above |
| motion_sensor | OK | OK | pin, sensitivity, windowMs OK | OK | OK | OK | n/a | OK | as above |
| speaker | OK | OK | audioDeviceId, volume, bass, treble OK (nothing reads volume/bass/treble, **F15**) | OK (`speaker_respeaker_xvf3800`) | OK (`sinkVolume`) | OK | n/a | OK | as above |
| microphone | OK | OK | deviceId, sampleRate, gain OK; Controls-tab GET-then-PUT `inputGainPercent:120` OK and kept the Edit keys; **two gain keys, Edit tab's is dead** (**F9**) | OK (`mic_respeaker_xvf3800`) | OK; null deleted `gain` | OK | n/a | OK | as above |
| webcam | OK | OK | devicePath, deviceId, width, height, fps OK | OK (`arducam-b0205`) | OK; null deleted `width` | OK | webcam models POST/GET/PUT/DELETE OK on the global registry; controls/set persist **not executed** (**F8b**) | OK | as above |
| head_tracking (modal only) | OK via API, **schema gate then fails** (**F4**) | OK | description OK | effective 200 | n/a | OK | n/a | OK | as above |

Generic: create without name 400; update/delete/model/marker on unknown id 404; model without `modelId` 400.

## 4. Findings, ranked by operator impact

### F1 (High) Linear-actuator limits (and motor timeout) save to a key the hardware never reads
- Evidence (char 3 part 16; same on char 5 part 5):
  - `POST /setup/calibration/api/parts?characterId=3 {"name":"QA-API-linact-mv3ahxc4","type":"linear_actuator","description":"qa actuator","controlBoard":"MDD10A","directionPin":22,"pwmPin":23,"maxExtension":15000,"maxRetraction":15000}` -> 200
  - `PUT /setup/calibration/api/parts/16?characterId=3 {"name":"QA-API-linact-mv3ahxc4-e","type":"linear_actuator","enabled":true,"description":"actuator edited","config":{"maxExtension":12000,"maxRetraction":9000,"controlBoard":"MDD10A"},"controlBoard":"MDD10A","directionPin":24,"pwmPin":25}` -> 200 `success:true`
  - Disk after: top-level `maxExtension:15000, maxRetraction:15000` (unchanged), `config.maxExtension:12000, config.maxRetraction:9000`.
  - Motor: top-level `maxDuration:10000` (Add) vs `config.maxDuration:5000` (Edit); no reader of either outside this route file.
- Cause: Add writes top-level (`calibration.ejs:4846-4849`), Edit writes `config.*` (`calibration.ejs:5401, 5407-5408`), the jog route reads top-level (`routes/setup/calibration.js:1117-1118`, `maxExtension: part.maxExtension || 15000`). The list row omits the top-level values (538-561), so `loadEditLinearActuatorValues` (`config.maxExtension || part.maxExtension || 15000`) shows the config value: the UI says 12000, the hardware runs 15000. This is the exact shape of "I saved it and it did not take".
- Fix (server, minimal): in the PUT after the merge (:690) hoist `maxExtension`, `maxRetraction`, `maxDuration` from `mergedConfig` to top-level when present; and make the jog/stop routes read `part.config?.maxExtension ?? part.maxExtension ?? 15000`. Add the three fields to the list row.

### F2 (High) Switching MDD10A to BTS7960 (or back) leaves the other board's pins on disk; GPIO-conflict detection ignores BTS pins
- Evidence: after `PUT ... {"config":{"maxDuration":5000,"controlBoard":"BTS7960"},"controlBoard":"BTS7960","rpwmPin":19,"lpwmPin":20,"renPin":24,"lenPin":25}` the part on disk is `{controlBoard:"BTS7960", rpwmPin:19, lpwmPin:20, renPin:24, lenPin:25, directionPin:22, pwmPin:23}`; the list row still reports `"directionPin":22,"pwmPin":23` and no BTS pins.
- Cause: `savePartChanges` nulls the inactive pins locally (`calibration.ejs:5251-5252, 5259-5262`) but only sends non-null values, and the server merge can only remove a key on an explicit `null` (:686). `pinsFor()` (:494-505) counts `pin/directionPin/pwmPin/stepPin/dirPin/enablePin` only, so the stale MDD10A pins produce false conflicts and real BTS collisions are never flagged.
- Fix: client sends explicit `null` for the inactive board's pins (the PUT spread persists null; the list row already coerces `|| null`); server `pinsFor()` adds `rpwmPin/lpwmPin/renPin/lenPin` and, for led_ring, `config.gpioPin`.

### F3 (High) The list row drops `controlBoard`, BTS pins and limits, and the page edits from the list row
- Evidence: list row for the BTS motor: `{"id":"5","type":"motor","config":{"maxDuration":5000,"controlBoard":"BTS7960"},"pin":null,"directionPin":22,"pwmPin":23,"stepPin":null,...}` (no `rpwmPin`, no top-level `controlBoard`, no `maxDuration`).
- Cause: row built at `routes/setup/calibration.js:538-561`. `selectPart()` takes `selected` from that list (`calibration.ejs:1059-1063, 1097-1102`). For a BTS7960 part created in the Add modal (where `controlBoard` is top-level only), `loadEditMotorValues` falls to `config.controlBoard` (absent) then infers from `part.rpwmPin` (absent) and shows MDD10A with blank pins; the next Save writes `controlBoard:"MDD10A"` (`calibration.ejs:5235-5238`), silently retyping the driver.
- Fix: add `controlBoard, rpwmPin, lpwmPin, renPin, lenPin, maxExtension, maxRetraction, maxDuration` to the row.

### F4 (High) The Add modal offers `head_tracking`, which the schema gate refuses
- Evidence: `POST ... {"name":"QA-API-ht-mv3ahxc4","type":"head_tracking","description":"modal offers it"}` -> 200. `node scripts/validate-schemas.mjs` -> exit 1: `character-3/parts.json: [12].type - enum: value "head_tracking" not in enum [...]` (character-5 `[4]` likewise). Gate step 1 (`validate:schemas`) then blocks every commit and push on that node until the part is deleted.
- Cause: `partTypes` (`calibration.ejs:4218`) vs `config/schemas/parts.schema.json` enum. No fleet `parts.json` contains one today; head tracking is a super-power config, not a part.
- Fix: remove `head_tracking` from `partTypes` and the dead Controls renderer (`calibration.ejs:3783`), or add it to the enum if a head_tracking part is intended.

### F5 (Medium) Create accepts identity values that Update refuses
- Evidence: `POST ... {"config":{"servoType":"bogus","controllerType":"pca9685","channel":99}}` -> 200 and persisted; `PUT ... {"config":{"channel":99}}` -> 400 `Invalid channel "99"`; overrides `servoType:"bogus"` -> 400.
- Cause: `router.post('/api/parts')` (:574-612) never calls `validatePartConfigPatch`; PUT (:645) and overrides (:787) do.
- Fix: after :578, `const v = validatePartConfigPatch(payload.config); if (!v.ok) return res.status(400).json({ success:false, error: v.error });`

### F6 (Medium) Edit-tab servo model is saved where the list cannot see it ("Needs Model" never clears)
- Evidence: PUT with `config.modelId:"servo_miuzei_25kg"` -> disk `config.modelId` set; list row `modelId:null, needsModel:true`; `/effective` does resolve it (reads `part.modelId || part.config?.modelId`, :890).
- Cause: client `calibration.ejs:5385` writes `config.modelId`; list reads only top-level (:542, :559); the Model tab's `POST /model` writes top-level (:764). The Models page "Apply model" has the same symptom (`views/setup/models.ejs:667-670` writes `config.modelId`).
- Fix: list row `modelId: p.modelId || (p.config && p.config.modelId) || null` and `needsModel` likewise; or hoist `config.modelId` to top-level in the PUT when `updates.modelId` is absent.

### F7 (Medium) Edit-tab servo "Invert direction" never saves (and for servos would not be read)
- Evidence: server accepts it (PUT with `config.invertDirection:true` landed), but the page never sends it.
- Cause: `#editInvertDirection` is a `<select>` (`calibration.ejs:5642`) read with `.checked` (:5376) -> `undefined` -> dropped (:5384). For servos the drive path honours the PROFILE flag set by `POST /api/calibration/:id/set-invert` (`server/calibration/router.js:1017-1025`); `config.invertDirection` is consumed only for motor/linear_actuator (`services/hardwareService/index.js:435-464`), where the Edit tab has no such control.
- Fix: read `.value === 'true'`; better, drop the servo control (the Controls-tab Invert already writes the profile) and expose `invertDirection` on the motor/linear_actuator Edit cards where the runtime reads it.

### F8 (Medium, code-verified, not executed) Two persistence paths still write the SELECTED character regardless of `?characterId`
- a. `PUT /api/parts/:id` (`routes/api/partsApi.js:436-471`) uses `cfg.selectedCharacter` (:449). Callers: Models page `views/setup/models.ejs:667, 702`. Applying a model to Orlok's part 1 from the Models page while Mina is selected writes Mina's part 1. Not called (would have written character 2).
- b. `webcamController.setControls` (`controllers/webcamController.js:234-294`) persists `config.controls` through `loadParts()` -> `selectedCharacter` (:24-26). The Calibration page's "Apply & Save" and Night Mode send `persist:true` (`calibration.ejs:3742, 3771`) with no `characterId`. Not called (drives v4l2).
- Fix: resolve the character like `loadCharacterParts()` does (`resolveCharacter(req)`), and have the page pass `characterId`.

### F9 (Medium) Microphone has two gain keys; the Edit tab's is dead
- Evidence: after the Edit save and the Controls slider save the part reads `{deviceId:"hw:9,0", sampleRate:16000, gain:70, inputGainPercent:120}`.
- Cause: Edit writes `config.gain` 0-100 (`calibration.ejs:5473-5476`); the slider and auto-tune write `config.inputGainPercent` 0-200 (:3467, :6553); `server.js:198-205` restores only `inputGainPercent` at boot.
- Fix: make `#editGain` read/write `inputGainPercent` (range 0-200) or remove the field.

### F10 (Medium) Create on a locked character answers 500, not 423
- Evidence: `POST /setup/calibration/api/parts?characterId=1 {"name":"QA-API-locked-mv3ak84a","type":"light","description":"must be refused","pin":25}` -> **500** `{"success":false,"error":"Failed to create part","message":"PumpkinHead (character 1) is LOCKED ..."}`; identical for character 4. Files untouched (md5). PUT, DELETE, markers on both locked characters -> 423 with `code:"CHARACTER_CONFIG_LOCKED"`.
- Cause: `routes/setup/calibration.js:606` uses `res.status(500)` and omits `code`; every sibling uses `statusFor(error)`.
- Fix: `res.status(statusFor(error)).json({ success:false, error: error.message || 'Failed to create part', code: error.code, message: error.message })`.

### F11 (Low) Stepper model never resolves in `/effective`
- Evidence: `POST /model {"modelId":"motor_stepperonline_nema17_59ncm"}` -> 200; `GET /effective` -> `model:null, modelDefaults:{}`.
- Cause: `MODEL_FILE_BY_TYPE` (:814-827) has no `stepper`; the Add modal loads stepper models from `/setup/models/api/motor` (`calibration.ejs:4271`).
- Fix: add `stepper: 'motor_models.json'`.

### F12 (Low) Alias type spellings are schema-valid but second-class
- Evidence: `continuous-servo`, `continuous_servo`, `linear-actuator` create and update fine, but the row never flags `needsCalibration` (exact matches at :513, :526), save-position/status answer 404 (:1218, :1337), and the Edit tab renders "No specific configuration options". No fleet file uses them today.
- Fix: normalise `type` on read in `loadCharacterParts()` (`toLowerCase().replace('-', '_')`, mapping `continuous_servo` to `servo` + `servoType:'continuous'`), or drop the aliases from the enum.

### F13 (Low, latent) Calibration store delete falls back to a bare legacy key
- `server/calibration/store.js:370` and `:391`: when `<cid>:<id>` is absent the delete targets bare `"<id>"`, whichever character wrote it. All 23 keys on this node are scoped, so it is dormant; a reset for a part with no scoped profile could erase another character's legacy profile.
- Fix: fall back to the bare key only when `cid == null`.

### F14 (Low) The Add modal cannot create an `led_ring`
- `partTypes` (`calibration.ejs:4206-4218`) has no `led_ring`; the API accepts the type and the Edit tab has a full geometry card. Fix: add `led_ring` to `partTypes` with `gpioPin`/`pixelCount` fields.

### F15 (Low) Speaker `volume/bass/treble` persist but nothing reads them
- Saved correctly; no reader in `services/`, `routes/`, `server.js`. Master volume lives in `config/animatronics.json` (`sinkVolume`). UI-honesty issue, not persistence.

## 5. Rule-4 finding: which `/api/calibration` routes honour `characterId` (code, not executed)

`server/calibration/router.js`:
- `getOrAutoCreateProfile(partId)` (:190-347) calls `store.getRaw(partId)` with no character (:196); the store then resolves `selectedCharacter` (`store.js:306-307, 57-64`). It loads parts with the global/selected `loadParts()` (:208, :237, :268, :288) and upserts without a character (:228, :250, :279, :347). It is a WRITER on a read: `GET /:partId/profile` (:356) auto-creates a profile for the selected character.
- Selected-character only, `?characterId` ignored for the profile: `GET /:partId/profile` (:356), `GET /:partId/position` (:365), `POST /:partId/profile` (:386; `getRaw(partId)` :395, `upsert(profile)` :441; a BODY `characterId` would scope the key via `store.upsert`'s `profile.characterId` fallback, `store.js:339-341`, but the `existing` lookup stays unscoped), `set-min` (:923-926), `set-max` (:972-975), `set-invert` (:1017-1025), `learn-openloop` (:1032-1054), and the profile side of `nudge/goto/home/jog-raw` (their POSITION persistence does use `resolveCharacter`).
- `POST /:partId/calibrated` (:461-514) honours `body.characterId` (:470, :472, :514), ignores the query param; the page sends only `{calibrated}` (`calibration.ejs:1496-1499`).
- `DELETE /:partId/profile` (:1135-1145) and `POST /clear-all` (:1161-1180) use `resolveCharacter(req)` and honour `?characterId`.
- `persistPosition()` (:132-143) calls `actuatorPositionStore.markStopped(key, currentP)` with no character (:143).

So a write for "character 3 part 1" through profile/set-invert/set-min/set-max lands on key `2:1` while Mina is selected: the caution was correct. The page itself is safe only because `routes/setup/calibration.js:447-451` redirects any `?characterId` that is not the selected one.

## 6. Not executed, and why

- Hardware movers and probes: `/api/parts/:id/test`, `/api/calibration/:id/{goto,nudge,home,jog-raw,stop,release,set-min,set-max,learn-openloop,set-invert,calibrated,profile}`, `/api/linear_actuator/:id/{jog,stop}`, webcam `controls/set`, `apply-device`, motion-tracking start/stop/head-tracking, `set-input-gain`, `/api/system/power`.
- `POST /api/linear_actuator/:id/save-position`: writes `autoGenerated:false` (its later removal would drop a snapshot into `data/calibration-backups/`) and `actuator-positions.json` through `markStopped` (no delete API), so it would leave permanent residue in two shared files. Code path (:1204-1240): `resolveCharacter(req)` -> `linearActuatorCalibration.savePosition(..., characterId)` (:192-218) -> `mutateProfile(partId, characterId)` + `markStopped(partId, endP, storeScope(characterId))`. It honours `?characterId`.
- `POST /api/webcam/motion-tracking/params` does not persist to `parts.json` (`controllers/motionTrackingController.js:245-300` has no write), so it is not a settings surface.

## 7. Restoration proof

Snapshot taken before the first write to `/tmp/claude-1000/-home-remote-MonsterBox/a9ea956d-c217-4abd-bed9-86493eae93bc/scratchpad/crud-api-snapshot/`; restored with `cp -p` and verified:

```
character-3/ai_agent_state.json: OK        character-3/gestures.json: OK
character-3/linear_actuator_calibrations.json: OK   character-3/lurk-mode-state.json: OK
character-3/manual-controls-layout.json: OK   character-3/motion-armed-state.json: OK
character-3/movement-config.json: OK       character-3/parts.json: OK (2ab4a1fd3b08759cde3f2991ae2d77cd)
character-3/poses.json: OK                 character-3/scenes.json: OK
character-3/servo_calibrations.json: OK    character-3/servos.json: OK
character-3/super-powers.json: OK
character-5/linear_actuator_calibrations.json: OK   character-5/movement-config.json: OK
character-5/parts.json: OK (f1d1df08c8889c306a0adc21caed32e3)   character-5/poses.json: OK
character-5/scenes.json: OK   character-5/servo_calibrations.json: OK   character-5/super-powers.json: OK
character-1/parts.json: OK (db8c38ba8dd10352cfc45cbfabac16b7)
character-4/parts.json: OK (30f8c98500c5b1b0dbe6aa99426b767d)
data/models/webcam_models.json: 8198ead23ae8e3c3c623cd2d98de5075 before and after
```

Whole-tree md5 diff of `data/*.json` and `data/character-*/**/*.json` against the pre-run baseline: the only changed file is `./actuator-positions.json` (character-2 runtime; keys are `2:1..2:4` only, no `3:` or `5:` key was ever written). `data/calibration_profiles.json` is byte-identical to the baseline (23 scoped keys; the throwaway `3:16` was created and removed inside the run). `data/calibration-backups/` holds only its 2026-09-27 file. The untracked entries in `git status` (`data/character-1/character-1/`, `data/character-1/characters.json`, `data/character-2/lurk-*.json`) predate the run. `config/app-config.json` untouched; selected character 2 throughout.

## 8. Artifacts

Harness and JSONL transcripts (every request, status, body, per-write file diff, every check with evidence) in the scratchpad: `crud-harness.mjs`, `crud-log-3-mv3ahxc4.jsonl`, `crud-log-5-mv3aipaf.jsonl`, `crud-log-lock-mv3ak84a.jsonl`, and the matching `*-results.json`.
