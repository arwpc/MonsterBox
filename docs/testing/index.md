# Testing Overview

MonsterBox has comprehensive tests across Playwright (browser E2E) and Mocha (system/unit) frameworks.

## Test Results (v6.7.6 — February 2026)

| Suite | Framework | Passing | Skipped | Notes |
|-------|-----------|---------|---------|-------|
| System | Mocha | 194 | 2 | |
| Unit | Mocha | 279 | 32 | Includes calibration, jaw pre-analysis, webcam APIs |
| Browser E2E | Playwright | 201 | 9+8 | 8 hardware-dependent tests auto-skip in CI |

### CI Environment

All tests pass in GitHub Actions CI. Hardware-dependent tests (relay-toggle, webcam-capture) are automatically skipped when `MB_TEST_MODE` is set, since they require specific character hardware (Orlok, char_id=3).

## Testing Categories

### [Test Organization](organization.md)
- Test file structure and naming conventions
- Test execution workflows and commands

### [API Testing](api-testing.md)
- REST API endpoint validation
- Service integration tests

### [Integration Testing](integration.md)
- Hardware + AI service integration
- ElevenLabs TTS/STT pipeline

### [Hardware Testing](hardware.md)
- GPIO and stepper motor tests (lgpio backend)
- Servo and linear actuator calibration
- Microphone enumeration and level tests

### [Conversation Testing](conversation.md)
- AI conversation via ElevenLabs WebSocket
- TTS voice synthesis and playback

### [Deep Testing Framework](DEEP-TESTING-FRAMEWORK-SUMMARY.md)
- Comprehensive Playwright deep test suites

### [Test Reports](reports.md)
- Test execution reports and CI output

### [Security Testing](security.md)
- Authentication and authorization

## Quick Start

```bash
# Run all tests (browser + system + unit)
npm test

# Individual suites
npm run test:system         # Mocha system tests (MB_TEST_MODE=1)
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser E2E (headless Chromium)
npm run verify              # system + unit + browser
```

## Test Environment

### Prerequisites
- Node.js 20.x
- Chromium (installed via `npx playwright install --with-deps chromium`)
- ffmpeg (required for jaw pre-analysis tests)
- `MB_TEST_MODE=1` for system tests (skips hardware init, defaults to char_id=1)
- `ELEVENLABS_API_KEY` set for AI tests (can be dummy in CI)

### CI/CD
- GitHub Actions runs on every push to main
- All 5 CI pipelines pass: CI Test Suite, Node.js CI, SSH Deploy, Deep Tests, MkDocs
- ffmpeg installed in CI for jaw pre-analysis engine tests
- Hardware-dependent browser tests (relay-toggle, webcam-capture) auto-skip via `MB_TEST_MODE`
- Playwright uses port 3100 in test mode

## Test File Structure

```
tests/
├── setup.js                               # Global test setup (env vars)
├── basic.test.js                          # Basic route smoke tests
├── system/                                # Mocha system tests
│   ├── ai-audio.test.js                   # ElevenLabs TTS/audio pipeline
│   ├── audio.test.js                      # Audio service and library
│   ├── hardware.test.js                   # Hardware service layer
│   ├── jaw-animation.test.js              # Jaw animation API + multi-config CRUD
│   ├── models.test.js                     # Models CRUD API
│   ├── parts.test.js                      # Parts API
│   ├── scenes.test.js                     # Scene execution engine
│   ├── theme.test.js                      # Theme API
│   └── video-library.test.js              # Video library API
├── unit/                                  # Mocha unit tests
│   ├── calibration-unified-api.test.js    # Calibration API (angle + normalized)
│   ├── jaw-pre-analysis.test.js           # Jaw pre-analysis engine (ffmpeg)
│   ├── webcam-api.test.js                 # Webcam APIs under calibration
│   └── index.test.js                      # Basic route tests
├── ai/                                    # AI-specific tests
│   ├── ask-ai-endpoint.test.js            # Ask AI REST endpoint
│   └── conversation-service.test.js       # ConversationService unit
├── hardware/                              # Hardware tests
│   ├── stepper.test.js                    # Stepper motor (real GPIO)
│   ├── microphone-crud-mocha.test.js      # Microphone enumeration
│   ├── continuous-servo-calibration.test.js
│   └── linear-actuator-calibration.test.js
└── browser/                               # Playwright browser E2E
    ├── framework.js                       # Shared test utilities
    ├── ai-settings.spec.js                # AI settings pages (26 tests)
    ├── audio-library.spec.js              # Audio library page (12 tests)
    ├── calibration-panels.spec.js         # Calibration panel visibility (8 tests)
    ├── conversation.spec.js               # AI conversation page (9 tests)
    ├── conversation-refactor.spec.js      # Dashboard grid layout (27 tests)
    ├── jaw-animation.spec.js              # Jaw animation page (36 tests)
    ├── models.spec.js                     # Models management (15 tests)
    ├── orchestration.spec.js              # Orchestration page (11 tests)
    ├── panel-sortable.spec.js             # Panel sortable (10 tests)
    ├── relay-toggle.spec.js               # Relay toggle (5 tests, hardware-only)
    ├── scenes.spec.js                     # Animation Studio (18 tests)
    ├── setup-parts.spec.js                # Calibration parts (6 tests)
    ├── video-library.spec.js              # Video library (8 tests)
    ├── webcam-calibration.spec.js         # Webcam in calibration (26 tests)
    └── webcam-capture.spec.js             # Webcam capture (3 tests, hardware-only)
```
