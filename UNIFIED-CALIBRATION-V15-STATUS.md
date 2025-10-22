# Unified Positions v1.5 - Implementation Summary

**Status**: Core Infrastructure Complete, UI and Tests In Progress  
**Date**: 2025-10-22  
**MonsterBox Version**: 5.3

## ✅ Completed Components

### 1. CI Guards & Safety (100%)
- ✅ `scripts/ensure-no-legacy-calibration.mjs` - Blocks legacy code patterns
- ✅ `eslint-rules/no-legacy-calibration.js` - ESLint rule to ban legacy identifiers
- ✅ `package.json` - Wired `pretest` hook to run guard
- ✅ Added `migrate:calibration` script

### 2. Data Models (100%)
- ✅ `server/calibration/models.ts` - Complete TypeScript interfaces
  - `PositionPreset`, `CalibrationBounds`, `CapabilityProfile`
  - `MotionModel` (direct-map & time-at-speed)
  - `CalibrationProfile`, `SafetyConstraints`
  - `MotionCommand`, `NudgeCommand`, `SensorReadings`

### 3. Storage Layer (100%)
- ✅ `server/calibration/store.ts` - JSON file-based storage
  - Stores profiles in `data/calibration_profiles.json`
  - CRUD operations: get, upsert, list, delete
  - Singleton pattern with `getCalibrationStore()`

### 4. Hardware Adapters (100%)
- ✅ `server/calibration/adapters/index.ts` - Base interfaces
- ✅ `server/calibration/adapters/AbsoluteServoAdapter.ts`
  - Maps normalized position [0..1] → µs pulse widths
  - Implements nudge, stop, gotoNormalized
- ✅ `server/calibration/adapters/OpenLoopLinearAdapter.ts`
  - Time-at-speed motion estimation
  - Reversal compensation support
  - Bin selection for PWM control

### 5. Motion Planner (100%)
- ✅ `server/calibration/planner.ts`
  - `planDirectMap()` - For servos/steppers
  - `planTimeAtSpeed()` - For open-loop/DC motors
  - Global speed cap enforcement
  - Boundary clamping with `clampP()`
  - Timeout calculation

### 6. API Router (100%)
- ✅ `server/calibration/router.ts` - Complete REST API
  - `GET /:partId/profile` - Retrieve profile
  - `POST /:partId/profile` - Upsert profile
  - `POST /:partId/nudge` - Jog part
  - `POST /:partId/stop` - Emergency stop
  - `POST /:partId/goto` - Move to position
  - `POST /:partId/set-min` / `set-max` - Set bounds
  - `POST /:partId/learn-openloop` - Learn motion bins
  - `GET /:partId/sensors` - Read feedback
  - `POST /global-speed-cap` - Set speed limit
  - `GET /global-speed-cap` - Get speed limit

### 7. Migration Script (100%)
- ✅ `scripts/migrate-calibration-v15.mjs`
  - Migrates `simple_calibrations.json` → `calibration_profiles.json`
  - Creates default profiles for all parts
  - Preserves legacy named points and bounds

---

## 🚧 Remaining Tasks

### 8. Server Integration (NOT STARTED)
**File**: `server.js`
**Action**: Mount calibration router
```javascript
import calibrationRouter from './server/calibration/router.js';
app.use('/api/calibration', calibrationRouter);
```

### 9. UI Implementation (NOT STARTED)
**File**: `views/setup/unified-calibration.ejs`
**Requirements**:
- Header with E-STOP, Power Enable, Global Speed Cap slider
- Part selector dropdown
- Jog pad: Nudge − / Stop / Nudge + (fine/med/coarse)
- **Set Min**, **Set Max**, **Set Here** (name) buttons
- Presets list with Go/Rename/Delete
- **Learn Move** panel for open-loop (3 probes at 30/50/70% PWM)
- Speaker tab (test tone, sink selection)
- Real-time position display

**Route**: Need to add route in `routes/setup/calibration.js`:
```javascript
router.get('/unified', (req, res) => {
  res.renderWithLayout('setup/unified-calibration', { ... });
});
```

### 10. Unit Tests (NOT STARTED)
**Directory**: `tests/unit/calibration/`
**Files Needed**:
- `planner.spec.ts` - Test direct-map and time-at-speed planning
- `adapters.spec.ts` - Test servo and linear adapters
- `store.spec.ts` - Test CRUD operations

**Coverage Requirements**:
- Direct-map: p→µs/steps mapping, clamping, invert
- Time-at-speed: bin selection, reversal compensation, timing accuracy
- Bounds: clampP() enforces min/max

### 11. E2E Tests (NOT STARTED)
**File**: `tests/e2e/calibration.spec.ts`
**Requirements**:
- Open `/setup/calibration/unified`
- Set Min/Max for a test part
- Add "Rest"/"Action" presets
- Click **Go** and verify `POST /api/calibration/:id/goto`
- For open-loop: run Learn Move with 3 probes, verify time error < 10%

### 12. Playwright Config (NOT STARTED)
**File**: `playwright.config.ts`
**Action**: Make Chrome CDP the default project
```typescript
projects: [
  {
    name: 'chrome-cdp',
    use: {
      connectOptions: { wsEndpoint: process.env.CDP_WS! },
      browserName: 'chromium',
      headless: true
    }
  },
  { name: 'firefox', use: { browserName: 'firefox', headless: true } }
]
```

### 13. Legacy Code Removal (NOT STARTED)
**Files to Delete**:
- `services/simpleCalibrationService.js`
- `services/continuousServoCalibrationService.js`
- `services/standardServoCalibrationService.js`
- `services/linearActuatorCalibrationService.js`
- `views/setup/calibration-linear-actuator.ejs`
- `views/setup/calibration-standard-servo.ejs`
- `views/setup/calibration-continuous-servo.ejs`
- Legacy routes in `routes/setup/calibration.js` (lines ~450-900+)

**Action**: After new system is validated, delete these files and routes.

### 14. Legacy Ban Test (NOT STARTED)
**File**: `tests/legacy/legacy-calibration-ban.spec.ts`
**Action**: Shell out to `ensure-no-legacy-calibration.mjs`, expect exit code 0

---

## 🎯 Next Steps (Priority Order)

1. **Mount Router** - Add 2 lines to `server.js` to enable API
2. **Run Migration** - Execute `npm run migrate:calibration`
3. **Create Basic UI** - Minimal working UI for testing
4. **Write Unit Tests** - Validate planner and adapters
5. **Configure Playwright** - Set Chrome CDP as default
6. **Write E2E Test** - Validate end-to-end flow
7. **Remove Legacy** - Delete old calibration code
8. **Run Verification** - `npm run verify`

---

## 📋 File Checklist

### Created ✅
- ✅ scripts/ensure-no-legacy-calibration.mjs
- ✅ eslint-rules/no-legacy-calibration.js
- ✅ server/calibration/models.ts
- ✅ server/calibration/store.ts
- ✅ server/calibration/adapters/index.ts
- ✅ server/calibration/adapters/AbsoluteServoAdapter.ts
- ✅ server/calibration/adapters/OpenLoopLinearAdapter.ts
- ✅ server/calibration/planner.ts
- ✅ server/calibration/router.ts
- ✅ scripts/migrate-calibration-v15.mjs

### Pending ⏳
- ⏳ views/setup/unified-calibration.ejs
- ⏳ tests/unit/calibration/planner.spec.ts
- ⏳ tests/unit/calibration/adapters.spec.ts
- ⏳ tests/unit/calibration/store.spec.ts
- ⏳ tests/e2e/calibration.spec.ts
- ⏳ tests/legacy/legacy-calibration-ban.spec.ts

### Modified ✅
- ✅ package.json (added pretest, migrate:calibration)

### To Modify ⏳
- ⏳ server.js (mount router)
- ⏳ playwright.config.ts (Chrome CDP default)
- ⏳ routes/setup/calibration.js (add /unified route or deprecate)

### To Delete 🗑️
- 🗑️ services/simpleCalibrationService.js
- 🗑️ services/continuousServoCalibrationService.js
- 🗑️ services/standardServoCalibrationService.js
- 🗑️ services/linearActuatorCalibrationService.js
- 🗑️ views/setup/calibration-*.ejs (3 files)
- 🗑️ Legacy routes in routes/setup/calibration.js

---

## 🛡️ Safety Notes

1. **E-STOP**: UI must have prominent E-STOP that calls `/api/calibration/:id/stop`
2. **Global Speed Cap**: Default to 50% for first run, adjustable
3. **Bounds Enforcement**: All movements clamped to [minP, maxP]
4. **Timeout**: Movements abort if exceed `estimatedTime * 2 + 500ms`
5. **Hardware Reuse**: Adapters wrap existing `hardwareService`, no low-level changes

---

## 🧪 Testing Strategy

### Unit Tests (Mocha)
Run with: `npm run test:unit`
- Mock hardware service calls
- Validate math (p→µs, time calculations)
- Test boundary conditions

### E2E Tests (Playwright)
Run with: `npm run test:e2e`
- Real browser automation
- Click jog buttons, verify API calls
- Validate UI state updates

### Manual Testing
1. Select a servo part
2. Jog to min position → Set Min
3. Jog to max position → Set Max
4. Add preset "Rest" at 0.0
5. Add preset "Action" at 1.0
6. Click "Go" on "Action" → verify movement

---

## 📚 Documentation Updates Needed

- [ ] Update `docs/README.md` - Add Unified Calibration section
- [ ] Create `docs/UNIFIED-CALIBRATION-V15.md` - Full guide
- [ ] Update `docs/config.md` - Add calibration_profiles.json
- [ ] Update character setup guides - Reference new calibration UI

---

## 🚀 Deployment Checklist

Before deploying to production:
- [ ] Run `npm run migrate:calibration`
- [ ] Backup existing `data/simple_calibrations.json`
- [ ] Test on non-critical animatronic first
- [ ] Validate jaw tracking still clamps to min/max
- [ ] Verify no GPIO conflicts or unexpected movements
- [ ] Monitor logs for errors during first calibration session

---

**Status**: Ready for server integration and UI development.
**Risk Level**: Medium (hardware control changes, thorough testing required)
**Estimated Completion**: 4-6 hours for UI + tests + validation
