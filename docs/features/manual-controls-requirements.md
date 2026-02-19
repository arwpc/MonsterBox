# MonsterBox 6.3.0 — Feature Requirements & Verification Checklist

This document captures ALL feature requirements from the last 3 development sessions.
Use it to systematically verify that every feature is implemented and working.

---

## A. Manual Controls Panel (NEW — Primary Feature)

The Manual Controls panel is a spatial, drag-and-drop control surface on the dashboard (`/`)
for live animatronic operation. The operator sees the webcam feed, arranges control tiles
to match the animatronic's body layout, and clicks tiles to fire hardware commands in real-time.

### A.1 Files

| File | Purpose |
|------|---------|
| `public/js/manual-controls.js` | Client-side module: `window.ManualControls = { init, reload, destroy }` |
| `public/css/manual-controls.css` | Styles for canvas, items, directional controls, drawer |
| `views/conversation/index.ejs` | Dashboard HTML — Manual Controls card between webcam and controls rows |
| `routes/conversation.js` | Backend — 4 layout CRUD endpoints (GET/POST/DELETE + rename) |

### A.2 Three Tile Types

- [ ] **Part tiles** (`.mc-part`) — hardware parts with colored left border by type:
  - [ ] Servo: blue (`var(--bs-primary)`)
  - [ ] Linear actuator: orange (`var(--bs-warning)`)
  - [ ] Motor/Stepper: green (`var(--bs-success)`)
  - [ ] Light/LED: yellow (`#ffc107`)
  - [ ] Motion sensor: red (`var(--bs-danger)`)
  - [ ] Shows part name + type badge + mini position bar (servos only)
- [ ] **Pose tiles** (`.mc-pose`) — purple left border, play icon, click to execute
- [ ] **Sound tiles** (`.mc-sound`) — teal left border, speaker icon, duration badge, click to play

### A.3 Parts Must Appear in Drawer

- [ ] Parts API response handled correctly — supports BOTH raw array AND `{ success, parts }` wrapper
- [ ] Filtered to movable types: `servo`, `linear_actuator`, `motor`, `stepper`, `light`, `led`, `motion_sensor`
- [ ] Excluded types: `speaker`, `microphone`, `webcam`, `head_tracking`, `pipewire`
- [ ] Parts appear in Edit Mode drawer alongside Poses and Audio sections
- [ ] Each section shows count of unplaced items

### A.4 Directional Controls (Floating Toolbar)

When a part tile is clicked in Show Mode, a floating toolbar appears at top-right of canvas
with controls specific to the part type:

- [ ] **Standard servo**: Up (+0.1) / Down (-0.1) nudge buttons + Min/Mid/Max goto buttons + position display
- [ ] **Continuous servo**: CCW / Stop / CW buttons
- [ ] **Linear actuator**: Extend / Stop / Retract buttons
- [ ] **Motor/Stepper**: Forward / Stop / Reverse buttons
- [ ] **Light/LED**: Toggle on/off button
- [ ] Position display updates after nudge/goto operations
- [ ] Mini position bar on servo tiles updates in real-time
- [ ] Deselect button (X) hides directional controls
- [ ] Clicking canvas background deselects part

### A.5 Hardware Command APIs (all existing, no new endpoints)

- [ ] `POST /api/calibration/{partId}/nudge` — `{ delta: ±0.1 }` returns `{ currentP }`
- [ ] `POST /api/calibration/{partId}/goto` — `{ p: 0|0.5|1 }` returns `{ targetP }`
- [ ] `POST /api/calibration/{partId}/stop` — stop continuous motion
- [ ] `GET /api/calibration/{partId}/position` — get current position
- [ ] `POST /api/parts/{id}/test` — motors (`{ action: "control", params: {...} }`), lights (`{ action: "toggle" }`)
- [ ] `POST /poses/{id}/execute` — execute pose
- [ ] `POST /conversation/api/play-audio` — `{ audioId }` play audio file
- [ ] All commands are fire-and-forget (no await in click handlers)

### A.6 Two Modes

- [ ] **Show Mode** (default): Items NOT draggable; click part = select (show directional controls); click pose/sound = fire immediately
- [ ] **Edit Mode** (toggle via "Edit Layout" button): Items become draggable via Pointer Events; "Add Items" drawer appears; clicking items does NOT fire actions
- [ ] Edit toggle button changes style (outline-warning <-> warning + active)
- [ ] Canvas border changes to yellow in edit mode
- [ ] Items get dashed border and grab cursor in edit mode
- [ ] Remove button (X) appears on items in edit mode only

### A.7 Pointer-Event Drag (Edit Mode)

- [ ] Uses Pointer Events (NOT HTML5 Drag and Drop) — works on touch devices
- [ ] `pointerdown` → capture pointer, track offset
- [ ] `pointermove` → update left/top, clamped to canvas bounds
- [ ] `pointerup` → release capture, debounce save (500ms)
- [ ] `touch-action: none` on canvas prevents scroll interference

### A.8 Named Layouts

- [ ] Layout selector dropdown in card header
- [ ] New layout button (+) — prompts for name, creates empty layout
- [ ] Rename layout button (pencil) — prompts for new name
- [ ] Delete layout button (trash) — confirms, cannot delete last layout
- [ ] Layouts stored per-character at `data/character-{id}/manual-controls-layout.json`
- [ ] Active layout persists across page refresh
- [ ] Switching layouts re-renders canvas with saved positions

### A.9 Layout API Endpoints

- [ ] `GET /conversation/api/manual-controls-layout?name=X` — returns layout + all layout names
- [ ] `POST /conversation/api/manual-controls-layout` — `{ layoutName, items, canvasHeight }` saves layout
- [ ] `DELETE /conversation/api/manual-controls-layout?name=X` — deletes layout (400 if last)
- [ ] `POST /conversation/api/manual-controls-layout/rename` — `{ oldName, newName }` (409 if exists)

### A.10 Character Independence

- [ ] All data loaded dynamically from APIs — no hardcoded part names or character IDs
- [ ] `ManualControls.init({ characterId })` called from dashboard `init()`
- [ ] `ManualControls.reload(characterId)` called from `refreshPageState()` on character switch
- [ ] Canvas completely clears and re-renders when character changes
- [ ] Each character has independent layout file
- [ ] Works with ANY character (test with at least 2)

### A.11 Dashboard Integration

- [ ] Manual Controls card appears between webcam/scenes row and bottom controls row
- [ ] `<link rel="stylesheet" href="/css/manual-controls.css">` in head
- [ ] `<script src="/js/manual-controls.js">` after existing scripts
- [ ] Card has joystick icon, item count badge, collapse chevron
- [ ] Collapse/expand works (Bootstrap collapse)

### A.12 Visual Details

- [ ] Canvas: `min-height: 350px`, dashed border, dark background
- [ ] Items: `min-width: 80px`, `max-width: 140px`, `font-size: 0.75rem`
- [ ] Selected state: blue glow (`box-shadow`)
- [ ] Fire flash: green glow keyframe animation (300ms)
- [ ] Empty state message when no items placed ("Click Edit Layout to add controls")
- [ ] Item count badge updates dynamically

---

## B. Jaw Animation v2 (Committed — Verify Working)

Persistent Python daemon for real-time audio-synchronized jaw control.

### B.1 Persistent Servo Daemon

- [ ] `python_wrappers/jaw_servo_daemon.py` — long-running PCA9685 process
- [ ] `services/jawServoDaemon.js` — Node.js daemon lifecycle manager
- [ ] JSON-line protocol: `{"cmd":"set_angle","channel":10,"angle":85}`
- [ ] `sendAngle()` is fire-and-forget (sync write to stdin)
- [ ] Lazy-start, auto-restart on crash, graceful shutdown
- [ ] Falls back to `hardwareService.controlPart()` if daemon unavailable
- [ ] Shutdown hook in `server.js`

### B.2 Pre-Analysis Engine

- [ ] `preAnalyzeAudio()` in jawAnimationSuperPowerService
- [ ] Bandpass filter: ffmpeg 500-2500Hz speech formant isolation (`useBandpassFilter`)
- [ ] AGC: normalize peak RMS to 0.8 (`useAGC`)
- [ ] Quantization: discrete jaw positions 5-20 levels (`quantizationLevels`)
- [ ] 20ms frame rate (matches PCA9685 50Hz PWM)

### B.3 Sync Playback

- [ ] `playWithJawSync()` — pre-analyze then play audio+jaw in parallel
- [ ] Drift-correcting setTimeout scheduling

### B.4 Scene Integration

- [ ] `sayThis` steps auto-sync jaw during TTS playback when jaw enabled
- [ ] `askAI` steps auto-sync jaw during AI response playback
- [ ] `audio` steps optionally sync jaw with pre-recorded audio
- [ ] `jaw-animation` enable step pre-warms daemon
- [ ] Dashboard `/api/say` uses `playWithJawSync()` when jaw enabled
- [ ] All jaw integration is non-fatal (graceful fallback)

### B.5 UI Controls

- [ ] Presets: Speech/Music/Custom radio buttons
- [ ] Speech Filter toggle (bandpass on/off)
- [ ] AGC toggle (gain control on/off)
- [ ] Quantization slider (5-20 levels)
- [ ] Timeline canvas visualization after TTS test

### B.6 Config Fields (backward-compatible)

- [ ] `useBandpassFilter` (default: true)
- [ ] `useAGC` (default: true)
- [ ] `quantizationLevels` (default: 10)
- [ ] `preset` (default: "speech")

### B.7 Bug Fix

- [ ] `stop-monitoring` endpoint calls `cancelJawDrive()` to clear active drives

---

## C. Dashboard Enhancements (Committed — Verify Working)

### C.1 Scenes Panel

- [ ] Drag-reorder scenes by grip handle (SortableJS)
- [ ] Scene order persists via `POST /scenes/api/reorder` `{ orderedIds: [...] }`
- [ ] Delete button on each scene row with confirmation
- [ ] Loop All button — enqueues all scenes, starts queue in loop mode
- [ ] Stop button to halt the loop
- [ ] "Looping" badge when active

### C.2 Panel Drag-and-Drop

- [ ] All bottom panels in single `sortable-column` (dashboard-bottom)
- [ ] `PanelSortable.init('dashboard')` called after DOMContentLoaded
- [ ] Panel order persists

### C.3 Monster Features Toggle Persistence

- [ ] Jaw toggle saves to `super-powers.json`
- [ ] Head tracking toggle sends start/stop commands
- [ ] Parrot toggle state managed

---

## D. Pose Editor (Committed — Verify Working)

### D.1 Page

- [ ] Dedicated page at `/poses/editor` and `/poses/editor/:id`
- [ ] Template: `views/poses/editor.ejs`
- [ ] Route: `routes/poses/index.js`

### D.2 Features

- [ ] Shows controllable parts: servo, motor, linear_actuator, light, led
- [ ] Type-specific controls: angle sliders (servos), direction/speed/duration (motors/actuators), on/off + brightness (lights)
- [ ] Test individual parts via `POST /api/parts/:id/test`
- [ ] Test full pose (all parts simultaneously)
- [ ] Optional audio attachment (sound file or TTS text)
- [ ] Save via `POST /poses` (create) or `PUT /poses/:id` (update)
- [ ] Edit existing poses from saved list

### D.3 Navigation

- [ ] "Pose Editor" link in Activities dropdown
- [ ] "Animation Studio" link in Activities dropdown

---

## E. Earlier UI Enhancements (Committed — Verify Working)

- [ ] Dual-view toggle (card grid / compact list) in Audio & Video libraries
- [ ] UI consistency overhaul — sticky nav, page titles, header cleanup
- [ ] Drag-and-drop panel reordering on Dashboard, AI Settings, Audio Setup

---

## F. Known Issues & Fixes Applied

1. **Parts API format**: `GET /api/parts` returns raw array (not `{ success, parts }` wrapper). Manual controls JS handles both formats. Other consumers may need checking.
2. **Part IDs**: strings in scenes.json, numbers in poses.json — executor uses `String(partId)` for comparison.
3. **`concurrent` flag**: means "run THIS step and NEXT step simultaneously" (not "run all concurrently").
4. **Route mount order**: `/api/parts` (partsApi) must mount before `/api` (sceneEditorApi) in server.js.
5. **ES5 requirement**: `public/js/*.js` files must use ES5 IIFE pattern (no arrow functions, no template literals, no const/let). Inline EJS `<script>` blocks may use ES6+.

---

## G. Test Baseline

### Expected test counts (v6.1.5 baseline):
- 255 system/unit tests (Mocha) — all passing
- 190 browser tests (Playwright) — all passing
- 0 failures

### Test commands:
```bash
npm test                    # Mocha unit/system tests
npx playwright test         # Browser tests
npm run verify              # Full verification
```

### Manual verification:
1. Navigate to `/` — Manual Controls card visible
2. Toggle Edit Mode — parts, poses, audio appear in drawer
3. Add items to canvas — positions save after drag
4. Show Mode: click servo → directional controls → nudge → servo moves
5. Show Mode: click pose → pose executes
6. Show Mode: click sound → audio plays
7. Switch characters → canvas reloads with different parts
8. Create/rename/delete layouts → persist across refresh

---

*Generated 2026-02-19 for MonsterBox 6.3.0 hope branch*
