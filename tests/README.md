# MonsterBox Testing Framework

This document outlines the testing architecture for MonsterBox, designed to be modular, character-independent, and comprehensive.

## Guiding Principles

- **Character-Independence**: Tests should run against any animatronic running MonsterBox, configured via environment variables or runtime parameters, not hardcoded values.
- **Modularity**: Tests are organized by type (unit, E2E, hardware) to allow for targeted test runs.
- **Speed and Depth**: The framework provides fast, headless tests for CI and deep, headed tests for interactive validation.

## Directory Structure

- `tests/unit/`: **Mocha** unit tests for low-level modules, services, and utilities. These are fast, run in isolation, and do not require a running server.
- `tests/e2e/`: **Playwright** end-to-end tests for headless browser-based validation of the UI and core workflows.
- `tests/hardware/`: **Mocha** tests for direct hardware interaction (servos, motors, sensors). These tests are hardware-aware and may require specific environment flags to run.
- `tests/headed/`: **Playwright** tests designed to be run in a headed browser for visual inspection and interactive debugging.

## Running Tests

### Unit Tests (Mocha)

```bash
# Run all unit tests
npm run test:unit
```

### End-to-End Tests (Playwright)

```bash
# Run all headless E2E tests
npm run test:e2e
```

### Hardware Tests (Mocha)

Hardware tests require the `MONSTERBOX_HARDWARE_AVAILABLE=1` environment variable to be set.

```bash
# Run all hardware tests
MONSTERBOX_HARDWARE_AVAILABLE=1 npm run test:hardware
```

### Headed Tests (Playwright)

Headed tests are for interactive sessions and debugging.

```bash
# Run all headed tests
npm run test:headed
```

### Comprehensive Verification

To run a full verification suite (unit + E2E), use the `verify` script.

```bash
npm run verify
```

## Creating New Tests

- **Unit Tests**: Create new `*.test.js` files in `tests/unit`. Use `chai` for assertions.
- **E2E Tests**: Create new `*.spec.js` files in `tests/e2e`. Use Playwright's `expect` for assertions.
- **Hardware Tests**: Create new `*.test.js` files in `tests/hardware`. Guard hardware-specific code with checks for `process.env.MONSTERBOX_HARDWARE_AVAILABLE`.
- **Headed Tests**: Create new `*.spec.js` files in `tests/headed`.


