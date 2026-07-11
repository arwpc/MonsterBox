# Test Organization

MonsterBox uses **Mocha** for server-side tests and **Playwright** for browser E2E tests.

## Directory Structure

```
tests/
├── setup.js                    # Global test setup (ELEVENLABS_API_KEY, env vars)
├── basic.test.js               # Basic route smoke tests (18 tests)
├── system/                     # Mocha system/integration tests
│   ├── ai-audio.test.js        # ElevenLabs TTS generation, speaker routing (10 tests)
│   ├── audio.test.js           # Audio library CRUD, playback service (12 tests)
│   ├── hardware.test.js        # Hardware service layer, part control (8 tests)
│   ├── jaw-animation.test.js   # Jaw animation API, calibration, drive (23 tests)
│   ├── models.test.js          # Models CRUD API, type validation (22 tests)
│   └── scenes.test.js          # Scene execution, step types, AI steps (10 tests)
├── unit/                       # Mocha unit tests
│   ├── calibration-unified-api.test.js  # Calibration REST API (10 tests)
│   └── index.test.js           # Basic route and character tests (18 tests)
├── ai/                         # AI-specific tests
│   ├── ask-ai-endpoint.test.js          # Ask AI REST endpoint (8 tests)
│   ├── conversation-service.test.js     # Conversation service (fallback path)
│   └── conversation-service.test.js     # ConversationService unit (1 test)
├── hardware/                   # Hardware tests (real GPIO when available)
│   ├── stepper.test.js                  # Stepper motor via lgpio (3 tests)
│   ├── microphone-crud-mocha.test.js    # Microphone enumeration (2 tests)
│   ├── continuous-servo-calibration.test.js  # Continuous servo cal (17 pending)
│   ├── linear-actuator-calibration.test.js  # Linear actuator cal (8 pending)
│   └── test-hardware-fix.js             # Standalone hardware diagnostic script
└── browser/                    # Playwright browser E2E (headless Chromium)
    ├── framework.js            # testNavigation, ErrorTracker, shared utilities
    ├── audio-library.spec.js           # Audio library page (9 tests)
    ├── conversation.spec.js            # Dashboard conversation features (9 tests)
    ├── conversation-refactor.spec.js   # Dashboard grid layout panels (32 tests)
    ├── jaw-animation.spec.js           # Jaw animation page controls (24 tests)
    ├── models.spec.js                  # Models management CRUD (10 tests)
    ├── orchestration.spec.js           # Orchestration multi-character (11 tests)
    ├── scenes.spec.js                  # Scene editor CRUD + execution (10 tests)
    └── setup-parts.spec.js            # Calibration page parts (6 tests)
```

## Test Commands

```bash
# Run everything
npm test                    # browser + system + unit

# Individual suites
npm run test:system         # Mocha system tests (MB_TEST_MODE=1, port 3100)
npm run test:unit           # Mocha unit tests
npm run test:browser        # Playwright browser E2E (port 3200)
npm run test:hardware       # Hardware tests (needs MONSTERBOX_HARDWARE_AVAILABLE=1)
npm run verify              # system + unit + browser

# Individual Playwright specs
npm run test:browser:scenes
npm run test:browser:conversation
npm run test:browser:audio
npm run test:browser:orch
npm run test:browser:setup
npm run test:browser:headed   # With visible browser window

# Direct invocation
MB_TEST_MODE=1 npx mocha --recursive tests/system tests/unit tests/ai --reporter spec --exit --timeout 15000
MB_TEST_MODE=1 npx playwright test tests/browser --reporter=list
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MB_TEST_MODE` | Skip hardware init, use test defaults | `1` for system tests |
| `ELEVENLABS_API_KEY` | Required for AI tests (dummy OK in CI) | Set in tests/setup.js |
| `MONSTERBOX_HARDWARE_AVAILABLE` | Enable real GPIO tests | Not set (tests skip) |
| `PORT` | Override server port | `3000` (Mocha system tests use `3100`; Playwright uses `3200`) |
| `NODE_ENV` | Environment mode | Not required |

## Test Patterns

### Mocha Tests
- Use `supertest` for HTTP API testing against the Express app
- `MB_TEST_MODE=1` enables test mode (skips hardware init, defaults to character 1)
- Tests import the app directly, no separate server process needed
- Assertions via Chai (`expect`, `should`)

### Playwright Tests
- Chromium headless by default (`playwright.config.js`)
- Test server starts automatically on port 3200
- Each spec file uses `testNavigation()` from `framework.js`
- Error tracking via `ErrorTracker` class
- Screenshots and traces captured on failure

### Hardware Tests
- Stepper tests execute real GPIO commands via `python_wrappers/stepper_cli.py`
- Microphone tests enumerate PipeWire sources and check audio levels
- Continuous servo and linear actuator calibration tests are pending (require physical setup)
- `test-hardware-fix.js` is a standalone diagnostic script, not a Mocha test

## CI/CD (GitHub Actions)

Tests run automatically on every push to `main`:
1. Install Node.js dependencies
2. Install Playwright browsers
3. Set dummy `ELEVENLABS_API_KEY`
4. Run `npm test` (browser + system + unit)
5. Hardware tests skipped (no GPIO in CI)
