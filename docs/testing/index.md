# Testing Overview

MonsterBox has **257 tests** across Mocha (system/unit/AI/hardware) and Playwright (browser E2E) frameworks.

## Test Results (v5.5.1 Gold — February 2026)

| Suite | Framework | Passing | Pending | Failing |
|-------|-----------|---------|---------|---------|
| System | Mocha | 93 | 2 | 6* |
| Unit | Mocha | 28 | 0 | 0 |
| AI | Mocha | 5 | 5 | 0 |
| Hardware | Mocha | 22 | 27 | 0 |
| Browser E2E | Playwright | 109 | 7 | 0 |

*\*6 jaw-animation failures require a physically calibrated jaw servo — hardware-dependent, not code bugs.*

## Testing Categories

### 🔧 [Test Organization](organization.md)
- Test file structure and naming conventions
- Test execution workflows and commands

### 🌐 [API Testing](api-testing.md)
- REST API endpoint validation
- Service integration tests

### 🔗 [Integration Testing](integration.md)
- Hardware + AI service integration
- ElevenLabs TTS/STT pipeline

### ⚡ [Hardware Testing](hardware.md)
- GPIO and stepper motor tests (lgpio backend)
- Servo and linear actuator calibration
- Microphone enumeration and level tests

### 🤖 [Conversation Testing](conversation.md)
- AI conversation via ElevenLabs agents
- TTS voice synthesis and playback

### 📊 [Test Reports](reports.md)
- Test execution reports and CI output

### 🔒 [Security Testing](security.md)
- Authentication and authorization

### 🎃 [Deep Testing Framework](DEEP-TESTING-FRAMEWORK-SUMMARY.md)
- Comprehensive Playwright deep test suites

## Quick Start

```bash
# Run all tests (browser + system + unit)
npm test

# Individual suites
npm run test:system         # Mocha system tests (MB_TEST_MODE=1)
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser E2E (headless Chromium)
npm run test:hardware       # Hardware tests (needs real GPIO)
npm run verify              # system + unit + browser
```

## Test Environment

### Prerequisites
- Node.js 18+ (20.x recommended)
- Chromium (installed via `npx playwright install --with-deps chromium`)
- `MB_TEST_MODE=1` for system tests (skips hardware init)
- `ELEVENLABS_API_KEY` set for AI tests (can be dummy in CI)

### CI/CD
- GitHub Actions runs on every push to main
- Playwright uses port 3123 to avoid collisions
- Hardware tests skipped in CI (no GPIO available)

## Test File Structure

```
tests/
├── setup.js                               # Global test setup (env vars)
├── basic.test.js                          # Basic route smoke tests
├── system/                                # Mocha system tests
│   ├── ai-audio.test.js                   # ElevenLabs TTS/audio pipeline
│   ├── audio.test.js                      # Audio service and library
│   ├── hardware.test.js                   # Hardware service layer
│   ├── jaw-animation.test.js              # Jaw animation API
│   ├── models.test.js                     # Models CRUD API
│   └── scenes.test.js                     # Scene execution engine
├── unit/                                  # Mocha unit tests
│   ├── calibration-unified-api.test.js    # Calibration API
│   └── index.test.js                      # Basic route tests
├── ai/                                    # AI-specific tests
│   ├── ask-ai-endpoint.test.js            # Ask AI REST endpoint
│   ├── conversation-route.test.js         # Conversation API
│   └── conversation-service.test.js       # ConversationService unit
├── hardware/                              # Hardware tests
│   ├── stepper.test.js                    # Stepper motor (real GPIO)
│   ├── microphone-crud-mocha.test.js      # Microphone enumeration
│   ├── continuous-servo-calibration.test.js
│   └── linear-actuator-calibration.test.js
└── browser/                               # Playwright browser E2E
    ├── framework.js                       # Shared test utilities
    ├── audio-library.spec.js              # Audio library page (9 tests)
    ├── conversation.spec.js               # Dashboard conversation (9 tests)
    ├── conversation-refactor.spec.js      # Dashboard grid layout (32 tests)
    ├── jaw-animation.spec.js              # Jaw animation page (24 tests)
    ├── models.spec.js                     # Models management (10 tests)
    ├── orchestration.spec.js              # Orchestration page (11 tests)
    ├── scenes.spec.js                     # Scene editor (10 tests)
    └── setup-parts.spec.js               # Calibration parts (6 tests)
```
