# Implementation Prompt: Dashboard Manual Controls Panel

## Executive Summary

Add a **Manual Controls** panel to the MonsterBox dashboard (`/`) that gives a remote operator a spatial, visual control surface for live animatronic operation. The panel appears directly below the webcam feed and contains draggable tiles representing hardware **parts** (servos, actuators, motors, lights), saved **poses**, and **audio files**. The operator arranges tiles to visually match the animatronic's body layout (head at top, left arm on left, etc.), then during a live show they watch the webcam, see a visitor approach, and instantly click a pose tile to scare them, click a sound tile to play a spooky audio clip, or select a servo tile and nudge it up/down with directional buttons. All hardware commands fire without blocking the UI so the operator can click rapidly during a live performance. Tile positions are saved as named **layouts** per-character in a JSON file, so the operator can have multiple arrangements (e.g., "Full Body", "Arms Only", "Scare Mode") and switch between them.

---

## Critical Design Principle: Character Independence

**EVERYTHING in this panel must be dynamic and character-independent:**

- Parts, poses, and audio are loaded fresh from the API on every `init()` and `reload()` call — NEVER hardcode part names like "Orlok's Left Arm" or char_id=3
- When the user switches characters via the Character Selection dropdown, the Manual Controls panel must completely clear and re-render with the new character's parts, poses, and layout
- Layout files are stored per-character: `data/character-{id}/manual-controls-layout.json` — each character gets its own set of named layouts
- The canvas tiles are built dynamically from whatever the API returns — if a character has 3 parts, show 3 tiles; if another has 12, show 12
- Part type badges, icons, and directional control options are determined by each part's `type` field at runtime, never by name matching
- Audio files come from the shared audio library — they are the same for all characters
- Poses come from the character's own `poses.json` — they differ per character

**Known anti-pattern to avoid:** The codebase historically had Orlok-specific hardcoding (char_id=3). This panel must work identically for ANY character. Test with at least 2 different characters.

---

## Architecture Constraints (from CLAUDE.md)

- **DO NOT** add new npm dependencies
- **DO NOT** introduce WebSockets, GraphQL, or new transport layers — use HTTP fetch only
- **DO NOT** restructure the database schema
- Use Bootstrap 5 + Bootstrap Icons + vanilla JS only (no React/Vue/jQuery)
- Preserve all existing API endpoints and their contracts
- All functionality must work for ANY selected character (never hardcode char_id)

---

## Files to Create

### 1. `public/js/manual-controls.js` (~450 lines)

Client-side module exposed as `window.ManualControls = { init, reload, destroy }`.

**Data loading** — `init(opts)` and `reload(characterId)` fetch four sources in parallel using `Promise.allSettled()`:

```javascript
const [partsResp, posesResp, audioResp, layoutResp] = await Promise.allSettled([
  fetch(`/api/parts?characterId=${characterId}`).then(r => r.json()),
  fetch('/poses/api/poses').then(r => r.json()),
  fetch('/audio-library/api/library').then(r => r.json()),
  fetch('/conversation/api/manual-controls-layout').then(r => r.json())
]);
```

**Parts filtering** — Only include movable/interactive types on the canvas:
- `servo`, `linear_actuator`, `motor`, `stepper`, `light`, `led`, `motion_sensor`
- Exclude: `speaker`, `microphone`, `webcam`, `head_tracking`, `pipewire` (not spatial controls)

**Parts API response format** (`GET /api/parts?characterId=X`):
```json
{
  "success": true,
  "parts": [
    {
      "id": "8",
      "characterId": 3,
      "name": "Elbow",
      "type": "servo",
      "description": "...",
      "enabled": true,
      "config": {
        "servoType": "standard",
        "controllerType": "pca9685",
        "channel": 8
      },
      "markers": [
        { "name": "Min", "kind": "absolute", "value": 70, "unit": "deg" },
        { "name": "Mid", "kind": "absolute", "value": 83, "unit": "deg" },
        { "name": "Max", "kind": "absolute", "value": 93, "unit": "deg" }
      ]
    }
  ]
}
```

**Poses API response format** (`GET /poses/api/poses`):
```json
{
  "success": true,
  "poses": [
    { "id": 1, "name": "Scare Pose", "description": "...", "category": "arms" }
  ]
}
```

**Audio Library API response format** (`GET /audio-library/api/library`):
```json
{
  "success": true,
  "files": [
    {
      "id": "abc-123",
      "title": "Evil Laugh",
      "filename": "evil-laugh.mp3",
      "duration": 3.2,
      "format": "mp3",
      "category": "monster-sounds"
    }
  ]
}
```

**Canvas rendering** — For each data item, create an absolutely-positioned `<div class="mc-item">` inside the canvas container (`#mcCanvas`, which has `position: relative`). Items with saved positions get `left: Xpx; top: Ypx`. Items without saved positions auto-flow in a grid row at the bottom of the canvas.

**Three item types with visual differentiation:**

**Part tiles** (`.mc-item.mc-part`):
- Colored left border by hardware type:
  - Servo: `border-left: 3px solid var(--bs-primary)` (blue)
  - Linear Actuator: `border-left: 3px solid var(--bs-warning)` (orange)
  - Motor/Stepper: `border-left: 3px solid var(--bs-success)` (green)
  - Light/LED: `border-left: 3px solid #ffc107` (yellow)
  - Motion Sensor: `border-left: 3px solid var(--bs-danger)` (red)
- Content: Part name (text-truncate) + tiny type badge + mini position bar (for servos)
- Data attributes: `data-item-type="part"`, `data-part-id="X"`, `data-part-type="servo"`

```html
<div class="mc-item mc-part" data-item-type="part" data-part-id="8" data-part-type="servo"
     style="position:absolute; left:120px; top:80px;">
  <div class="mc-item-label text-truncate">Elbow</div>
  <div class="mc-item-meta">
    <span class="badge bg-primary" style="font-size:0.55rem">servo</span>
  </div>
  <div class="mc-position-bar"><div class="mc-position-fill" style="width:50%"></div></div>
</div>
```

**Pose tiles** (`.mc-item.mc-pose`):
- Purple left border: `border-left: 3px solid #6f42c1`
- Play icon + pose name
- Data attributes: `data-item-type="pose"`, `data-pose-id="X"`
- On click (show mode): fire-and-forget `POST /poses/{id}/execute` with `{ }` body
- Flash green briefly on fire (add/remove `.mc-fired` class, 250ms)

```html
<div class="mc-item mc-pose" data-item-type="pose" data-pose-id="1"
     style="position:absolute; left:300px; top:200px;">
  <i class="bi bi-play-circle-fill" style="color:#6f42c1"></i>
  <span class="mc-item-label text-truncate">Scare Pose</span>
</div>
```

**Sound tiles** (`.mc-item.mc-sound`):
- Teal left border: `border-left: 3px solid var(--bs-info)`
- Speaker icon + title + duration badge
- Data attributes: `data-item-type="sound"`, `data-audio-id="X"`
- On click (show mode): fire-and-forget `POST /conversation/api/play-audio` with `{ audioId: id }`
- Flash green briefly on fire

```html
<div class="mc-item mc-sound" data-item-type="sound" data-audio-id="abc-123"
     style="position:absolute; left:250px; top:280px;">
  <i class="bi bi-volume-up-fill text-info"></i>
  <span class="mc-item-label text-truncate">Evil Laugh</span>
  <span class="badge bg-dark" style="font-size:0.5rem">3.2s</span>
</div>
```

**Two modes:**

**Show Mode** (default):
- Items are NOT draggable
- Click a part tile → select it (add `.mc-selected`, remove from others) → show directional controls
- Click a pose tile → immediately execute pose (fire-and-forget fetch)
- Click a sound tile → immediately play audio (fire-and-forget fetch)
- Click canvas background → deselect any selected part, hide directional controls

**Edit Mode** (toggled via "Edit Layout" button in card header):
- Items become draggable (add `.mc-edit-mode` to all items)
- An "Add Items" drawer appears at the bottom of the canvas listing items not yet placed on canvas
- Clicking items does NOT fire actions in edit mode
- CSS: `touch-action: none` on canvas to prevent scroll interference on touch devices

**Pointer-event drag** (edit mode only) — use Pointer Events, NOT HTML5 Drag and Drop (HTML5 DnD shows ghost images and doesn't work on touch):

```javascript
function enableDrag(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.mc-item');
    if (!item || !editMode) return;
    e.preventDefault();
    item.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const offsetX = e.clientX - item.offsetLeft - rect.left;
    const offsetY = e.clientY - item.offsetTop - rect.top;

    const onMove = (e2) => {
      let newX = e2.clientX - rect.left - offsetX;
      let newY = e2.clientY - rect.top - offsetY;
      // Clamp to canvas bounds
      newX = Math.max(0, Math.min(canvas.clientWidth - item.offsetWidth, newX));
      newY = Math.max(0, Math.min(canvas.clientHeight - item.offsetHeight, newY));
      item.style.left = newX + 'px';
      item.style.top = newY + 'px';
    };

    const onUp = () => {
      item.removeEventListener('pointermove', onMove);
      item.removeEventListener('pointerup', onUp);
      debounceSaveLayout(); // 500ms debounce
    };

    item.addEventListener('pointermove', onMove);
    item.addEventListener('pointerup', onUp);
  });
}
```

**Directional controls** — floating toolbar positioned at top-right of canvas, not attached to the item:

```html
<div id="mcDirectionalControls" class="d-none position-absolute bg-dark border rounded p-2 shadow"
     style="top:8px; right:8px; z-index:20; min-width:200px;">
  <div class="d-flex justify-content-between align-items-center mb-2">
    <strong class="small text-truncate" id="mcSelectedPartName">--</strong>
    <button class="btn-close btn-close-white btn-sm" id="mcDeselectBtn"></button>
  </div>
  <div id="mcControlsBody">
    <!-- Populated dynamically based on selected part type -->
  </div>
  <div class="small text-muted mt-1" id="mcControlStatus"></div>
</div>
```

**Directional controls content by part type:**

For **standard servos**:
```html
<div class="d-flex flex-column gap-1">
  <div class="d-flex gap-1 justify-content-center">
    <button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="0.1">
      <i class="bi bi-arrow-up"></i>
    </button>
  </div>
  <div class="d-flex gap-1 justify-content-center">
    <button class="btn btn-sm btn-outline-secondary mc-goto-btn" data-p="0">Min</button>
    <button class="btn btn-sm btn-outline-secondary mc-goto-btn" data-p="0.5">Mid</button>
    <button class="btn btn-sm btn-outline-secondary mc-goto-btn" data-p="1">Max</button>
  </div>
  <div class="d-flex gap-1 justify-content-center">
    <button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="-0.1">
      <i class="bi bi-arrow-down"></i>
    </button>
  </div>
  <div class="text-center small mt-1">
    Position: <span id="mcPositionDisplay">--</span>
  </div>
</div>
```

For **continuous servos**:
```html
<div class="d-flex gap-1 justify-content-center">
  <button class="btn btn-sm btn-primary" data-action="ccw">CCW</button>
  <button class="btn btn-sm btn-danger" data-action="stop">Stop</button>
  <button class="btn btn-sm btn-primary" data-action="cw">CW</button>
</div>
```

For **linear actuators**:
```html
<div class="d-flex gap-1 justify-content-center">
  <button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="0.1">Extend</button>
  <button class="btn btn-sm btn-danger mc-stop-btn">Stop</button>
  <button class="btn btn-sm btn-primary mc-nudge-btn" data-delta="-0.1">Retract</button>
</div>
```

For **motors/steppers**:
```html
<div class="d-flex gap-1 justify-content-center">
  <button class="btn btn-sm btn-primary" data-action="forward">Fwd</button>
  <button class="btn btn-sm btn-danger" data-action="stop">Stop</button>
  <button class="btn btn-sm btn-primary" data-action="reverse">Rev</button>
</div>
```

For **lights/LEDs**:
```html
<div class="d-flex gap-1 justify-content-center">
  <button class="btn btn-sm btn-warning" data-action="toggle">Toggle</button>
</div>
```

**Hardware command APIs** (all existing — no new endpoints needed):

| Action | Method | URL | Body | Response |
|--------|--------|-----|------|----------|
| Nudge servo/actuator | POST | `/api/calibration/{partId}/nudge` | `{ delta: 0.1 }` or `{ delta: -0.1 }` | `{ success: true, currentP: 0.6 }` |
| Go to position | POST | `/api/calibration/{partId}/goto` | `{ p: 0.5 }` (0-1 normalized) | `{ success: true, targetP: 0.5 }` |
| Stop continuous motion | POST | `/api/calibration/{partId}/stop` | `{}` | `{ success: true }` |
| Get current position | GET | `/api/calibration/{partId}/position` | — | `{ success: true, currentP: 0.5 }` |
| Execute pose | POST | `/poses/{id}/execute` | `{}` | `{ success: true }` |
| Play audio | POST | `/conversation/api/play-audio` | `{ audioId: "abc-123" }` | `{ success: true }` |
| Test part (motors, lights) | POST | `/api/parts/{id}/test` | `{ action: "toggle" }` or `{ action: "control", params: { direction: "forward", speed: 50, duration: 1000 } }` | `{ success: true }` |

**CRITICAL: Fire-and-forget pattern** — Never `await` hardware commands in click handlers. The user clicks rapidly during a live show:

```javascript
function nudgePart(partId, delta) {
  setStatus('Moving...');
  // NO await — fire and forget
  fetch(`/api/calibration/${partId}/nudge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta })
  }).then(r => r.json()).then(j => {
    if (j.success) {
      setStatus('Pos: ' + (j.currentP != null ? j.currentP.toFixed(2) : '?'));
      updatePositionBar(partId, j.currentP);
    } else {
      setStatus('Failed');
    }
  }).catch(() => setStatus('Error'));
}

function firePose(poseId) {
  flashItem(poseId);
  fetch(`/poses/${poseId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }).catch(() => {});
}

function playSound(audioId) {
  flashItem(audioId);
  fetch('/conversation/api/play-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioId })
  }).catch(() => {});
}
```

**Layout save** — debounced 500ms, collects all item positions from DOM:

```javascript
let saveTimer = null;
let currentLayoutName = 'Default';

function debounceSaveLayout() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLayout, 500);
}

function saveLayout() {
  const items = [];
  canvas.querySelectorAll('.mc-item').forEach(el => {
    items.push({
      type: el.dataset.itemType,
      id: el.dataset.partId || el.dataset.poseId || el.dataset.audioId,
      x: parseInt(el.style.left, 10) || 0,
      y: parseInt(el.style.top, 10) || 0
    });
  });
  fetch('/conversation/api/manual-controls-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      layoutName: currentLayoutName,
      items,
      canvasHeight: canvas.clientHeight
    })
  }).catch(() => {});
}
```

**Named layouts** — The operator can save multiple arrangements per character. A small dropdown in the card header lets them select, create, rename, or delete layouts. The "Default" layout is created automatically on first use. Examples: "Full Body", "Arms Only", "Scare Mode", "Daytime Ambient".
```

**`reload(characterId)`** — clears canvas, re-fetches all data, re-renders. Called from dashboard's `refreshPageState()` when user switches character.

**`destroy()`** — removes event listeners, clears canvas. Not strictly needed but good hygiene.

---

### 2. `public/css/manual-controls.css` (~90 lines)

```css
/* Manual Controls Canvas */
#mcCanvas {
  position: relative;
  min-height: 350px;
  border: 1px dashed var(--bs-border-color);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

#mcCanvas.mc-edit-active {
  border-color: var(--bs-warning);
  background: rgba(255, 193, 7, 0.03);
}

/* Base item tile */
.mc-item {
  position: absolute;
  background: var(--bs-card-bg, #1a1a2e);
  border: 1px solid var(--bs-border-color);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  user-select: none;
  min-width: 80px;
  max-width: 140px;
  z-index: 1;
  transition: box-shadow 0.15s, transform 0.1s;
  touch-action: none;
}

.mc-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: translateY(-1px);
}

/* Type-specific left borders */
.mc-part[data-part-type="servo"] { border-left: 3px solid var(--bs-primary); }
.mc-part[data-part-type="linear_actuator"] { border-left: 3px solid var(--bs-warning); }
.mc-part[data-part-type="motor"],
.mc-part[data-part-type="stepper"] { border-left: 3px solid var(--bs-success); }
.mc-part[data-part-type="light"],
.mc-part[data-part-type="led"] { border-left: 3px solid #ffc107; }
.mc-part[data-part-type="motion_sensor"] { border-left: 3px solid var(--bs-danger); }
.mc-pose { border-left: 3px solid #6f42c1; }
.mc-sound { border-left: 3px solid var(--bs-info); }

/* Selected state */
.mc-item.mc-selected {
  box-shadow: 0 0 0 2px var(--bs-primary), 0 0 12px rgba(var(--bs-primary-rgb), 0.4);
  z-index: 10;
}

/* Fire flash animation */
.mc-item.mc-fired {
  animation: mc-fire-flash 0.3s ease-out;
}
@keyframes mc-fire-flash {
  0% { box-shadow: 0 0 0 4px var(--bs-success), 0 0 16px rgba(var(--bs-success-rgb), 0.6); }
  100% { box-shadow: none; }
}

/* Edit mode */
.mc-item.mc-edit-mode {
  cursor: grab;
  border-style: dashed;
}
.mc-item.mc-edit-mode:active {
  cursor: grabbing;
  z-index: 100;
  opacity: 0.85;
}

/* Item label */
.mc-item-label {
  font-weight: 500;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: middle;
}

/* Mini position bar for servos */
.mc-position-bar {
  height: 3px;
  background: #333;
  border-radius: 2px;
  margin-top: 3px;
}
.mc-position-fill {
  height: 100%;
  background: var(--bs-primary);
  border-radius: 2px;
  transition: width 0.2s;
}

/* Directional controls toolbar */
#mcDirectionalControls {
  background: var(--bs-card-bg, #1e1e2e) !important;
  border: 1px solid var(--bs-border-color) !important;
  max-width: 220px;
}

/* Item drawer in edit mode */
.mc-drawer {
  border-top: 1px dashed var(--bs-border-color);
  padding: 8px;
  max-height: 120px;
  overflow-y: auto;
}
.mc-drawer-item {
  display: inline-block;
  padding: 3px 8px;
  margin: 2px;
  border: 1px solid var(--bs-border-color);
  border-radius: 4px;
  font-size: 0.7rem;
  cursor: pointer;
  background: var(--bs-card-bg, #1a1a2e);
}
.mc-drawer-item:hover {
  background: rgba(var(--bs-primary-rgb), 0.15);
}
```

---

## Files to Modify

### 3. `routes/conversation.js`

Add four new endpoints **before** the `export default router;` line (currently line 547). Follow the exact pattern of the existing `ai-on` endpoints at lines 496-545.

The layout file stores **multiple named layouts** per character in a single file:

**File:** `data/character-{id}/manual-controls-layout.json`
```json
{
  "version": 1,
  "activeLayout": "Default",
  "layouts": {
    "Default": {
      "canvasHeight": 350,
      "items": [
        { "type": "part", "id": "4", "x": 120, "y": 80 },
        { "type": "pose", "id": "1", "x": 300, "y": 200 },
        { "type": "sound", "id": "abc123", "x": 250, "y": 280 }
      ],
      "updatedAt": "2026-02-19T..."
    },
    "Scare Mode": {
      "canvasHeight": 350,
      "items": [ ... ],
      "updatedAt": "2026-02-19T..."
    }
  }
}
```

```javascript
// GET /conversation/api/manual-controls-layout?name=LayoutName
// Returns the named layout (or active layout if no name given), plus the list of all layout names
router.get('/api/manual-controls-layout', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, layout: null, layouts: [], activeLayout: null });

    const dataDir = await getDataDir();
    const layoutFile = path.resolve(dataDir, `character-${characterId}`, 'manual-controls-layout.json');

    let data;
    try {
      const content = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(content);
    } catch {
      // File doesn't exist yet — return null so client uses auto-grid
      return res.json({ success: true, layout: null, layouts: [], activeLayout: null });
    }

    const layoutNames = Object.keys(data.layouts || {});
    const requestedName = req.query.name || data.activeLayout || layoutNames[0] || null;
    const layout = requestedName && data.layouts[requestedName] ? data.layouts[requestedName] : null;

    res.json({ success: true, layout, layoutName: requestedName, layouts: layoutNames, activeLayout: data.activeLayout });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/manual-controls-layout  { layoutName, items, canvasHeight }
// Saves a named layout (creates or overwrites)
router.post('/api/manual-controls-layout', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const layoutName = (req.body.layoutName || 'Default').trim();
    const items = req.body.items || [];
    const canvasHeight = req.body.canvasHeight || 350;

    const dataDir = await getDataDir();
    const charDir = path.resolve(dataDir, `character-${characterId}`);
    const layoutFile = path.resolve(charDir, 'manual-controls-layout.json');

    // Read existing file or create new structure
    let data = { version: 1, activeLayout: layoutName, layouts: {} };
    try {
      const existing = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(existing);
      if (!data.layouts) data.layouts = {};
    } catch {
      // File doesn't exist yet, use default structure
    }

    // Save the named layout
    data.layouts[layoutName] = { canvasHeight, items, updatedAt: new Date().toISOString() };
    data.activeLayout = layoutName;

    await fs.mkdir(charDir, { recursive: true });
    await fs.writeFile(layoutFile, JSON.stringify(data, null, 2), 'utf8');

    res.json({ success: true, layoutName, layouts: Object.keys(data.layouts) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// DELETE /conversation/api/manual-controls-layout?name=LayoutName
// Deletes a named layout (cannot delete the last one)
router.delete('/api/manual-controls-layout', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const layoutName = (req.query.name || '').trim();
    if (!layoutName) return res.status(400).json({ success: false, error: 'Layout name required' });

    const dataDir = await getDataDir();
    const layoutFile = path.resolve(dataDir, `character-${characterId}`, 'manual-controls-layout.json');

    let data;
    try {
      const content = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(content);
    } catch {
      return res.status(404).json({ success: false, error: 'No layouts file found' });
    }

    if (!data.layouts || !data.layouts[layoutName]) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }

    const names = Object.keys(data.layouts);
    if (names.length <= 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the last layout' });
    }

    delete data.layouts[layoutName];
    // If the deleted layout was active, switch to the first remaining one
    if (data.activeLayout === layoutName) {
      data.activeLayout = Object.keys(data.layouts)[0];
    }

    await fs.writeFile(layoutFile, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, layouts: Object.keys(data.layouts), activeLayout: data.activeLayout });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/manual-controls-layout/rename  { oldName, newName }
// Renames a layout
router.post('/api/manual-controls-layout/rename', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const oldName = (req.body.oldName || '').trim();
    const newName = (req.body.newName || '').trim();
    if (!oldName || !newName) return res.status(400).json({ success: false, error: 'oldName and newName required' });
    if (oldName === newName) return res.json({ success: true, layouts: [] });

    const dataDir = await getDataDir();
    const layoutFile = path.resolve(dataDir, `character-${characterId}`, 'manual-controls-layout.json');

    let data;
    try {
      const content = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(content);
    } catch {
      return res.status(404).json({ success: false, error: 'No layouts file found' });
    }

    if (!data.layouts || !data.layouts[oldName]) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }
    if (data.layouts[newName]) {
      return res.status(409).json({ success: false, error: 'A layout with that name already exists' });
    }

    data.layouts[newName] = data.layouts[oldName];
    delete data.layouts[oldName];
    if (data.activeLayout === oldName) data.activeLayout = newName;

    await fs.writeFile(layoutFile, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, layouts: Object.keys(data.layouts), activeLayout: data.activeLayout });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});
```

---

### 4. `views/conversation/index.ejs`

**A.** Add CSS link in the `<style>` block at the top (after line 17):
```html
<link rel="stylesheet" href="/css/manual-controls.css">
```

**B.** Insert the Manual Controls card HTML **between** the webcam/scenes row (ends at line 62) and the bottom controls row (starts at line 64). Insert after the closing `</div>` of the top row:

```html
  <!-- MANUAL CONTROLS ROW -->
  <div class="row g-3 mb-3">
    <div class="col-12">
      <div class="card" id="manual-controls-card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0">
            <i class="bi bi-joystick"></i> Manual Controls
            <span class="badge bg-secondary small ms-2" id="mcItemCount">0 items</span>
          </h6>
          <div class="d-flex gap-2 align-items-center">
            <!-- Layout selector dropdown -->
            <div class="input-group input-group-sm" style="width: auto;">
              <select id="mcLayoutSelect" class="form-select form-select-sm" style="width:140px; font-size:0.75rem;">
                <option value="Default">Default</option>
              </select>
              <button class="btn btn-outline-secondary btn-sm" id="mcLayoutNewBtn" title="New layout">
                <i class="bi bi-plus"></i>
              </button>
              <button class="btn btn-outline-secondary btn-sm" id="mcLayoutRenameBtn" title="Rename layout">
                <i class="bi bi-pencil-square"></i>
              </button>
              <button class="btn btn-outline-danger btn-sm" id="mcLayoutDeleteBtn" title="Delete layout">
                <i class="bi bi-trash"></i>
              </button>
            </div>
            <button class="btn btn-sm btn-outline-warning" id="mcEditToggle" title="Toggle edit mode">
              <i class="bi bi-pencil"></i> Edit Layout
            </button>
            <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="collapse"
                    data-bs-target="#mcCanvasBody" aria-expanded="true" title="Collapse">
              <i class="bi bi-chevron-up"></i>
            </button>
          </div>
        </div>
        <div class="collapse show" id="mcCanvasBody">
          <div class="card-body p-2" style="position:relative;">
            <div id="mcDirectionalControls" class="d-none position-absolute bg-dark border rounded p-2 shadow"
                 style="top:16px; right:16px; z-index:20; min-width:200px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong class="small text-truncate" id="mcSelectedPartName">--</strong>
                <button class="btn-close btn-close-white btn-sm" id="mcDeselectBtn" title="Deselect"></button>
              </div>
              <div id="mcControlsBody"></div>
              <div class="small text-muted mt-1" id="mcControlStatus"></div>
            </div>
            <div id="mcCanvas"></div>
            <div id="mcDrawer" class="mc-drawer d-none">
              <small class="text-muted d-block mb-1">Drag items to canvas or click to add:</small>
              <div id="mcDrawerItems"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
```

**C.** Add the script tag after the existing scripts (after line 202):
```html
<script src="/js/manual-controls.js"></script>
```

**D.** In the `init()` function (around line 311), add after `await loadHardwareParts();`:
```javascript
if (typeof ManualControls !== 'undefined') {
  await ManualControls.init({ characterId: currentCharacterId, canvasId: 'mcCanvas' });
}
```

**E.** In the `refreshPageState()` function (around line 419), add after `await loadHardwareParts();`:
```javascript
if (typeof ManualControls !== 'undefined') {
  await ManualControls.reload(currentCharacterId);
}
```

---

## Reference: Existing Code Patterns to Follow

### How the existing Hardware Control panel dispatches commands (views/conversation/index.ejs lines 987-1106)

This is the `executeHardwareAction()` function pattern. The Manual Controls directional buttons should use the same calibration API calls:

```javascript
// Servo move to angle (standard servo)
endpoint = `/api/calibration/${partId}/goto`;
body = { p: normalizedPosition }; // 0.0 to 1.0

// Servo nudge (standard or continuous)
endpoint = `/api/calibration/${partId}/nudge`;
body = { delta: 0.1 }; // positive = toward max, negative = toward min

// Continuous servo CW/CCW
endpoint = `/api/calibration/${partId}/nudge`;
body = { delta: 0.1, speedPct: 35, durationMs: 300 }; // CW
body = { delta: -0.1, speedPct: 35, durationMs: 300 }; // CCW

// Linear actuator extend/retract
endpoint = `/api/calibration/${partId}/nudge`;
body = { delta: 0.1, speedPct: 50, durationMs: 500 }; // extend
body = { delta: -0.1, speedPct: 50, durationMs: 500 }; // retract

// Stop continuous motion
endpoint = `/api/calibration/${partId}/stop`;
body = {};

// Light toggle
endpoint = `/api/parts/${partId}/test`;
body = { action: 'toggle' };

// Motor run
endpoint = `/api/parts/${partId}/test`;
body = { action: 'control', params: { direction: 'forward', speed: 50, duration: 1000 } };

// Motor stop
endpoint = `/api/parts/${partId}/test`;
body = { action: 'stop', params: {} };
```

### How audio playback works (routes/conversation.js line 217)

The `POST /conversation/api/play-audio` endpoint accepts flexible identification. For the Manual Controls panel, use the `audioId` field:

```javascript
fetch('/conversation/api/play-audio', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ audioId: 'the-audio-id-from-library' })
});
```

### How pose execution works

```javascript
fetch(`/poses/${poseId}/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});
```

### How per-character data files are stored (routes/conversation.js lines 26-35, 504-510)

```javascript
function getCurrentCharacterId(req) {
  return (parseInt(req.app.locals?.config?.selectedCharacter, 10)) || null;
}

async function getDataDir() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..', '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

// Usage pattern:
const dataDir = await getDataDir();
const charDir = path.resolve(dataDir, `character-${characterId}`);
await fs.mkdir(charDir, { recursive: true });
await fs.writeFile(path.resolve(charDir, 'filename.json'), JSON.stringify(data, null, 2), 'utf8');
```

---

## Verification Checklist

1. Run `npm test` — all existing tests must pass (no regressions)
2. Start app with `node app.js`, navigate to `/`
3. Verify Manual Controls card appears between webcam row and existing controls row
4. Verify parts, poses, and audio files render as tiles in the canvas
5. **Character independence tests:**
   - Switch characters via the dropdown — verify canvas completely clears and re-renders with the new character's data
   - Verify no hardcoded part names, char_id values, or "Orlok" references
   - Create a second character in Setup if needed — both should work identically
   - Verify the layout file is at `data/character-{id}/manual-controls-layout.json` using the correct character ID
6. Toggle Edit Mode:
   - Items become draggable with grab cursor
   - Drawer appears with unplaced items
   - Drag an item and release — position persists after page refresh
   - Verify `data/character-{id}/manual-controls-layout.json` is created
7. In Show Mode:
   - Click a servo part tile → directional controls appear at top-right → click Up/Down
   - Click a pose tile → pose executes (check terminal for hardware output)
   - Click a sound tile → audio plays
   - Click canvas background → deselects part, hides directional controls
8. **Named layout tests:**
   - Create a new layout ("Scare Mode") using the + button — verify layout selector updates
   - Arrange tiles differently in the new layout — verify it saves independently
   - Switch between "Default" and "Scare Mode" — verify tiles move to their respective positions
   - Rename a layout — verify the dropdown updates
   - Delete a layout (not the last one) — verify it's removed from the dropdown
   - Refresh the page — verify the active layout and all saved layouts persist
   - Switch characters, then back — verify each character has its own layouts
9. Test collapse/expand of the panel (Bootstrap collapse chevron button)
10. Verify responsive layout on smaller screens

---

## Commit Message Format

```
v6.1.2: [dashboard] add manual controls panel with draggable spatial layout
```
