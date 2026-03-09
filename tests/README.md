# MonsterBox Testing Framework

This document outlines the testing architecture for MonsterBox, designed to be modular, character-independent, and comprehensive.

## Guiding Principles

- **Character-Independence**: Tests should run against any animatronic running MonsterBox, configured via environment variables or runtime parameters, not hardcoded values.
- **Modularity**: Tests are organized by type (unit, system, browser, hardware) to allow for targeted test runs.
- **Speed and Depth**: The framework provides fast, headless tests for CI and deep, headed tests for interactive validation.
- **Dual-Mode Browser Testing**: Browser tests run via CLI (Playwright headless) or MCP (Claude Code interactive).

## Directory Structure

- `tests/unit/`: **Mocha** unit tests for low-level modules, services, and utilities. Fast, isolated, no server needed.
- `tests/system/`: **Mocha** system/integration tests for API endpoints and services. Uses `MB_TEST_MODE=1`.
- `tests/browser/`: **Playwright** end-to-end tests for headless browser-based validation of UI and workflows.
- `tests/hardware/`: **Mocha** tests for direct hardware interaction (servos, motors, sensors).

## Test Modes

### CLI Mode (Headless — RPi / CI / SSH)

Standard Playwright testing with headless Chromium. Works on any system, no display required.

```bash
# Run all browser tests
npm run test:browser

# Quick smoke test (2 specs)
npm run test:browser:quick

# Specific test files
npm run test:browser:setup
npm run test:browser:scenes
npm run test:browser:conversation

# Headed mode (requires display)
npm run test:browser:headed
```

**Config**: `playwright.config.js` — port 3200, headless Chromium, auto-starts test server.

### MCP Mode (VS Code IDE + Claude Code)

Uses `@playwright/mcp` for browser automation controlled by Claude Code. The MCP server provides
`browser_*` tools (navigate, click, snapshot, screenshot, etc.) for interactive testing.

```bash
# Run all browser tests via MCP config
npm run test:mcp

# Quick smoke test via MCP
npm run test:mcp:quick

# Test against live server (port 3000)
npm run test:mcp:live

# Full verification including MCP
npm run verify:mcp
```

**Config**: `playwright.mcp.config.js` — same tests, enhanced tracing/screenshots, MCP-optimized timeouts.

**Claude Code MCP Server**: Configured in `.claude/settings.json` — provides `browser_*` tools for
interactive browser automation from Claude Code. Headless Chromium on RPi.

### Unified Test Runner

Auto-detects the environment and runs the appropriate mode:

```bash
# Auto-detect (IDE → MCP, CI → CLI, default → CLI)
npm run test:runner

# Force CLI mode
npm run test:runner:cli

# Force MCP mode
npm run test:runner:mcp

# With options
node scripts/test-runner.mjs --mode cli --target live --spec tests/browser/scenes.spec.js
```

### Live Server Testing

Test against the running production server (port 3000/3100):

```bash
npm run test:mcp:live
npm run test:actual-usage
npm run test:actual-usage:headless
```

**Config**: `playwright.live.config.ts` — targets `http://orlok:3000`, no test server spawn.

## Running All Tests

### Unit Tests (Mocha)

```bash
npm run test:unit
```

### System Tests (Mocha)

```bash
npm run test:system
```

### Hardware Tests (Mocha)

Requires `MONSTERBOX_HARDWARE_AVAILABLE=1`:

```bash
MONSTERBOX_HARDWARE_AVAILABLE=1 npm run test:hardware
```

### Full Verification

```bash
# CLI mode (system + unit + browser)
npm run verify

# MCP mode (system + unit + MCP browser)
npm run verify:mcp

# Quick (system + 2 browser specs)
npm run verify:quick
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `MB_TEST_MODE=1` | Enable mocked APIs for testing |
| `TEST_PORT=3200` | Test server port (avoids production collision) |
| `BASE_URL` | Override base URL for tests |
| `CI=true` | CI mode (stricter, no server reuse) |
| `MONSTERBOX_TEST_MODE=cli\|mcp` | Force test runner mode |
| `MONSTERBOX_HARDWARE_AVAILABLE=1` | Enable hardware tests |

## Configuration Files

| File | Purpose |
|------|---------|
| `playwright.config.js` | CLI browser tests (headless, port 3200) |
| `playwright.mcp.config.js` | MCP browser tests (enhanced tracing) |
| `playwright.live.config.ts` | Live server tests (port 3000) |
| `.claude/settings.json` | Claude Code MCP server config |
| `scripts/test-runner.mjs` | Unified test runner with env detection |

## Creating New Tests

- **Unit Tests**: Create `*.test.js` in `tests/unit/`. Use `chai` assertions.
- **System Tests**: Create `*.test.js` in `tests/system/`. Use `supertest` + `chai`.
- **Browser Tests**: Create `*.spec.js` in `tests/browser/`. Use Playwright `expect`.
  - Tests work in both CLI and MCP modes automatically.
- **Hardware Tests**: Create `*.test.js` in `tests/hardware/`. Guard with `MONSTERBOX_HARDWARE_AVAILABLE` check.
