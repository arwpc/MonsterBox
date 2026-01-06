d# 🎃 MonsterBox 4.0: Complete Poses, Scenes, Steps & Live Mode Implementation

## 📋 CRITICAL: READ README.md FIRST
MANDATORY: Before starting any work, thoroughly read the `README.md` file to understand MonsterBox 4.0's architecture, existing capabilities, and testing requirements. This system builds upon a sophisticated foundation that must be preserved and leveraged.

## 🎯 Project Overview

Implement a comprehensive interactive animatronic control system for MonsterBox 4.0 that includes:

1. Enhanced Poses System (Static & Moving poses)
2. Advanced Scenes System (ordered steps with serial/concurrent execution)
3. New "Part Step" Type (direct hardware control)
4. Live Mode Interface (webcam-centric interactive control)
5. Scene Queue Management (sequential/loop execution)

## 🏗️ Architecture Requirements

### CRITICAL: Leverage MonsterBox 4.0 Capabilities
- REUSE EXISTING SYSTEMS: MonsterBox 4.0 has extensive infrastructure that MUST be leveraged:
  - `services/hardwareService/index.js` - Complete hardware control for all 11 part types
  - `controllers/posesController.js` - Existing pose management and execution
  - `services/poses/poseEngine.js` - Pose execution engine with safety enforcement
  - `routes/scenes/api.js` - Current scene execution system
  - Character isolation system with `data/character-{id}/` structure
  - Bootstrap 5 UI with dark theme
  - Comprehensive testing infrastructure (Playwright + Mocha)

### Legacy Code Reference
- Legacy files should be used ONLY for reference and understanding patterns
- Do NOT copy legacy code - adapt concepts to MonsterBox 4.0 architecture
- MonsterBox 4.0 is single-node, simplified, and more robust

### Character Isolation
- ALL functionality must respect the currently selected character
- Use `data/character-{id}/` directory structure for character-specific data
- Character selection managed via `services/characterService.js` and `controllers/charactersController.js`

## 🎭 System Specifications

### 1. Poses System Enhancement

Static Poses (EXISTING - enhance if needed):
- Move multiple parts to saved positions and hold
- Template-based creation (Bend Elbow, Rotate Head, etc.)
- Safety enforcement with calibration data
- Real-time execution via `poseEngine.executePose()`

Moving Poses (NEW):
- Animate multiple parts to create lifelike movement
- Continuous servo movements with patterns (wiggle, rotate_360, random)
- Duration-based animations
- Concurrent part movements

Implementation Requirements:
- Extend existing `services/poses/poseRepository.js` for moving poses
- Enhance `services/poses/poseEngine.js` to handle continuous movements
- Update pose templates to include moving pose options
- Maintain backward compatibility with existing static poses

### 2. Advanced Scenes System

Scene Structure:
```javascript
{
  "id": 1,
  "name": "Welcome Sequence",
  "description": "Greet visitors with movement and sound",
  "steps": [
    {
      "id": 1,
      "type": "pose",
      "poseId": 5,
      "concurrent": false
    },
    {
      "id": 2,
      "type": "audio",
      "audioId": "welcome.mp3",
      "concurrent": true
    },
    {
      "id": 3,
      "type": "part",
      "partId": 12,
      "partType": "servo",
      "action": "moveToAngle",
      "params": { "angleDeg": 90, "speed": 50, "duration": 2000 },
      "concurrent": false
    },
    {
      "id": 4,
      "type": "wait",
      "duration": 3000,
      "concurrent": false
    }
  ]
}
```

Step Types to Support:
- pose: Execute static or moving poses (EXISTING)
- audio: Play audio files from Audio Library (EXISTING)
- part: Direct hardware control (NEW - see Part Step specification)
- wait: Pause execution for specified duration (NEW)
- sayThis: Text-to-speech using character's assigned voice (NEW)

Execution Requirements:
- Serial execution: Steps run one after another
- Concurrent execution: Steps with `concurrent: true` run simultaneously with next step
- Real-time progress updates via Server-Sent Events (SSE)
- Error handling and recovery
- Emergency stop capability

### 3. Part Step Implementation (CRITICAL NEW FEATURE)

Specification: Create a new step type called "Part Step" that allows direct control of hardware parts assigned to the current character.

Supported Part Types & Actions:

Servo:
- `moveToAngle`: Move to specific angle with configurable speed and duration
- `continuous`: Continuous movement (wiggle, rotate_360, random patterns)
- Parameters: `angleDeg`, `speed`, `duration`, `pattern`

Motor:
- `control`: Control DC motors for continuous movement
- Parameters: `direction` (forward/reverse), `speed`, `duration`

Linear Actuator:
- `extend`: Extend actuator
- `retract`: Retract actuator
- `moveTo`: Move to specific position
- Parameters: `speed`, `duration`, `position`

LED/Light:
- `setBrightness`: Control brightness level
- `turnOn`/`turnOff`: Simple on/off control
- `blink`: Blinking pattern
- Parameters: `brightness`, `duration`, `pattern`, `interval`

Sensor:
- `waitForTrigger`: Wait for sensor input before proceeding to next step
- `monitor`: Monitor sensor state for specified duration
- Parameters: `timeout`, `triggerValue`, `duration`

Implementation Requirements:
- Extend `routes/scenes/api.js` to handle part steps
- Create `executePartStep()` function that:
  - Looks up part metadata via existing part service
  - Maps to appropriate `hardwareService.HARDWARE_CONTROLLERS`
  - Merges step parameters with part configuration
  - Executes hardware action with safety enforcement
- Add part step validation to scene creation/editing
- Maintain compatibility with existing pose-based steps

### 4. Live Mode Interface (MAJOR NEW FEATURE)

Core Layout:
- Webcam Window: Large central video feed from character's assigned webcam
- Pose Controls: Grid of available poses with one-click activation
- Say This: Text input field with Enter-to-speak functionality
- Scene Queue: List of scenes with play/stop/loop controls
- Status Display: Real-time feedback on current operations

Technical Requirements:
- Integrate with existing `routes/setup/webcam.js` for MJPEG streaming
- Use existing `controllers/posesController.js` for pose execution
- Leverage `services/elevenLabsWebSocketService.js` for TTS
- Real-time updates via WebSocket or SSE
- Character-aware: All controls respect currently selected character

UI Specifications:
- Bootstrap 5 dark theme consistency
- Responsive design for various screen sizes
- Accessible controls with keyboard shortcuts
- Visual feedback for all actions
- Emergency stop button prominently displayed

### 5. Scene Queue Management

Queue Features:
- Add scenes to execution queue
- Reorder queue items (drag & drop)
- Remove items from queue
- Sequential execution mode
- Loop execution mode
- Real-time progress display

Queue State Management:
```javascript
{
  "queue": [
    { "sceneId": 1, "status": "completed" },
    { "sceneId": 3, "status": "running" },
    { "sceneId": 2, "status": "queued" }
  ],
  "mode": "sequential", // or "loop"
  "isRunning": true,
  "currentIndex": 1
}
```

## 🧪 Testing Requirements

MANDATORY: Comprehensive Testing
- Zero tolerance for test failures
- Both Playwright (browser) AND Mocha (backend) testing required
- Test every feature end-to-end

Testing Strategy:

Unit Tests (Mocha):
- Part step execution logic
- Scene queue management
- Pose system enhancements
- Hardware service integration
- Character isolation validation

Integration Tests (Playwright):
- Live Mode interface functionality
- Scene creation and execution
- Pose control interactions
- Audio integration
- Webcam streaming
- Character switching
- Error handling and recovery

Test Organization:
- Follow existing patterns in `tests/` directory
- Use existing test utilities and helpers
- Maintain test isolation and cleanup
- Generate comprehensive test reports

Test Coverage Requirements:
- All new API endpoints
- All UI components and interactions
- Hardware integration points
- Error conditions and edge cases
- Character isolation scenarios
- Concurrent execution scenarios

## 📁 File Structure & Implementation Plan

Phase 1: Part Step Implementation
1. Extend `routes/scenes/api.js` for part step execution
2. Create part step validation logic
3. Implement `executePartStep()` function
4. Add part step UI components to scene editor
5. Write comprehensive tests

Phase 2: Scene System Enhancement
1. Implement new step types (wait, sayThis)
2. Enhance concurrent execution handling
3. Add real-time progress tracking
4. Implement scene queue management
5. Create scene queue UI components

Phase 3: Live Mode Interface
1. Create Live Mode layout and components
2. Integrate webcam streaming
3. Implement pose control grid
4. Add "Say This" functionality
5. Integrate scene queue controls

Phase 4: Moving Poses Enhancement
1. Extend pose templates for moving poses
2. Enhance pose engine for continuous movements
3. Add moving pose creation UI
4. Implement pattern-based animations

Phase 5: Testing & Polish
1. Comprehensive test suite implementation
2. Performance optimization
3. Error handling improvements
4. Documentation updates
5. Final integration testing

## 🔧 Technical Integration Points

Existing Services to Leverage:
- `services/hardwareService/index.js` - Hardware control
- `services/poses/poseEngine.js` - Pose execution
- `services/characterService.js` - Character management
- `services/configService.js` - Configuration management
- `controllers/posesController.js` - Pose API endpoints
- `routes/setup/webcam.js` - Webcam streaming

New Services to Create:
- Scene queue management service
- Live Mode state management service
- Part step execution service
- Real-time progress tracking service

UI Components to Create:
- Live Mode dashboard
- Scene queue interface
- Part step editor
- Moving pose creator
- Real-time status displays

## 🚨 Critical Success Factors

1. Preserve Existing Functionality: All current MonsterBox 4.0 features must continue working
2. Character Isolation: Every feature must respect character boundaries
3. Hardware Safety: All hardware operations must include safety enforcement
4. Real-time Performance: Live Mode must be responsive and reliable
5. Comprehensive Testing: Zero tolerance for untested code
6. Bootstrap Consistency: All UI must match existing dark theme design
7. Error Recovery: Robust error handling and recovery mechanisms

## 🎯 Success Metrics

- All existing tests continue to pass
- New comprehensive test suite with 100% pass rate
- Live Mode interface loads and functions correctly
- Part steps execute hardware commands successfully
- Scene queue manages execution properly
- Character isolation maintained throughout
- Performance meets real-time requirements
- UI maintains design consistency

---

Remember: This is a sophisticated system building on extensive existing infrastructure. Study the existing code patterns, leverage the robust services already in place, and maintain the high quality standards established in MonsterBox 4.0.
