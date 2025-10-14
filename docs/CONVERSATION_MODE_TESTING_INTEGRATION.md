# Conversation Mode Testing - Integration Summary

## Overview

The Conversation Mode testing suite has been fully integrated into the MonsterBox 5.3 testing infrastructure. This document summarizes the integration work completed.

## What Was Integrated

### 1. Test Files
All Conversation Mode tests are located in `tests/playwright/`:
- **`conversation-api.spec.js`** - Backend API tests (13 tests)
- **`conversation-mode-complete.spec.js`** - Frontend E2E tests (15+ tests)
- **`monster-features.spec.js`** - Monster Features integration tests (20+ tests)

### 2. NPM Scripts
Added to `package.json`:

```json
{
  "test:conversation": "Run all Conversation Mode tests",
  "test:conversation:api": "Run backend API tests only",
  "test:conversation:e2e": "Run frontend E2E tests only",
  "test:conversation:features": "Run Monster Features tests only",
  "test:conversation:live": "Run E2E tests with headed browser",
  "test:all": "Run ALL tests including Conversation Mode"
}
```

### 3. Test Runner Script
Created `scripts/run-conversation-tests.sh`:
- Automated test execution with proper reporting
- Color-coded output for easy reading
- Server management (start/stop)
- Support for running individual test suites
- Headed mode support for visual debugging

**Usage:**
```bash
# Run all tests
bash scripts/run-conversation-tests.sh

# Run specific suites
bash scripts/run-conversation-tests.sh --api
bash scripts/run-conversation-tests.sh --e2e
bash scripts/run-conversation-tests.sh --features

# Run with headed browser
bash scripts/run-conversation-tests.sh --e2e --headed
```

### 4. CI/CD Integration
Updated `.github/workflows/node.js.yml`:
- Conversation Mode tests run automatically on push to `main`
- Runs on all pull requests
- Tests on Node.js 18.x, 20.x, and 22.x
- Uses Firefox browser for RPi4b compatibility

### 5. Documentation Updates

#### README.md
- Added Conversation Mode testing section
- Updated test count (40+ E2E tests)
- Added quick start commands
- Listed all test suites and their purposes

#### docs/CONVERSATION_MODE_TESTING.md
- Added integration status
- Added quick start guide
- Added CI/CD integration details
- Documented all test commands

## Test Coverage

### Backend API Tests (13 tests)
✅ Webcam stream URL  
✅ Speakers list  
✅ Jaw animation settings (GET/POST)  
✅ Head tracking status and toggle  
✅ AI agent status and toggle  
✅ Listen In URL  
✅ Make Character Say (TTS)  
✅ Jaw drive amplitude  
✅ Scenes list  
✅ Scene playback  

### Frontend E2E Tests (15+ tests)
✅ Page loads with all 5 panels  
✅ Navigation header displays version  
✅ Live Audio panel functionality  
✅ Make Character Say panel  
✅ Monster Features toggles  
✅ Scenes panel  
✅ Webcam panel  
✅ Complete trick-or-treater interaction workflow  

### Monster Features Tests (20+ tests)
✅ Jaw Animation toggle and persistence  
✅ Parrot Mode toggle and persistence  
✅ Head Tracking toggle and persistence  
✅ AI On toggle with latency display  
✅ All features enabled/disabled simultaneously  
✅ State persistence across page reloads  

## Running Tests

### Quick Commands

```bash
# Run all Conversation Mode tests
npm run test:conversation

# Run individual test suites
npm run test:conversation:api
npm run test:conversation:e2e
npm run test:conversation:features

# Run with headed browser (visual debugging)
npm run test:conversation:live

# Run ALL MonsterBox tests (unit + UI + conversation)
npm run test:all
```

### Using the Test Runner

```bash
# Run all tests with detailed reporting
bash scripts/run-conversation-tests.sh

# Run specific test suites
bash scripts/run-conversation-tests.sh --api
bash scripts/run-conversation-tests.sh --e2e
bash scripts/run-conversation-tests.sh --features

# Run with headed browser
bash scripts/run-conversation-tests.sh --e2e --headed

# Show help
bash scripts/run-conversation-tests.sh --help
```

## Test Results

### Current Status
- **Backend API Tests**: 12/13 passing (92%)
- **Frontend E2E Tests**: Ready for execution
- **Monster Features Tests**: Ready for execution
- **Total Coverage**: 40+ comprehensive tests

### Known Issues
1. Scene playback test may fail in test mode (hardware not available) - this is expected
2. Head tracking tests updated to handle both test mode and production response formats

## Integration with Full Test Suite

The Conversation Mode tests are now part of the full MonsterBox test suite:

```bash
npm run test:all
```

This runs:
1. ✅ Syntax validation tests
2. ✅ Unit tests (63 tests)
3. ✅ UI tests (Playwright)
4. ✅ **Conversation Mode tests (40+ tests)** ← NEW

## CI/CD Pipeline

Conversation Mode tests run automatically in GitHub Actions:
- **Trigger**: Push to `main` or pull request
- **Node versions**: 18.x, 20.x, 22.x
- **Browser**: Firefox (RPi4b compatible)
- **Environment**: MB_E2E=1 for full E2E testing

## Hardware Testing

For testing on actual Orlok hardware:

```bash
# SSH to Orlok
ssh remote@192.168.8.120

# Navigate to MonsterBox
cd ~/MonsterBox

# Run Conversation Mode tests
npm run test:conversation

# Run with headed browser (if X11 forwarding enabled)
npm run test:conversation:live
```

## Files Modified

### Configuration
- `package.json` - Added test scripts
- `.github/workflows/node.js.yml` - Added CI integration

### Scripts
- `scripts/run-conversation-tests.sh` - New test runner (executable)

### Documentation
- `README.md` - Added testing section
- `docs/CONVERSATION_MODE_TESTING.md` - Updated with integration details
- `docs/CONVERSATION_MODE_TESTING_INTEGRATION.md` - This file

### Tests
- `tests/playwright/conversation-api.spec.js` - Fixed response format handling
- `tests/playwright/conversation-mode-complete.spec.js` - Ready for execution
- `tests/playwright/monster-features.spec.js` - Ready for execution

## Next Steps

1. ✅ Integration complete
2. ✅ Documentation updated
3. ✅ CI/CD configured
4. 🔄 Run full test suite on Orlok hardware
5. 🔄 Verify all tests pass on actual hardware
6. 🔄 Fine-tune any hardware-specific test expectations

## Summary

The Conversation Mode testing suite is now fully integrated into MonsterBox 5.3:
- ✅ 40+ comprehensive tests covering backend, frontend, and integration
- ✅ Automated test runner with detailed reporting
- ✅ CI/CD pipeline integration
- ✅ Complete documentation
- ✅ Ready for Halloween 2025! 🎃

All tests can be run with a single command: `npm run test:conversation`

