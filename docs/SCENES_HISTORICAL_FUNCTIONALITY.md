# Historical Scenes Functionality - Complete Summary

**Date:** 2025-10-14  
**Purpose:** Document all historical Scenes features from ARCHIVE and git history to guide restoration/implementation

---

## Executive Summary

The MonsterBox Scenes system has evolved significantly over multiple versions. This document captures all historical functionality discovered from ARCHIVE files and git commit history, identifying what's currently implemented and what needs to be restored or built.

---

## 1. Scene Templates System

**Status:** ❌ NOT IMPLEMENTED (Historical feature from commit 45c47578)

**Source:** `ARCHIVE/data/scene-templates.json`

### Description
Pre-built scene templates that users can use as starting points for creating new scenes. Templates are organized by category and include common animatronic sequences.

### Template Categories
- **movement** - Basic servo/motor movements
- **effects** - Sound and light combinations
- **sequences** - Complex multi-step sequences
- **interaction** - Voice and movement combinations
- **interactive** - Sensor-triggered actions

### Available Templates
1. **basic_movement** - Simple servo movement template
2. **sound_and_light** - Play sound with light effect
3. **scare_sequence** - Complete scare sequence with movement, sound, and lights
4. **linear_actuator_sequence** - Extend and retract linear actuator
5. **voice_interaction** - Voice with movement and effects
6. **sensor_triggered** - Action triggered by sensor detection

### Implementation Requirements
- API endpoint: `GET /scenes/templates` - List all templates
- API endpoint: `POST /scenes/from-template` - Create scene from template
- UI: Template selection in scene creation form
- Data file: `data/scene-templates.json`

---

## 2. Scene Analytics System

**Status:** ❌ NOT IMPLEMENTED (Historical feature from commit 45c47578)

**Source:** `ARCHIVE/services/sceneAnalyticsService.js`, `ARCHIVE/data/scene-analytics.json`

### Description
Comprehensive analytics tracking for scene execution, usage patterns, and performance metrics.

### Features

#### Execution Logging
- Tracks every scene execution with:
  - Scene ID and Character ID
  - Start time, end time, duration
  - Steps executed vs total steps
  - Success/failure status
  - Error messages
  - Performance metrics
- Keeps last 1000 execution logs

#### Usage Statistics
- Per scene/character tracking:
  - Execution count
  - Last executed timestamp
  - Total duration
  - Average duration

#### Performance Metrics
- Average duration
- Min/max duration
- Success rate
- Common errors (top 5)
- Most active scene

#### Popular Scenes
- Ranked by execution count
- Filterable by character
- Configurable limit (default 10)

### API Endpoints Required
- `GET /scenes/analytics` - Get analytics summary
- `GET /scenes/analytics/:sceneId` - Get analytics for specific scene
- `GET /scenes/popular` - Get popular scenes
- `POST /scenes/:id/log-execution` - Log scene execution (internal)

### Data Structure
```json
{
  "executions": [
    {
      "id": "unique-log-id",
      "sceneId": 1,
      "characterId": 5,
      "timestamp": "2025-10-14T12:00:00.000Z",
      "startTime": "2025-10-14T12:00:00.000Z",
      "endTime": "2025-10-14T12:00:15.000Z",
      "duration": 15000,
      "stepsExecuted": 5,
      "totalSteps": 5,
      "success": true,
      "errors": [],
      "performance": {}
    }
  ],
  "usage": {
    "5_1": {
      "sceneId": 1,
      "characterId": 5,
      "executionCount": 42,
      "lastExecuted": "2025-10-14T12:00:00.000Z",
      "totalDuration": 630000,
      "averageDuration": 15000
    }
  },
  "created": "2025-10-14T00:00:00.000Z"
}
```

---

## 3. Scene Import/Export

**Status:** ❌ NOT IMPLEMENTED (Historical feature from commit 45c47578)

**Source:** `ARCHIVE/controllers/sceneController.js` (lines 250-295)

### Description
Export scenes to JSON files for backup/sharing, and import scenes from JSON files.

### Features

#### Export
- Export all scenes or scenes for specific character
- Filename format: `scenes_character_{id}_{date}.json` or `scenes_all_{date}.json`
- JSON format with full scene data

#### Import
- Import scenes from JSON file
- Options:
  - Overwrite existing scenes (by ID)
  - Target specific character
  - Skip duplicates
- Returns summary: imported count, updated count, skipped count

### API Endpoints Required
- `GET /scenes/export?characterId={id}` - Export scenes
- `POST /scenes/import` - Import scenes
  - Body: JSON scene data
  - Query params: `overwrite=true/false`, `targetCharacterId={id}`

---

## 4. Armed/Active Mode

**Status:** ❌ NOT IMPLEMENTED (Historical feature from commits 636f1d27, 585b340f, b942aa47)

**Source:** `ARCHIVE/scripts/active-mode.js`, `ARCHIVE/views/active-mode.ejs`, `ARCHIVE/routes/activeModeRoutes.js`

### Description
Automated scene execution system that loops through selected scenes with configurable timing and error handling. Can be triggered by sensors or run continuously.

### Features

#### System States
- **ARMED** - System is actively running scenes
- **DISARMED** - System is stopped

#### Configuration
- **Scene Selection** - Choose which scenes to include in playlist
- **Scene Delay** - Configurable delay between scenes (seconds)
- **Max Retries** - Number of retry attempts for failed scenes
- **Scene Timeout** - Maximum time allowed for scene execution (seconds)
- **Max Consecutive Failures** - Auto-disarm threshold

#### Execution Loop
1. Load selected scenes into playlist
2. Execute scenes sequentially with configured delay
3. Loop back to first scene when playlist completes
4. Track loop count and display progress

#### Error Handling
- Retry failed scenes up to MAX_RETRIES
- Track consecutive failures
- Auto-disarm if MAX_CONSECUTIVE_FAILURES reached
- Display error messages in output log

#### UI Features
- Arm/Disarm buttons with confirmation dialogs
- Scene selection (drag & drop, sortable)
- Visual timeline showing scene timing
- System info display:
  - Current scene name and ID
  - Loop count
  - Consecutive failures
  - Max retries setting
  - Scene timeout setting
- Real-time output log
- Scene details (name, step count)

#### Sensor Integration
- Scenes can be triggered by sensor input
- Motion detection integration
- Configurable sensor thresholds
- Armed sensors data file: `data/armedSensors.json`

### API Endpoints Required
- `GET /active-mode` - Render active mode UI
- `POST /active-mode/arm` - Arm the system
- `POST /active-mode/disarm` - Disarm the system
- `GET /active-mode/status` - Get current status
- `POST /active-mode/scenes` - Update scene playlist
- `GET /active-mode/scenes` - Get current playlist

### Data Files
- `data/armedSensors.json` - Sensor configurations for armed mode

---

## 5. Scene Lifecycle Management

**Status:** ✅ IMPLEMENTED (commit 249faa41)

**Source:** `services/scenes/sceneQueue.js`, `services/scenes/queueLibrary.js`

### Features (All Working)
- ✅ Three lifecycle modes:
  - `run_once` - Execute scene once
  - `run_for_duration` - Loop scene for specified duration (seconds)
  - `loop_until_disabled` - Loop scene until max_duration or stop requested
- ✅ Queue modes:
  - `sequential` - Execute scenes in order, then stop
  - `loop_queue` - Execute scenes in order, then restart from beginning
- ✅ Priority scene insertion
- ✅ Pause/resume/skip functionality
- ✅ Emergency stop
- ✅ Queue status tracking

### API Endpoints (All Working)
- ✅ `POST /scenes/api/queue/start-config` - Start queue with configuration
- ✅ `GET /scenes/api/queue` - Get queue status
- ✅ `POST /scenes/api/queue/pause` - Pause queue
- ✅ `POST /scenes/api/queue/resume` - Resume queue
- ✅ `POST /scenes/api/queue/skip` - Skip current scene
- ✅ `POST /scenes/api/queue/insert` - Insert priority scene
- ✅ `POST /scenes/api/queue/emergency-stop` - Emergency stop

---

## 6. Scene Step Types

**Status:** ✅ MOSTLY IMPLEMENTED

**Source:** `services/scenes/sceneExecutor.js`

### Implemented Step Types
- ✅ `pose` - Execute a saved pose
- ✅ `audio` - Play audio file
- ✅ `part` - Control individual hardware part
- ✅ `wait` - Pause for specified duration
- ✅ `sayThis` - Text-to-speech
- ✅ `goblin` / `goblin-video` - Play video on Goblin display

### Missing Step Types (from templates)
- ❌ `sensor` - Wait for sensor input (template exists, not implemented)
- ❌ `light` - Control light (may be covered by `part` type)
- ❌ `servo` - Direct servo control (may be covered by `part` type)
- ❌ `linear-actuator` - Direct actuator control (may be covered by `part` type)
- ❌ `voice` - Voice with specific voice ID (may be covered by `sayThis`)

### Concurrent Execution
- ✅ Steps can be marked as `concurrent: true`
- ✅ Concurrent steps execute in parallel with next step

---

## 7. Scene CRUD Operations

**Status:** ✅ IMPLEMENTED

**Source:** `services/scenes/scenesService.js`, `routes/scenes/api.js`

### Features (All Working)
- ✅ Create scene
- ✅ Read scene (by ID, by character)
- ✅ Update scene
- ✅ Delete scene
- ✅ List scenes
- ✅ Step management within scenes

---

## Implementation Priority

### Phase 1: Core Missing Features (High Priority)
1. **Scene Templates System**
   - Restore `data/scene-templates.json`
   - Add API endpoints for templates
   - Update scene creation UI to support templates

2. **Scene Analytics Service**
   - Restore `services/sceneAnalyticsService.js`
   - Create `data/scene-analytics.json`
   - Integrate analytics logging into scene execution
   - Add analytics API endpoints

3. **Scene Import/Export**
   - Add export endpoint
   - Add import endpoint with validation
   - Add UI buttons for import/export

### Phase 2: Advanced Features (Medium Priority)
4. **Armed/Active Mode**
   - Create active mode routes
   - Create active mode UI
   - Implement execution loop with error handling
   - Add sensor integration

5. **Scene Duplication**
   - Add duplicate endpoint
   - Add UI button for duplication

### Phase 3: Enhancement (Low Priority)
6. **Sensor Step Type**
   - Implement sensor step execution
   - Add sensor threshold checking
   - Integrate with hardware service

7. **Analytics Dashboard**
   - Create analytics visualization UI
   - Add charts for execution trends
   - Add popular scenes display

---

## Testing Requirements

Each feature must have:
1. Unit tests for service layer
2. API endpoint tests
3. UI tests (Playwright)
4. Integration tests with hardware (where applicable)

---

## Notes

- All historical features were well-designed and functional
- Current system has excellent foundation (lifecycle, queue, executor)
- Missing features are primarily UI and analytics
- Sensor integration needs hardware testing
- Armed mode is critical for unattended operation

---

**End of Document**

