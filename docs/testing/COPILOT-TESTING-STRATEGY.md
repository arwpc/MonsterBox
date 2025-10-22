# MonsterBox 5.3 - Copilot Testing Strategy

**Mission**: Deep, accurate testing with browser validation, console error detection, and MCP integration.

---

## Overview

MonsterBox 5.3 testing integrates **four testing layers**:

1. **Mocha** - Unit tests (services, APIs, business logic)
2. **Playwright** - E2E UI tests (user workflows, navigation, forms)
3. **Chrome DevTools Browser MCP** - Live browser validation (console errors, network, visual regression)
4. **GitHub MCP** - CI/CD integration (branch/PR/review automation)

All tests are **VS Code Testing tab compatible** for seamless development workflow.

---

## Testing Philosophy

### Copilot Instructions Compliance

Per `.github/copilot-instructions.md`:

```
Required Workflow:
1) Propose minimal diff.
2) Run tests: npm run test:unit, npm run test:e2e, or npm run verify.
3) Stop on failure; print failing output; propose smallest corrective change.
4) For UI behavior, validate with Chrome DevTools Browser MCP (no console errors).
```

### Key Principles

- **Test-backed changes**: Every code change runs tests before commit
- **Console error = test failure**: Browser console errors/warnings fail tests
- **Hardware safety first**: Tests respect GPIO/I2C boundaries
- **Small, reversible changes**: Fail fast, fix fast
- **Real browser validation**: Chrome DevTools MCP catches errors missed by headless

---

## Testing Layers

### 1. Unit Tests (Mocha)

**Location**: `tests/unit/**/*.test.js`

**Run**:
```bash
npm run test:unit
# Or via VS Code Testing tab: "Unit Tests (Mocha)"
```

**What they test**:
- Service logic (calibration, audio, character management)
- API route handlers (without browser)
- Data models and transformations
- Hardware abstraction layers (mocked)

**Example**: `tests/unit/calibration-unified-api.test.js`
```javascript
import { expect } from 'chai';
describe('Calibration API', () => {
  it('should validate position bounds', () => {
    const result = validateBounds({ min: 10, max: 170 });
    expect(result.valid).to.be.true;
  });
});
```

---

### 2. E2E UI Tests (Playwright)

**Location**: `tests/playwright/**/*.spec.js`

**Run**:
```bash
npm run test:e2e
# Or via VS Code Testing tab: "E2E Tests (Playwright)"
```

**What they test**:
- Real user workflows (navigation, form submission, modal interactions)
- Character persistence across pages
- Audio/video playback triggering
- Webcam stream validation
- Goblin video deployment

**Key Features**:
- **Console error enforcement** via `tests/test.setup.ts`
- **HTTP 5xx = test failure**
- **MCP log collector** detects server-side errors
- **Save endpoint contracts**: all `/api/save` must return `{success: true}`

**Example**: `tests/playwright/calibration-unified.spec.js`
```javascript
import { test, expect } from '../test.setup';

test('calibration controls should move servo', async ({ page }) => {
  await page.goto('/setup/calibration');
  await page.selectOption('#partSelect', 'servo-jaw');
  await page.click('#jogUp');
  // MCP will fail test if console errors appear
});
```

---

### 3. Chrome DevTools Browser MCP

**Purpose**: Live browser validation with real Chrome/Firefox on local workstation.

**When to use**:
- Validating UI changes before commit
- Debugging console errors in Playwright tests
- Visual regression checks
- Testing browser-specific APIs (WebRTC, Web Audio, getUserMedia)

**Workflow**:

1. **Start MonsterBox in test mode**:
   ```bash
   MB_TEST_MODE=1 npm start
   ```

2. **Use Copilot to invoke Browser MCP**:
   ```
   "Navigate to http://localhost:3000/setup/calibration and check for console errors"
   ```

3. **Copilot uses MCP tools**:
   - `browser_navigate` → opens page
   - `browser_snapshot` → captures accessibility tree
   - `browser_console_messages` → surfaces errors/warnings
   - `browser_take_screenshot` → visual validation

4. **Test output**:
   ```
   ✅ No console errors
   ✅ Network: all responses 2xx/3xx
   ✅ Elements rendered correctly
   ```

**Example MCP validation flow**:
```javascript
// Copilot internally invokes:
await browser_navigate({ url: 'http://localhost:3000/setup/calibration' });
const snapshot = await browser_snapshot();
const console = await browser_console_messages({ onlyErrors: true });

if (console.length > 0) {
  throw new Error(`Console errors detected: ${JSON.stringify(console)}`);
}
```

---

### 4. GitHub MCP Integration

**Purpose**: Automate branch/commit/PR workflow from Copilot.

**Capabilities**:
- Create feature branches
- Commit test-passing changes
- Open PRs with test results
- Request Copilot reviews
- Apply suggested changes from review

**Workflow**:

1. **Copilot makes code change**
2. **Runs tests** (Mocha + Playwright + Browser MCP)
3. **On success**, Copilot can:
   ```javascript
   // Create branch
   await mcp_github_create_branch({ 
     owner: 'arwpc', 
     repo: 'MonsterBox', 
     branch: 'fix/calibration-bounds' 
   });
   
   // Commit
   await mcp_github_push_files({
     owner: 'arwpc',
     repo: 'MonsterBox',
     branch: 'fix/calibration-bounds',
     files: [{ path: 'routes/setup/calibration.js', content: '...' }],
     message: 'fix: enforce min/max bounds on jaw servo\n\nTests: npm run verify ✅'
   });
   
   // Open PR
   await mcp_github_create_pull_request({
     owner: 'arwpc',
     repo: 'MonsterBox',
     title: 'Fix: Enforce calibration bounds',
     body: '...',
     head: 'fix/calibration-bounds',
     base: 'main'
   });
   ```

---

## VS Code Testing Tab Integration

### Configuration

**File**: `.vscode/settings.json` (create if missing)

```json
{
  "mochaExplorer.files": "tests/unit/**/*.test.js",
  "mochaExplorer.require": "tests/test-setup.js",
  "mochaExplorer.env": {
    "MB_TEST_MODE": "1",
    "NODE_ENV": "test"
  },
  "playwright.testDirectory": "tests",
  "playwright.testMatch": "tests/playwright/**/*.spec.js"
}
```

### Usage

1. **Open Testing tab** (beaker icon in Activity Bar)
2. **See test tree**:
   ```
   📁 MonsterBox
   ├─ 🧪 Unit Tests (Mocha)
   │  ├─ Calibration API
   │  └─ Character Service
   ├─ 🎭 E2E Tests (Playwright)
   │  ├─ Calibration Unified
   │  ├─ Goblin Management
   │  └─ AI Settings
   ```
3. **Run/Debug individual tests**:
   - Click ▶️ to run
   - Click 🐛 to debug (breakpoints work!)
4. **View results inline**:
   - ✅ Pass (green checkmark)
   - ❌ Fail (red X with error message)

---

## Test Scripts (package.json)

### Core Commands

```bash
# Unit tests only (Mocha)
npm run test:unit

# E2E tests only (Playwright)
npm run test:e2e

# Both (recommended before commit)
npm run verify

# All tests (syntax + unit + e2e + conversation)
npm run test:all
```

### Specialized Tests

```bash
# Conversation mode (long-running)
npm run test:conversation

# Live (headed browser)
npm run test:e2e:live

# Specific test file
npx playwright test tests/playwright/calibration-unified.spec.js

# Mocha with grep
npm run test:unit -- --grep "Calibration"
```

---

## Test Environments

### MB_TEST_MODE=1

**Purpose**: Stub external services for safe testing.

**What it stubs**:
- GPIO/I2C hardware calls (no actual servo movement)
- ElevenLabs API (returns mock audio)
- Network-dependent features (webcam streams, external APIs)

**When to use**:
- All CI/CD runs
- Local development without hardware
- Rapid test iteration

**Activation**:
```bash
MB_TEST_MODE=1 npm start
MB_TEST_MODE=1 npm run test:e2e
```

### MONSTERBOX_HARDWARE_AVAILABLE=1

**Purpose**: Enable real hardware tests (RPi only).

**What it enables**:
- Actual GPIO/I2C calls
- Servo position verification
- Motor driver tests
- Sensor reading validation

**When to use**:
- Deployment validation on Coffin/Orlok/Groundbreaker
- Pre-Halloween hardware checks

**Activation**:
```bash
MONSTERBOX_HARDWARE_AVAILABLE=1 npm run test:unit -- --grep "hardware"
```

---

## Console Error Enforcement

### Playwright Setup (`tests/test.setup.ts`)

**Automatic console error detection**:

```typescript
export const test = base.extend({
  page: async ({ page }, use) => {
    // Fail test on console error/warning
    page.on('console', msg => {
      if (['error', 'warning'].includes(msg.type())) {
        throw new Error(`Console ${msg.type()}: ${msg.text()}`);
      }
    });
    
    // Fail on HTTP 5xx
    page.on('response', async res => {
      if (res.status() >= 500) {
        throw new Error(`HTTP ${res.status()} for ${res.url()}`);
      }
    });
    
    await use(page);
  }
});
```

**Why this matters**:
- **Catches UI bugs early**: `Uncaught TypeError` = test fails
- **Prevents silent failures**: Network errors surface immediately
- **Enforces quality**: No merging code with console spam

---

## Example: Full Test Workflow

### Scenario: Add new "Reset Calibration" button

**1. Write minimal code**:
```javascript
// routes/setup/calibration.js
router.post('/api/calibration/:partId/reset', async (req, res) => {
  const { partId } = req.params;
  await resetToDefaults(partId);
  res.json({ success: true });
});
```

**2. Write unit test**:
```javascript
// tests/unit/calibration-reset.test.js
import { expect } from 'chai';
import { resetToDefaults } from '../../services/calibrationService.js';

describe('Calibration Reset', () => {
  it('should restore factory defaults', () => {
    const result = resetToDefaults('servo-jaw');
    expect(result.min).to.equal(10);
    expect(result.max).to.equal(170);
  });
});
```

**3. Write E2E test**:
```javascript
// tests/playwright/calibration-reset.spec.js
import { test, expect } from '../test.setup';

test('reset button restores defaults', async ({ page }) => {
  await page.goto('/setup/calibration');
  await page.selectOption('#partSelect', 'servo-jaw');
  await page.click('#resetBtn');
  await expect(page.locator('#minAngle')).toHaveValue('10');
  await expect(page.locator('#maxAngle')).toHaveValue('170');
});
```

**4. Run tests locally**:
```bash
npm run verify
```

**5. Validate with Browser MCP** (via Copilot):
```
"Navigate to /setup/calibration, click reset button, check console for errors"
```

**6. If tests pass**, commit:
```bash
git add .
git commit -m "feat: add calibration reset button

Tests: npm run verify ✅
Browser MCP: no console errors ✅"
```

**7. Optional: Use GitHub MCP to create PR**:
```
"Create PR for calibration reset feature"
```

---

## Debugging Failed Tests

### Unit Test Failure

```bash
npm run test:unit -- --grep "your failing test"
# Output shows exact assertion failure
```

**Fix**:
1. Check test output for stack trace
2. Add `console.log()` in service code
3. Re-run test
4. Commit fix + updated test

### E2E Test Failure

```bash
npx playwright test tests/playwright/your-test.spec.js --headed
# Opens real browser, see what's happening
```

**Artifacts**:
- Screenshot: `test-results/your-test-chromium/test-failed-1.png`
- Video: `test-results/your-test-chromium/video.webm`
- Trace: `playwright-report/` (open with `npx playwright show-report`)

**Fix**:
1. Watch headed browser to see failure point
2. Check screenshot for UI state
3. Add `await page.pause()` to step through
4. Fix code, re-run test

### Console Error via Browser MCP

**Copilot reports**:
```
❌ Console error detected:
  Uncaught TypeError: Cannot read property 'addEventListener' of null
  at calibration.js:42
```

**Fix**:
1. Open `calibration.js:42`
2. Add null check:
   ```javascript
   const btn = document.getElementById('resetBtn');
   if (btn) btn.addEventListener('click', resetCalibration);
   ```
3. Re-validate with Browser MCP
4. Commit fix

---

## Test Coverage Goals

### Current Coverage (MonsterBox 5.3)

- **Unit tests**: ~85% (core services well-covered)
- **E2E tests**: ~70% (critical user paths covered)
- **Console error coverage**: 100% (all E2E tests enforce)

### Target Coverage

- **Unit**: Maintain 85%+ (focus on new services)
- **E2E**: 80%+ (expand Goblin/AI/Scene coverage)
- **Browser MCP validation**: 100% of UI changes

---

## CI/CD Integration (Future)

### GitHub Actions Workflow

```yaml
name: MonsterBox Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: MB_TEST_MODE=1 npm run verify
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-results
          path: test-results/
```

**GitHub MCP can**:
- Check PR test status
- Block merge if tests fail
- Auto-request Copilot review on success

---

## Quick Reference

### Run Tests

| Command | What | When |
|---------|------|------|
| `npm run test:unit` | Mocha unit tests | Every code change |
| `npm run test:e2e` | Playwright E2E | Before commit |
| `npm run verify` | Both | Before push |
| `npm run test:all` | Full suite | Before PR |

### Debug Tests

| Tool | Use Case |
|------|----------|
| VS Code Testing tab | Run/debug individual tests |
| `--headed` | See browser during test |
| Browser MCP | Live validation, console check |
| `npx playwright show-report` | Visual test report |

### Environment Flags

| Flag | Effect |
|------|--------|
| `MB_TEST_MODE=1` | Stub hardware/external APIs |
| `MONSTERBOX_HARDWARE_AVAILABLE=1` | Enable real hardware tests |
| `MB_E2E=1` | Enable long-running E2E tests |

---

## Summary

**MonsterBox 5.3 testing is**:
- ✅ **Multi-layered**: Mocha + Playwright + Browser MCP
- ✅ **Console error-aware**: No silent failures
- ✅ **VS Code integrated**: Testing tab shows all tests
- ✅ **Hardware-safe**: MB_TEST_MODE stubs GPIO/I2C
- ✅ **Copilot-driven**: MCP tools automate validation

**Golden Rule**: **Every change** → **run tests** → **validate with Browser MCP** → **commit if green** ✅
