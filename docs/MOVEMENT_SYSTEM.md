# MonsterBox Lifelike Movement System — Design Document

## Overview

A layered movement system that makes animatronic characters appear alive through idle animations, smooth transitions, micro-movements (breathing/drift), and a priority-based servo claim system. All movement respects the existing architecture: Node.js services calling Python wrappers via child_process, no new frameworks or dependencies.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Priority Manager                    │
│  scene > head_tracking > jaw > idle > micro_movement │
│  Servo claim/release registry per character           │
└──────────┬──────────────────────────────┬────────────┘
           │                              │
    ┌──────▼──────┐              ┌────────▼────────┐
    │  Transition  │              │  Idle Loop       │
    │  Engine      │              │  Service         │
    │  (easing)    │              │  (random poses)  │
    └──────┬──────┘              └────────┬────────┘
           │                              │
    ┌──────▼──────────────────────────────▼────────┐
    │            Servo Command Buffer               │
    │  Batches commands, resolves conflicts          │
    │  Outputs to hardwareService/servo.js           │
    └──────────────────┬───────────────────────────┘
                       │
              ┌────────▼────────┐
              │  servo.js →     │
              │  servo_cli.py → │
              │  PCA9685 I2C    │
              └─────────────────┘
```

## Component Design

### 1. Pose Library (`services/movement/poseLibrary.js`)

Per-character named poses stored in existing `data/character-{id}/poses.json`.

**New fields per pose:**
```json
{
  "id": 1,
  "name": "menacing_lean",
  "parts": [
    { "partId": "5", "value": 90, "speed": 50 }
  ],
  "holdVariance": 500,
  "transitionProfile": "ease_in_out",
  "tags": ["idle", "menacing"],
  "weight": 10
}
```

- `holdVariance` (ms): Random ±variance added to hold time between poses
- `transitionProfile`: Named easing curve for transitions TO this pose
- `tags`: Categorization for idle selection (e.g., "idle", "alert", "menacing")
- `weight`: Weighted random selection probability for idle loop

**Functions:**
- `getIdlePoses(characterId)` — Filter poses tagged "idle", return with weights
- `getRandomIdlePose(characterId, excludeId)` — Weighted random selection excluding current
- `getPoseById(characterId, poseId)` — Direct lookup

### 2. Transition Engine (`services/movement/transitionEngine.js`)

Converts instant servo jumps into smooth, eased movements.

**Easing Functions:**
```javascript
const EASING = {
  linear:       t => t,
  ease_in:      t => t * t,
  ease_out:     t => t * (2 - t),
  ease_in_out:  t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  overshoot:    t => {
    const s = 1.70158;
    return (t -= 1) * t * ((s + 1) * t + s) + 1;
  },
  bounce:       t => {
    if (t < 1/2.75) return 7.5625 * t * t;
    if (t < 2/2.75) return 7.5625 * (t -= 1.5/2.75) * t + 0.75;
    if (t < 2.5/2.75) return 7.5625 * (t -= 2.25/2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625/2.75) * t + 0.984375;
  }
};
```

**Per-servo transition curves** (in character movement config):
```json
{
  "servoTransitions": {
    "5": { "easing": "ease_in_out", "maxSpeedDegPerSec": 60 },
    "7": { "easing": "overshoot", "maxSpeedDegPerSec": 120 }
  }
}
```

**Core function:**
```javascript
async transitionServo(partId, fromAngle, toAngle, durationMs, easingName, onStep)
```
- Calculates intermediate positions at ~50ms intervals (20Hz update rate)
- Calls `onStep(currentAngle)` for each intermediate position
- Returns Promise that resolves when transition complete
- Respects `maxSpeedDegPerSec` to prevent servo damage

**Momentum overshoot:**
- When `overshoot` easing is used, servo briefly passes target by configurable percentage
- Per-servo overshoot amount in character config (default 5%)

### 3. Idle Loop Service (`services/movement/idleLoopService.js`)

Background service that cycles through idle poses when no higher-priority system is active.

**Lifecycle:**
```
start(characterId) → running loop → stop()
                          ↓
              pick weighted random idle pose
                          ↓
              check priority manager (claim servos)
                          ↓
              transition to pose (via transitionEngine)
                          ↓
              hold for duration ± holdVariance
                          ↓
              add micro-movement overlay
                          ↓
              loop back to pick next pose
```

**Configuration** (`data/character-{id}/movement-config.json`):
```json
{
  "idle": {
    "enabled": false,
    "minHoldMs": 3000,
    "maxHoldMs": 8000,
    "transitionDurationMs": 2000,
    "defaultEasing": "ease_in_out"
  },
  "microMovement": {
    "enabled": false,
    "breathingAmplitudeDeg": 2,
    "breathingPeriodMs": 4000,
    "driftAmplitudeDeg": 1,
    "driftPeriodMs": 7000,
    "jitterAmplitudeDeg": 0.5,
    "jitterIntervalMs": 500
  },
  "characterPersonality": "slow_menacing",
  "servoTransitions": {}
}
```

**Micro-movement overlay:**
- Sinusoidal breathing: `amplitude * sin(2π * t / period)` on configured servos
- Random drift: Perlin-like slow wandering on all idle servos
- Jitter: Small random ± on configured servos at intervals
- All overlays are additive on top of current pose angle
- Micro-movement runs continuously while idle, pauses when higher priority claims servo

### 4. Priority Manager (`services/movement/priorityManager.js`)

Central registry for servo ownership. Prevents conflicts between systems.

**Priority levels (highest first):**
```javascript
const PRIORITY = {
  SCENE:          100,  // Scene execution (absolute priority)
  HEAD_TRACKING:   80,  // Head tracking following faces
  JAW:             70,  // Jaw animation synced to audio
  IDLE:            30,  // Idle pose cycling
  MICRO_MOVEMENT:  10   // Breathing/drift overlay
};
```

**Servo claim registry:**
```javascript
// In-memory map: servoPartId → { owner, priority, claimedAt }
const servoClaims = new Map();
```

**Functions:**
- `claimServo(partId, owner, priority)` → `{ granted: bool, previousOwner }`
  - Grants if unclaimed or caller has higher/equal priority
  - Returns false if lower priority (does NOT preempt, caller must handle)
- `releaseServo(partId, owner)` → releases claim if owner matches
- `releaseAll(owner)` → release all claims by owner (e.g., scene ends)
- `getOwner(partId)` → current owner info or null
- `isAvailable(partId, minPriority)` → check without claiming

**Preemption protocol:**
1. Higher priority system calls `claimServo()` → gets granted
2. Lower priority system's next movement tick checks `getOwner()` → sees preempted
3. Lower priority system pauses that servo (continues others if available)
4. When higher priority calls `releaseServo()`, lower priority resumes on next tick

**No forced interruption:** The priority manager is advisory. Each system checks claims before sending servo commands. No system forcefully stops another mid-movement.

### 5. Servo Command Buffer (`services/movement/servoCommandBuffer.js`)

Thin layer that batches and deduplicates servo commands.

**Functions:**
- `queueCommand(partId, angle, priority)` — Add to buffer
- `flush()` — Send all queued commands to hardware (called at 20Hz by tick loop)
- If multiple commands for same servo in one tick, highest priority wins
- Converts angles to pulse widths using existing `servo.angleToPulse()`

### 6. Per-Character Personality Profiles

Stored in `data/character-{id}/movement-config.json`:

**Orlok (char 3) — Slow & Menacing:**
```json
{
  "characterPersonality": "slow_menacing",
  "idle": {
    "enabled": false,
    "minHoldMs": 5000,
    "maxHoldMs": 12000,
    "transitionDurationMs": 3000,
    "defaultEasing": "ease_in_out"
  },
  "microMovement": {
    "enabled": false,
    "breathingAmplitudeDeg": 1.5,
    "breathingPeriodMs": 5000,
    "driftAmplitudeDeg": 0.5,
    "driftPeriodMs": 10000
  }
}
```

**Mina (char 2) — Fluid & Expressive:**
```json
{
  "characterPersonality": "fluid_expressive",
  "idle": {
    "enabled": false,
    "minHoldMs": 2000,
    "maxHoldMs": 5000,
    "transitionDurationMs": 1500,
    "defaultEasing": "ease_in_out"
  },
  "microMovement": {
    "enabled": false,
    "breathingAmplitudeDeg": 3,
    "breathingPeriodMs": 3500,
    "driftAmplitudeDeg": 2,
    "driftPeriodMs": 5000
  }
}
```

**Sir Dragomir (char 4) — Formal & Stiff:**
```json
{
  "characterPersonality": "formal_stiff",
  "idle": {
    "enabled": false,
    "minHoldMs": 6000,
    "maxHoldMs": 15000,
    "transitionDurationMs": 2500,
    "defaultEasing": "linear"
  },
  "microMovement": {
    "enabled": false,
    "breathingAmplitudeDeg": 1,
    "breathingPeriodMs": 6000,
    "driftAmplitudeDeg": 0.3,
    "driftPeriodMs": 12000
  }
}
```

**PumpkinHead (char 1) — Erratic & Overshoot:**
```json
{
  "characterPersonality": "erratic_overshoot",
  "idle": {
    "enabled": false,
    "minHoldMs": 1000,
    "maxHoldMs": 3000,
    "transitionDurationMs": 800,
    "defaultEasing": "overshoot"
  },
  "microMovement": {
    "enabled": false,
    "breathingAmplitudeDeg": 2,
    "breathingPeriodMs": 2000,
    "driftAmplitudeDeg": 3,
    "driftPeriodMs": 3000,
    "jitterAmplitudeDeg": 1.5,
    "jitterIntervalMs": 300
  }
}
```

**Groundbreaker (char 5) — Heavy & Slow:**
```json
{
  "characterPersonality": "heavy_slow",
  "idle": {
    "enabled": false,
    "minHoldMs": 8000,
    "maxHoldMs": 20000,
    "transitionDurationMs": 4000,
    "defaultEasing": "ease_in"
  },
  "microMovement": {
    "enabled": false,
    "breathingAmplitudeDeg": 1,
    "breathingPeriodMs": 7000,
    "driftAmplitudeDeg": 0.5,
    "driftPeriodMs": 15000
  }
}
```

### 7. Telemetry (`services/movement/movementTelemetry.js`)

Collects servo performance metrics for the Performance Benchmarking panel.

**Metrics collected per servo command:**
- `servoLatencyMs` — Time from command issue to hardware acknowledgment
- `commandsPerSecond` — Throughput of servo command buffer
- `preemptionEvents` — Count of priority claim changes
- `cycleTimeMs` — Full idle loop cycle time

**Smoothness score calculation:**
```javascript
// Compare actual positions to ideal easing curve
// Score 0-100 where 100 = perfect tracking
smoothnessScore = 100 * (1 - avgDeviation / maxDeviation)
```

**Storage:** Append to `data/movement-telemetry.json` with timestamps.
- Rolling 30-day retention, pruned on write
- Entries: `{ timestamp, characterId, servoPartId, metric, value }`

**Aggregation for dashboard:**
- `getMetricSummary(characterId, metric, periodMs)` → `{ avg, min, max, p95 }`
- `getServoHealth(characterId)` → per-servo green/yellow/red based on latency thresholds
  - Green: avg latency < 50ms
  - Yellow: avg latency 50-150ms
  - Red: avg latency > 150ms or error rate > 5%

## Integration Points

### Scene Executor Integration
In `services/scenes/sceneExecutor.js`, servo steps should:
1. Call `priorityManager.claimServo(partId, 'scene', PRIORITY.SCENE)`
2. Use `transitionEngine.transitionServo()` if easing specified in step
3. Call `priorityManager.releaseServo(partId, 'scene')` when scene ends (in cleanup)

### Head Tracking Integration
In `controllers/motionTrackingController.js`:
1. On start: claim pan/tilt servos at HEAD_TRACKING priority
2. On each tracking update: check claim still held, send servo command
3. On stop: release all claimed servos

### Jaw Animation Integration
In `services/jawServoDaemon.js`:
1. On start: claim jaw servo at JAW priority
2. On each angle update: verify claim, send angle
3. On stop: release jaw servo

### Dashboard Integration
- Add "Idle" toggle to Superpowers strip (alongside Jaw, Head Track, etc.)
- Idle toggle calls `/api/movement/idle/start` and `/api/movement/idle/stop`
- Movement telemetry displayed in Systems > Performance tab

## API Endpoints

```
GET  /api/movement/config/:characterId     → movement-config.json contents
PUT  /api/movement/config/:characterId     → update movement config
POST /api/movement/idle/start              → start idle loop for current character
POST /api/movement/idle/stop               → stop idle loop
GET  /api/movement/idle/status             → { running, currentPose, servoClaims }
GET  /api/movement/telemetry               → telemetry summary for dashboard
GET  /api/movement/telemetry/servo/:partId → per-servo health data
POST /api/movement/transition/test         → test a transition (partId, from, to, easing, duration)
```

## File Structure

```
services/movement/
├── poseLibrary.js          # Pose selection and filtering
├── transitionEngine.js     # Easing functions and smooth transitions
├── idleLoopService.js      # Background idle animation loop
├── priorityManager.js      # Servo claim/release registry
├── servoCommandBuffer.js   # Command batching and dedup
└── movementTelemetry.js    # Performance metrics collection

routes/api/
└── movement.js             # REST API for movement system

data/character-{id}/
└── movement-config.json    # Per-character movement personality

data/
└── movement-telemetry.json # Time-series telemetry data
```

## Constraints

- No new npm dependencies
- No WebSocket additions (use existing REST polling for dashboard)
- 20Hz max update rate (50ms tick) to avoid overwhelming RPi4B I2C bus
- All movement services are opt-in (disabled by default in config)
- Graceful degradation: if servo unreachable, log warning and skip
- Test mode (MB_TEST_MODE=1): all hardware calls are no-ops
- File writes for telemetry batched (max 1 write per 30 seconds)
