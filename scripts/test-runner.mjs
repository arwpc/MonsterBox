#!/usr/bin/env node

/**
 * MonsterBox Unified Test Runner
 *
 * Detects the execution environment and runs the appropriate test mode:
 *
 *   CLI mode (RPi headless / CI):
 *     - Standard Playwright with headless Chromium
 *     - Uses playwright.config.js
 *     - Spawns test server on port 3200
 *     - No display required
 *
 *   IDE/MCP mode (VS Code + Claude Code):
 *     - Uses @playwright/mcp server for browser automation
 *     - Claude Code controls the browser via MCP tools
 *     - Headless Chromium on RPi (no Xvfb needed)
 *     - Can also target live server on port 3000
 *
 * Environment detection:
 *   - MONSTERBOX_TEST_MODE=cli    → Force CLI mode
 *   - MONSTERBOX_TEST_MODE=mcp    → Force MCP mode
 *   - VSCODE_PID set              → IDE detected, suggest MCP mode
 *   - CI=true                     → CI detected, use CLI mode
 *   - Default                     → CLI mode (safest)
 *
 * Usage:
 *   node scripts/test-runner.mjs [--mode cli|mcp] [--target test|live] [--spec <file>]
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

// Detect environment
function detectEnvironment() {
  const forced = process.env.MONSTERBOX_TEST_MODE || getArg('mode');
  if (forced) return forced;

  if (process.env.CI === 'true') return 'cli';
  if (process.env.VSCODE_PID) return 'mcp';

  return 'cli'; // Default to CLI (always works)
}

// Detect target server
function detectTarget() {
  const forced = getArg('target');
  if (forced) return forced;

  return 'test'; // Default to test server (port 3200)
}

const mode = detectEnvironment();
const target = detectTarget();
const specFile = getArg('spec');

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`║  MonsterBox Test Runner                      ║`);
console.log(`╠══════════════════════════════════════════════╣`);
console.log(`║  Mode:   ${mode.padEnd(36)}║`);
console.log(`║  Target: ${target.padEnd(36)}║`);
if (specFile) {
  console.log(`║  Spec:   ${specFile.padEnd(36)}║`);
}
console.log(`╚══════════════════════════════════════════════╝\n`);

if (mode === 'cli') {
  // Standard CLI Playwright testing
  const env = {
    ...process.env,
    MB_TEST_MODE: '1',
    TEST_PORT: '3200',
    BASE_URL: target === 'live' ? 'http://localhost:3000' : 'http://localhost:3200',
  };

  const configFile = target === 'live'
    ? 'playwright.live.config.ts'
    : 'playwright.config.js';

  const testArgs = ['playwright', 'test'];

  if (specFile) {
    testArgs.push(specFile);
  } else {
    testArgs.push('tests/browser');
  }

  testArgs.push('--config', configFile);
  testArgs.push('--reporter=list');

  console.log(`Running: npx ${testArgs.join(' ')}`);

  const child = spawn('npx', testArgs, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

} else if (mode === 'mcp') {
  // MCP mode — uses playwright.mcp.config.js
  const env = {
    ...process.env,
    MB_TEST_MODE: '1',
    TEST_PORT: '3200',
    BASE_URL: target === 'live' ? 'http://localhost:3000' : 'http://localhost:3200',
  };

  const testArgs = ['playwright', 'test'];

  if (specFile) {
    testArgs.push(specFile);
  } else {
    testArgs.push('tests/browser');
  }

  testArgs.push('--config', 'playwright.mcp.config.js');
  testArgs.push('--reporter=list');

  console.log(`Running: npx ${testArgs.join(' ')}`);
  console.log(`(MCP browser tools also available via Claude Code for interactive testing)\n`);

  const child = spawn('npx', testArgs, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

} else {
  console.error(`Unknown mode: ${mode}`);
  console.error('Valid modes: cli, mcp');
  process.exit(1);
}
