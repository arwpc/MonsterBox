# 🚀 Unified Calibration v1.5 - Deployment Summary

**PR Title**: `feat(calibration): replace legacy calibration with Unified Positions v1.5`  
**Status**: ✅ Core Complete | ⚠️ UI & Tests Pending  
**Date**: 2025-10-22  
**Branch**: main

---

## ✅ What Has Been Completed

### 1. Infrastructure & Safety ✅
- **CI Guard**: `scripts/ensure-no-legacy-calibration.mjs` blocks legacy patterns
- **ESLint Rule**: `eslint-rules/no-legacy-calibration.js` bans legacy identifiers
- **Package.json**: Added `pretest` hook to run guard automatically
- **Migration Script**: `scripts/migrate-calibration-v15.mjs` ready to run

### 2. Core System ✅
- **Data Models**: Complete TypeScript interfaces in `server/calibration/models.ts`
- **Storage**: JSON-based store in `server/calibration/store.ts`
- **Adapters**: Hardware wrappers for servos and linear actuators
- **Motion Planner**: Direct-map and time-at-speed algorithms
- **API Router**: Full REST API with 10+ endpoints
- **Server Integration**: Router mounted at `/api/calibration`

### 3. Files Created ✅
```
server/calibration/
├── models.ts                           # Type definitions
├── store.ts                            # JSON storage layer
├── planner.ts                          # Motion planning
├── router.ts                           # REST API
└── adapters/
    ├── index.ts                        # Interfaces
    ├── AbsoluteServoAdapter.ts         # Servo adapter
    └── OpenLoopLinearAdapter.ts        # Linear/motor adapter

scripts/
├── ensure-no-legacy-calibration.mjs    # CI guard
└── migrate-calibration-v15.mjs         # Data migration

eslint-rules/
└── no-legacy-calibration.js            # ESLint rule

UNIFIED-CALIBRATION-V15-STATUS.md       # Detailed status
```

---

## ⚠️ What Needs To Be Done

### CRITICAL: Complete Before Testing

#### 1. Run Migration (5 min)
```bash
npm run migrate:calibration
```
This creates `data/calibration_profiles.json` from existing data.

#### 2. Build UI (2-3 hours)
**File**: `views/setup/unified-calibration.ejs`

**Required Elements**:
- Part selector dropdown
- E-STOP button (calls `/api/calibration/:id/stop`)
- Global Speed Cap slider (0-100%)
- Jog controls:
  - Nudge − (fine/med/coarse)
  - STOP button
  - Nudge + (fine/med/coarse)
- Bounds:
  - **Set Min** button
  - **Set Max** button
  - Display current bounds
- Presets:
  - **Set Here** (name) → saves current position
  - List of presets with **Go** / **Rename** / **Delete**
- Learn Move panel (for open-loop only):
  - 3 probe inputs (30%/50%/70% PWM)
  - Run probes button
  - Predicted vs measured time display
  - **Refit** button

**API Calls**:
```javascript
// Nudge
POST /api/calibration/:id/nudge { dir: 'min|max', scale: 'fine|med|coarse' }

// Stop
POST /api/calibration/:id/stop {}

// Go to position
POST /api/calibration/:id/goto { p: 0.5, speedPct: 50 }

// Set bounds
POST /api/calibration/:id/set-min {}
POST /api/calibration/:id/set-max {}

// Learn open-loop
POST /api/calibration/:id/learn-openloop { probes: [...] }

// Get/save profile
GET /api/calibration/:id/profile
POST /api/calibration/:id/profile { ...profile }
```

#### 3. Add Route for UI (5 min)
**File**: `routes/setup/calibration.js`

Add near the top:
```javascript
router.get('/unified', async (req, res) => {
  try {
    const parts = await loadParts();
    res.renderWithLayout('setup/unified-calibration', {
      title: 'Unified Calibration - MonsterBox 5.3',
      page: 'setup-calibration-unified',
      parts,
      testMode: process.env.MB_TEST_MODE === '1'
    });
  } catch (error) {
    console.error('Error rendering unified calibration:', error);
    res.status(500).render('error', {
      title: 'Error',
      error: 'Failed to load calibration page',
      message: error.message
    });
  }
});
```

#### 4. Update Playwright Config (5 min)
**File**: `playwright.config.ts`

Make Chrome CDP the default:
```typescript
projects: [
  {
    name: 'chrome-cdp',
    use: {
      connectOptions: { wsEndpoint: process.env.CDP_WS || 'ws://localhost:9222' },
      browserName: 'chromium',
      headless: true
    }
  },
  {
    name: 'firefox',
    use: { browserName: 'firefox', headless: true }
  }
]
```

---

## 🧪 Testing Plan

### Manual Testing (30 min)
1. Start server: `npm start`
2. Navigate to `/setup/calibration/unified`
3. Select a servo part
4. **Jog** to min position → click **Set Min**
5. **Jog** to max position → click **Set Max**
6. Click **Set Here**, name "Rest", save
7. Jog to different position
8. Click **Set Here**, name "Action", save
9. Click **Go** on "Rest" preset → verify movement
10. Click **Go** on "Action" preset → verify movement

### Automated Tests (Optional, 1-2 hours)
- **Unit**: `tests/unit/calibration/planner.spec.ts`
- **E2E**: `tests/e2e/calibration.spec.ts`

Run with: `npm run verify`

---

## 🗑️ Legacy Removal (After Validation)

**DO NOT DELETE until new system is validated on real hardware!**

Once confirmed working:
```bash
# Delete legacy services
rm services/simpleCalibrationService.js
rm services/continuousServoCalibrationService.js
rm services/standardServoCalibrationService.js
rm services/linearActuatorCalibrationService.js

# Delete legacy views
rm views/setup/calibration-linear-actuator.ejs
rm views/setup/calibration-standard-servo.ejs
rm views/setup/calibration-continuous-servo.ejs

# Remove legacy routes from routes/setup/calibration.js
# (Lines ~450-900, all the servo/actuator specific routes)
```

Then run: `npm test` to verify guard catches any remaining references.

---

## 📊 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/calibration/:id/profile` | Get calibration profile |
| POST | `/api/calibration/:id/profile` | Save calibration profile |
| POST | `/api/calibration/:id/nudge` | Jog part (fine/med/coarse) |
| POST | `/api/calibration/:id/stop` | Emergency stop |
| POST | `/api/calibration/:id/goto` | Move to position [0..1] |
| POST | `/api/calibration/:id/set-min` | Set min bound to current |
| POST | `/api/calibration/:id/set-max` | Set max bound to current |
| POST | `/api/calibration/:id/learn-openloop` | Learn motion bins |
| GET | `/api/calibration/:id/sensors` | Read limit switches, etc. |
| POST | `/api/calibration/global-speed-cap` | Set global speed limit |
| GET | `/api/calibration/global-speed-cap` | Get global speed limit |

### Example: Nudge Request
```json
POST /api/calibration/1/nudge
{
  "dir": "max",
  "scale": "fine"
}
```

### Example: Go To Position
```json
POST /api/calibration/1/goto
{
  "p": 0.75,
  "speedPct": 50
}
```

### Example: Save Profile
```json
POST /api/calibration/1/profile
{
  "partId": 1,
  "capability": { "kind": "absolute-servo", "usMin": 500, "usMax": 2500 },
  "bounds": { "minP": 0, "maxP": 1 },
  "presets": [
    { "name": "Rest", "p": 0 },
    { "name": "Action", "p": 1 }
  ],
  "motion": { "type": "direct-map" },
  "version": 1
}
```

---

## 🛡️ Safety Features

1. **E-STOP**: Prominent button calls `/api/calibration/:id/stop`
2. **Global Speed Cap**: Defaults to 50%, max 100%
3. **Bounds Clamping**: All movements respect minP/maxP
4. **Timeouts**: Auto-stop if movement exceeds estimated time * 2 + 500ms
5. **Adapter Pattern**: Wraps existing hardware service, no GPIO changes

---

## 🐛 Troubleshooting

### Issue: API returns 404
**Solution**: Ensure server.js has `app.use('/api/calibration', calibrationApiRouter);`

### Issue: TypeScript errors
**Solution**: The project uses `.ts` files with JSDoc comments for types. If you see type errors, they're informational and won't prevent runtime operation.

### Issue: Part doesn't move
**Solution**:
1. Check part is enabled in `/setup/parts`
2. Verify GPIO pins are correct
3. Check hardware service logs
4. Test with legacy calibration first to isolate hardware issues

### Issue: "Profile not found"
**Solution**: Run `npm run migrate:calibration` to create profiles for existing parts.

---

## 📈 Success Criteria

- [ ] Migration completes without errors
- [ ] UI loads at `/setup/calibration/unified`
- [ ] Can jog a servo part
- [ ] Can set Min and Max bounds
- [ ] Can save and recall presets
- [ ] E-STOP immediately stops movement
- [ ] Legacy guard passes: `node scripts/ensure-no-legacy-calibration.mjs`
- [ ] Tests pass: `npm run verify`

---

## 🎯 Next Immediate Actions

1. **Run Migration**: `npm run migrate:calibration`
2. **Test API**: Use Postman or curl to test `/api/calibration/1/profile`
3. **Build UI**: Create `views/setup/unified-calibration.ejs`
4. **Manual Test**: Validate on one servo before deploying to all parts

---

**Questions?** Check `UNIFIED-CALIBRATION-V15-STATUS.md` for detailed technical specs.

**Ready to proceed?** Start with the migration, then build the UI.
