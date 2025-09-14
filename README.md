# MonsterBox 4.0 - Single Node Animatronic Control System

**MonsterBox 4.0** is now the primary animatronic control system, restructured from the legacy distributed architecture. This clean, single-node application runs directly from the repository root and provides complete hardware control for building, programming, and running interactive animatronic characters like Orlok.

## 🎯 Key Features

### ✨ **Poses System**
- **Reusable, safe, named postures** that can be triggered manually, invoked in Scenes, and used by Active Mode
- **Template-based creation** with prebuilt options (Bend Elbow, Rotate Head, etc.)
- **Safety enforcement** with calibration data and angle clamping
- **Real-time execution** with hardware integration

### 🏗️ **Clean Architecture**
- **Single Raspberry Pi 4B** per animatronic (self-contained)
- **No WebSocket complexity** - direct hardware control
- **Preserves all existing Python hardware scripts** (unchanged)
- **Bootstrap 5 UI** with dark theme support

### 🔧 **Hardware Integration**
- **11 Part types supported**: servo, motor, linear_actuator, light, LED, sensor, microphone, speaker, webcam, head_tracking
- **Models System**: Hardware model definitions with defaults and calibration data
- **CRUD Operations**: Full Create, Read, Update, Delete for all part types
- **Inline Hardware Testing**: Test each part directly from the setup interface
- **Safety Systems**: Calibration enforcement, angle clamping, timeout protection
- **Real Hardware Control**: Direct integration with Orlok animatronic hardware

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+
- Raspberry Pi 4B (for hardware control)

### Installation

```bash
# Clone and navigate to MonsterBox
git clone https://github.com/arwpc/MonsterBox.git
cd MonsterBox

# Install dependencies
npm install

# Start the server
npm start
```

The application will be available at:
- **Dashboard**: http://localhost:3000
- **Setup**: http://localhost:3000/setup  ← **Start here for parts creation**
- **Live Mode**: http://localhost:3000/live

## 🦴 **Linear Actuator Configuration**

Linear actuators require specific configuration for safe operation:

### **Required Pins:**
- **Direction Pin** - Controls extend/retract direction (e.g., GPIO 18)
- **PWM Pin** - Controls speed via PWM signal (e.g., GPIO 13)
- **Hardware PWM recommended** - GPIO 12, 13, 18, 19 for best performance

### **Safety Limits:**
- **Max Extension** - Maximum extension time in milliseconds (prevents over-extension)
- **Max Retraction** - Maximum retraction time in milliseconds (prevents over-retraction)
- **Default values**: 10,000ms (10 seconds) for both directions

### **Example Configuration:**
```json
{
  "name": "Left Arm of Manipulation",
  "type": "linear_actuator",
  "directionPin": 18,
  "pwmPin": 13,
  "maxExtension": 15000,
  "maxRetraction": 15000
}
```



## 🧭 Servo (GoBilda 2000 Dual‑Mode) Quick Setup & Testing

This app includes a unified GoBilda model that supports both continuous and positional (multi‑turn) modes.

- Model: GoBilda 2000 Series Dual‑Mode (New Spec) — id "3"
- Defaults: controllerType=pca9685, neutralPulse=1500, continuous 900–2100µs, positional 500–2500µs mapping to 0–1800°

### Configure the Head Servo (Orlok)
1) Setup → Parts → Create → type=servo
2) Select Model: "GoBilda 2000 Series Dual‑Mode (New Spec)"
3) Controller: PCA9685
   - I2C Address: 0x40
   - Channel: 0
   - PWM Frequency: 50 Hz
4) Choose servoType based on how you want to test/use it:
   - feedback → Move To Angle (0–1800°) via move_to_pca_multi
   - continuous → Rotate CW/CCW/Stop via rotate_continuous_pca

### Inline Testing (UI)
- On the part card, click the ▶ Test button to open the drawer:
  - Servo controls: Move, CW, CCW, Stop
- In the Edit modal footer (pencil icon → Edit), use quick presets:
  - Stop, 0°, 90°, 180°
  - Note: When servoType=continuous, 0°=Stop, 90°=gentle CW, 180°=gentle CCW for ~0.8s

### CLI Smoke (PCA9685 @ 0x40, ch 0)
````bash
# Positional/multi‑turn (feedback):
python3 python_wrappers/servo_cli.py move_to_pca_multi 0 90 0x40
python3 python_wrappers/servo_cli.py move_to_pca_multi 0 450 0x40
python3 python_wrappers/servo_cli.py move_to_pca_multi 0 900 0x40

# Continuous rotation:
python3 python_wrappers/servo_cli.py rotate_continuous_pca 0 cw 20 1000 0x40
python3 python_wrappers/servo_cli.py rotate_continuous_pca 0 ccw 30 1000 0x40
````

### Routing Debug
When you trigger a movement, the server logs the routed call, for example:
- "🧭 Python call => servo_cli.py move_to_pca_multi 0 90 0x40"
- "🧭 Python call => servo_cli.py rotate_continuous_pca 0 cw 20 1000 0x40"

### About Positional Feedback
The GoBilda dual‑mode servo internally closes the loop in positional mode (500–2500µs ↔ 0–1800°). If you want to observe actual position in real time (analog feedback pin), add an ADC (e.g., ADS1115/ADS1015) and we can expose a `readPosition` action. For now, scenes can rely on commanded angles with clamping and timeouts.

## 🧩 Setup Pages

- Setup Hub: http://localhost:3000/setup
- Parts: http://localhost:3000/setup/parts
- Poses: http://localhost:3000/setup/poses
- Characters: http://localhost:3000/setup/characters
- Calibration: http://localhost:3000/setup/calibration
- Audio: http://localhost:3000/setup/audio
- Webcam: http://localhost:3000/setup/webcam
- Super Powers: http://localhost:3000/setup/super-powers
- System: http://localhost:3000/setup/system
- Models: http://localhost:3000/setup/models


## Status Snapshot (Current)

- Global stability: crash guards; tests pass reliably on CI-like environment
- Models system: implemented across servo, led, linear_actuator, webcam with CRUD and push-defaults
- Parts CRUD: end-to-end working with inline per-type tests (drawers present in UI)
- Webcam:
  - MJPEG live stream + device scan/probe + autodetect
  - WebRTC (beta) with health check and optional audio pipeline
  - Include Audio toggle in Setup → Webcam; server uses ALSA "default"
- Live Mode: Quick Poses wired to POST /poses/:id/execute with spinner/status
- Scenes: MVP implemented (create/list/delete/playback sequencing poses)
- Orlok hardware smoke: servos/sensors/actuator/speaker verified previously; webcam stream via MJPEG with V4L2 camera; WebRTC requires `wrtc` installed on Pi


## 📹 Webcam Streaming (MJPEG + WebRTC)

This app provides two streaming paths you can use from Setup → Webcam:
- MJPEG: simplest, widely compatible (<img> element)
- WebRTC (beta): lower latency; requires `wrtc` server module

### System dependencies (Raspberry Pi)

```bash
# Core tools for webcam and building wrtc
sudo apt-get update
sudo apt-get install -y ffmpeg v4l-utils build-essential python3 make g++ libnss3
```

### Node dependency for WebRTC (server)

```bash
cd apps/monsterbox4
npm install wrtc
```

If `wrtc` is missing, the WebRTC endpoint returns 501 with an install hint.

### UI usage (Setup → Webcam)

1) Create a webcam Part (Setup → Parts → Create → type=webcam)
   - Leave config empty to auto-detect, or set `config.devicePath` (e.g., "/dev/video0")
2) Go to Setup → Webcam
3) Click "Scan Devices" to see which /dev/videoN nodes are usable
4) Select your webcam part, keep "Autodetect camera" checked, and:
   - Click "Start Stream" for MJPEG
   - Or click "Start WebRTC" for WebRTC (beta)

Notes
- MJPEG endpoint: `/setup/webcam/api/parts/:id/stream?auto=1`
- Device APIs: `/setup/webcam/api/devices`, `/setup/webcam/api/devices/probe`
- WebRTC offer endpoint (server answers): `POST /setup/webcam/api/parts/:id/webrtc/offer?auto=1`
- WebRTC health: `GET /setup/webcam/api/webrtc/health` returns `{ success, wrtc, ffmpeg }`
- Audio: check "Include audio" in UI or pass `includeAudio=1` (ALSA `default` device used)
- Pi Camera Module via libcamera may not expose /dev/video0; a UVC USB webcam is recommended for MJPEG/V4L2. If you prefer libcamera-native streaming, we can add an alternate path.

### Curl smoke checks

```bash
# List device nodes
curl -s http://localhost:3000/setup/webcam/api/devices | jq

# Probe each node with ffmpeg (✅ ok / ❌ fail + reason)

## 🎬 Scenes (MVP)

- UI: Scenes page at http://localhost:3000/scenes
  - Create a scene by name
  - List existing scenes
  - Play a scene (sequences poses with optional delays)
  - Delete a scene
- Data is stored in `data/scenes.json` (path resolved via config `dataPath`)

APIs:
- `GET /scenes/api` → list scenes
- `POST /scenes/api { name, steps: [] }` → create
- `PUT /scenes/api/:id { name?, steps? }` → update
- `DELETE /scenes/api/:id` → delete
- `POST /scenes/api/:id/play` → play scene now (blocking until finished)

Example create + play:
````bash
curl -s -X POST http://localhost:3000/scenes/api \
  -H 'Content-Type: application/json' \
  -d '{"name":"Quick Test","steps":[{"poseId":1,"delayMs":250}]}' | jq

curl -s -X POST http://localhost:3000/scenes/api/1/play | jq
````

curl -s http://localhost:3000/setup/webcam/api/devices/probe | jq

# Try MJPEG stream in browser
http://localhost:3000/setup/webcam/api/parts/42/stream?auto=1
```



## �👥 Characters Management

MonsterBox 4.0 lets you manage multiple characters and pick which one is active. The active character is used throughout the app for parts and poses.

- Manage at Setup → Characters (http://localhost:3000/setup/characters)
- Current selection is shown in the navbar dropdown and can be changed from any page
- Persisted in data/characters.json; current selection is also stored in app config

Endpoints:
- GET /setup/characters/api/characters → list characters
- GET /setup/characters/api/characters/:id → get one character
- POST /setup/characters/api/characters { name } → create character
- PUT /setup/characters/api/characters/:id { name? } → update character
- DELETE /setup/characters/api/characters/:id → delete character
- GET /setup/characters/api/current → current selected id
- POST /setup/characters/api/select { id } → set current character


### Characters API Examples

```bash
# List characters
curl -s http://localhost:3000/setup/characters/api/characters | jq

# Get one character
curl -s http://localhost:3000/setup/characters/api/characters/1 | jq

# Create character (success)
curl -s -X POST http://localhost:3000/setup/characters/api/characters \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nosferatu"}' | jq

# Create character (validation error: empty name -> 400)
curl -i -s -X POST http://localhost:3000/setup/characters/api/characters \
  -H 'Content-Type: application/json' -d '{}'
# Expected: HTTP/1.1 400 Bad Request
# Body: { "success": false, "error": "Name is required" }

# Update character name (success)
curl -s -X PUT http://localhost:3000/setup/characters/api/characters/1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Orlok Prime"}' | jq

# Update character (validation error: empty name -> 400)
curl -i -s -X PUT http://localhost:3000/setup/characters/api/characters/1 \
  -H 'Content-Type: application/json' -d '{"name":""}'
# Expected: HTTP/1.1 400 Bad Request
# Body: { "success": false, "error": "Name is required" }

# Get current selection
curl -s http://localhost:3000/setup/characters/api/current | jq

# Set current selection
curl -s -X POST http://localhost:3000/setup/characters/api/select \
  -H 'Content-Type: application/json' -d '{"id":1}' | jq

# Attempt to delete the currently selected character -> 400
curl -i -s -X DELETE http://localhost:3000/setup/characters/api/characters/1
# Expected: HTTP/1.1 400 Bad Request
# Body: { "success": false, "error": "Cannot delete the currently selected character" }
```

## 📦 Data Path Convention

- Default data lives inside the app: `apps/monsterbox4/data/*.json`
- Characters file default: `apps/monsterbox4/data/characters.json`
- You can override the data folder via `apps/monsterbox4/config/app-config.json`:
  - `dataPath` is resolved relative to the app root (`apps/monsterbox4`), not the working directory
  - Examples:
    - `"data"` → `apps/monsterbox4/data/`
    - `"../../data"` → repository-level `data/` (i.e., `apps/monsterbox4/../../data`)
- Selected character is persisted in `config/app-config.json` (`selectedCharacter`), not in `characters.json`.
- The app no longer attempts to use paths like `/home/remote/data/characters.json`.

## 📁 Directory Structure

```
apps/monsterbox4/
├── server.js                 # Express entry point
├── package.json              # Dependencies and scripts
├── config/
│   └── app-config.json       # Application configuration
├── routes/                   # Express routes
│   ├── setup/               # Setup interface routes
│   ├── live/                # Live mode routes
│   ├── scenes/              # Scene management
│   └── poses/               # Pose API routes
├── controllers/             # Business logic
│   ├── posesController.js   # Pose management
│   └── ...
├── services/                # Service layer
│   ├── hardwareService/     # Hardware abstraction
│   │   ├── exec.js         # Python execution helper
│   │   ├── servo.js        # Servo control
│   │   ├── motor.js        # Motor control
│   │   └── ...
│   └── poses/              # Pose system
│       ├── poseEngine.js   # Pose execution engine
│       └── poseRepository.js # Data management
├── views/                   # EJS templates
│   ├── components/         # Shared components
│   ├── setup/              # Setup pages
│   └── live/               # Live mode pages
├── public/                  # Static assets
│   ├── css/                # Custom styles
│   └── js/                 # Client-side JavaScript
├── python_wrappers/         # Python CLI wrappers
│   └── servo_cli.py        # Servo control wrapper
└── tests/                   # Test suite

## 🧰 Models System (Per Part Type)

- Supported types: servo, led, linear_actuator, webcam
- Each Part may reference a Model via `config.modelId`
- Merge order when executing actions: model defaults < part config < explicit params
- Manage at Setup → Models (CRUD + bulk apply to parts)

APIs:
- GET /setup/models/api/:type → list models
- GET /setup/models/api/:type/:id → get model
- POST /setup/models/api/:type { name, description?, defaults? } → create
- PUT /setup/models/api/:type/:id { name?, description?, defaults? } → update
- DELETE /setup/models/api/:type/:id → delete

Notes:
- Servo models auto-seeded from legacy `data/servos.json` on first access
- UI shows a Model selector in Parts Create/Edit; selecting a model can inject its defaults into the config preview
- Parts list shows selected Model name as a badge; edit modal merges selected model defaults into the config preview


    └── basic.test.js       # Basic functionality tests
```

## 🎭 Using Poses

### Creating Poses

#### From Templates (Recommended)
1. Go to **Setup → Poses**
2. Click **Create Pose**
3. Select **From Template** tab
4. Choose template (Bend Elbow, Head Movement)
5. Select option (Half Bend, Look Forward, etc.)
6. Choose target part
7. Click **Create Pose**

#### Quick Template Creation
In the Templates panel, click any option button to instantly create a pose with the first available servo part.

### Executing Poses

#### Live Dashboard
- Go to **Live Mode**
- Click any pose button to execute immediately
- View execution status and results

#### API
```bash
# Execute pose by ID
curl -X POST http://localhost:3000/poses/1/execute \
  -H "Content-Type: application/json" \
  -d "{}"
```

### Pose Templates

#### Elbow Templates
- **Slight Bend** (20°)
- **Half Bend** (45°)
- **Full Bend** (90°)
- **Extend Fully** (0°)

#### Head Templates
- **Look Forward** (stop/neutral)
- **Random Movement** (subtle wiggle pattern)
- **Full Rotation** (360° continuous)

## 🔧 Hardware Configuration

### Servo Calibration
Poses use calibration data from `data/servo_calibrations.json` to ensure safe operation:

```json
{
  "30": {
    "part_id": 30,
    "part_name": "Orloks Elbow",
    "servo_type": "standard",
    "positions": {
      "min": { "pulse_us": 1000, "angle": -90 },
      "max": { "pulse_us": 2000, "angle": 90 },
      "neutral": { "pulse_us": 1500, "angle": 0 }
    }
  }
}
```

### Safety Features
- **Angle clamping** to calibrated min/max ranges
- **Pulse width validation**
- **Timeout protection** on hardware commands
- **Fail-fast error policy** with descriptive messages (no simulation fallback)

## 🌐 API Reference

### Poses API

#### Get All Poses
```
GET /poses
```

#### Execute Pose
```
POST /poses/:id/execute
```

#### Create from Template
```
POST /poses/from-template
Body: {
  "templateName": "elbow",
  "option": "Half Bend",
  "partId": "30"
}
```

#### Get Templates
```
GET /poses/templates
```

## 🧪 Testing

Important: The Mocha tests call the running HTTP server at http://localhost:3000. Start the server in a separate terminal before running tests.

```bash
# Terminal 1: start the server
cd apps/monsterbox4
npm start

# Terminal 2: run tests against the running server
cd apps/monsterbox4
npm run test:unit
```

Tip: After making server-side code changes, restart the server before re-running tests.


```bash
# Run all Mocha unit/integration tests (fast)
npm run test:unit

# Run all Playwright UI tests
npm run test:ui

# Headed UI tests (visible browser)
npm run test:ui-headed
```

### Overnight unattended prompt (copy/paste)

````bash
# Terminal 1: start the server
cd apps/monsterbox4 && npm start

# Terminal 2: verify health + run tests
cd apps/monsterbox4
# Quick WebRTC health
curl -s http://localhost:3000/setup/webcam/api/webrtc/health | jq
# Unit/integration tests (Mocha)
npm run test:unit
# API scenes tests (Mocha, optional if not included in unit set)
npx mocha tests/scenes-api.test.js --timeout 15000
# UI smoke tests (Playwright)
npm run test:ui
````
npm run test:ui-headed

```

### Running tests against real hardware (Orlok)

- Tests adapt to hardware presence using `MONSTERBOX_HARDWARE_AVAILABLE`.
- On Orlok (full hardware installed), set the env var so tests expect success:

````bash
# Terminal 1 (server)
cd apps/monsterbox4 && npm start

# Terminal 2 (tests expecting real hardware)
MONSTERBOX_HARDWARE_AVAILABLE=true npm run test:unit
````

Notes:
- The app reads legacy hardware settings (GPIO, PCA9685) from the repository `data/` folder via `config/app-config.json` → `dataPath` (default points to `../../data`).
- The legacy "Jason" (JSON) files for Orlok are used as-is; pins/channels/addresses map automatically.
- Without hardware, the same tests expect structured failure but still pass.
```bash


# Everything (unit + UI)
npm run test:all
```

### Orlok smoke checklist (real hardware)

- Ensure app-config.json points dataPath to `../../data` (legacy Orlok JSON)
- Export env so tests expect real hardware results:
  - `MONSTERBOX_HARDWARE_AVAILABLE=true`
- Quick manual checks via Setup → Parts drawers or curl:
  - Servo: moveToAngle 10–15°; verify motion and no binding
  - LED: setBrightness 50%; Blink 2 cycles
  - Light: toggle on/off
  - Motor: control cw @ 40–50% for 500–1000ms
  - Linear actuator: extend/retract small distance; Stop works
  - Sensor: read shows 0/1; flips when you physically toggle input
  - Motion sensor: read returns 1 when waving a hand
  - Webcam: capture still; verify file saved under /tmp/monsterbox_capture_*.jpg
  - Microphone: getLevel returns >0 when tapping the mic
  - Speaker: play a short mp3, then stop; set volume
  - Head tracking: getPosition returns coordinates (face → high confidence)


## � Hardware Part Testing (Per‑Type)

MonsterBox 4.0 provides CRUD for Parts and a unified test endpoint for exercising hardware functionality per part type.

- Endpoint: `POST /setup/parts/api/parts/:id/test`
- Pass an explicit `action` and optional `params` for per‑type testing; if omitted, a sensible default action is chosen
- Actions are routed through the Hardware Service and, where available, call Python wrappers for real hardware

Example: test a servo by moving to a small angle

````bash
curl -s -X POST http://localhost:3000/setup/parts/api/parts/19/test \
  -H 'Content-Type: application/json' \
  -d '{"action":"moveToAngle","params":{"angleDeg":15}}' | jq
````

Example: test an LED by setting brightness

````bash
curl -s -X POST http://localhost:3000/setup/parts/api/parts/7/test \
  -H 'Content-Type: application/json' \
  -d '{"action":"setBrightness","params":{"brightness":50}}' | jq
````

Example: test a motor by running forward at 40% for 1s

````bash
curl -s -X POST http://localhost:3000/setup/parts/api/parts/8/test \
  -H 'Content-Type: application/json' \
  -d '{"action":"control","params":{"direction":"forward","speed":40,"duration":1000}}' | jq
````

Example: test a linear actuator by extending for ~1s

````bash
curl -s -X POST http://localhost:3000/setup/parts/api/parts/103/test \
  -H 'Content-Type: application/json' \
  -d '{"action":"extend","params":{"speed":50,"duration":1000}}' | jq
````

Note: If your part config includes `directionPin`/`pwmPin`, those are used; otherwise the service derives `directionPin = pin` and `pwmPin = pin + 1`.


Example: test a light by toggling briefly

````bash
curl -s -X POST http://localhost:3000/setup/parts/api/parts/9/test \
  -H 'Content-Type: application/json' \
  -d '{"action":"toggle","params":{}}' | jq
````

### No‑Fallback Policy and Error Behavior

This app does not simulate non‑functional parts. If a wrapper or dependency is missing, requests fail with clear, descriptive errors. Typical API response shape on failure:

````json
{
  "success": false,
  "error": "Hardware command failed",
  "message": "servo_control not available (lgpio or deps missing)",
  "rawOutput": "{\"status\":\"error\",\"message\":\"...\"}"
}
````

Actionable steps:
- Check the `message` and `rawOutput` for root cause
- Ensure Python deps are installed: see `scripts/requirements.txt`
- Verify permissions for GPIO/I2C and that the correct pins are wired

Current controller coverage (apps/monsterbox4/services/hardwareService):
- servo: real hardware via Python wrappers (exec.js → python_wrappers/servo_cli.py)
- motor: real hardware via Python wrappers (exec.js → python_wrappers/motor_cli.py)
- light: real hardware via Python wrappers (exec.js → python_wrappers/light_cli.py)
- led: real hardware via Python wrappers (exec.js → python_wrappers/led_cli.py)
- pca9685: interface available; currently simulated (can be wired to hardware)
- linear_actuator: real hardware via Python wrappers (exec.js → python_wrappers/actuator_cli.py)
- sensor: real hardware via Python wrappers (exec.js  python_wrappers/sensor_cli.py)
- motion_sensor: real hardware via Python wrappers (exec.js  python_wrappers/sensor_cli.py)
- webcam: capture wired to real hardware (exec.js → python_wrappers/webcam_cli.py)
- microphone: getLevel wired to real hardware (exec.js → python_wrappers/microphone_cli.py)
- speaker: play/stop/setVolume wired to real hardware (exec.js → python_wrappers/speaker_cli.py)
- head_tracking: getPosition wired to real hardware (exec.js → python_wrappers/head_tracking_cli.py)


Note: There is no simulation fallback. If a wrapper or hardware dependency is missing, the API returns a descriptive error with raw stderr/stdout to aid diagnosis.

Recommended UI behavior on Setup → Parts:
- Each part row exposes a compact “Test” drawer with per‑type controls:
  - Servo: angle slider; rotate cw/ccw; stop
  - Motor: direction, speed, duration
  - Linear actuator: extend/retract with speed/distance
  - Light: on/off/toggle
  - LED: brightness slider; blink; fade
  - Sensor: on‑demand Read; Calibrate (min/max)
  - Motion sensor: Read (motion detected true/false)
  - Microphone: record N ms; get level
  - Speaker: play file; set volume; stop
  - Webcam: capture still; start/stop local stream
  - Head tracking: start/stop; get position
- POST the selected `action` + `params` to `/setup/parts/api/parts/:id/test` and show structured results
- For Sensor/Motion Sensor “live read”, poll the test endpoint every 0.5–1s for a short window and display values

Implementation note: You can reuse the existing Python Hardware Abstraction Layer in `scripts/hardware/…` by adding thin CLIs under `apps/monsterbox4/python_wrappers/` and calling them via `exec.runWrapper()` (similar to servo). This keeps the single‑node design (no websockets) while leveraging proven code.

---

## 🗺️ Remaining Work & Next Steps

- WebRTC (beta)
  - Add microphone device selector UI (ALSA hw:x,y) and pass to server
  - Optional: expose bitrate/framerate controls
  - Optional: libcamera-native path for Pi Camera Modules
- Scenes
  - Add step editor UI (add/remove steps, choose pose, per-step delay)
  - Non-blocking background playback + Stop action
  - Optional: loop/tempo controls and timeline preview
- Calibration
  - Wire Calibration page to read/update `data/servo_calibrations.json` through an API with validation and tests
- CI/CD
  - GitHub Actions: install deps; run unit tests; install Playwright browsers (webkit; optionally firefox); run UI tests headless; upload Playwright report on failure
- Dependency hygiene
  - Review Dependabot alerts; apply safe upgrades; re‑run tests
- Deployment
  - Add systemd/PM2 service, healthcheck route, and smoke scripts
  - Document ARM64 constraints (no Chromium), use WebKit/Firefox

Constraints to honor
- ES5 syntax in client scripts
- Single‑node, no websockets required for the main app
- ARM64 environment (no Chrome/Chromium)

## �🔄 Migration from Legacy MonsterBox

MonsterBox 4.0 is designed to run alongside the legacy system initially:

1. **Data Compatibility**: Uses existing `data/` files (parts.json, servo_calibrations.json, etc.)
2. **Hardware Scripts**: Reuses all existing Python hardware scripts without modification
3. **Character Support**: Maintains character-specific configurations
4. **Gradual Migration**: Can be deployed per-character as needed

## 🎯 Design Principles

### Single Node Architecture
- **One RPi per character** - no distributed complexity
- **Local hardware control** - no WebSocket services
- **Self-contained operation** - no external dependencies

### Safety First
- **Calibration enforcement** on all movements
- **Safe angle clamping** prevents hardware damage
- **Timeout protection** prevents runaway commands
- **Fail-fast, no-fallback policy** with clear, descriptive errors

### Developer Experience
- **Clean code structure** with clear separation of concerns
- **Comprehensive error handling** with meaningful messages
- **Extensive logging** for debugging
- **Simple deployment** with single command startup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the logs in the browser console
2. Review hardware connections and calibration
3. Inspect API responses for `message` and `rawOutput` fields (Python stderr/stdout)
4. Verify Python dependencies (scripts/requirements.txt) and permissions (e.g., lgpio)
5. Create an issue with detailed error information

---

**MonsterBox 4.0** - Bringing animatronics to life with clean, safe, and powerful control! 🎭🤖
