#!/usr/bin/env node

/**
 * MonsterBox Unified Test Runner
 *
 * Runs any combination of test suites with granular filtering.
 *
 * Suites:
 *   unit      — Mocha unit tests (fast, no server needed)
 *   system    — Mocha system/integration tests (needs server on 3100)
 *   browser   — Playwright E2E tests (spawns server on 3200)
 *   hardware  — Mocha hardware tests (needs real GPIO)
 *   ai        — AI service tests (needs server on 3100)
 *   all       — Everything (default for `npm test`)
 *
 * Modes:
 *   cli       — Standard headless Playwright (default, always works)
 *   mcp       — Uses playwright.mcp.config.js (enhanced tracing for Claude Code)
 *   headed    — Visible browser (requires display / X11 forwarding)
 *
 * Targets:
 *   test      — Spawns test server on port 3200 (default)
 *   live      — Tests against running server on port 3000
 *
 * Environment detection:
 *   MONSTERBOX_TEST_MODE=cli|mcp  → Force mode
 *   CI=true                       → CLI mode (strict)
 *   VSCODE_PID set                → Suggest MCP mode
 *   Default                       → CLI mode
 *
 * Usage:
 *   node scripts/test-runner.mjs [options]
 *
 * Options:
 *   --suite <name>     Suite to run: unit|system|browser|hardware|ai|all (default: all)
 *   --mode  <mode>     Test mode: cli|mcp|headed (default: auto-detect)
 *   --target <target>  Server target: test|live (default: test)
 *   --spec <file>      Run specific spec file (browser tests only)
 *   --grep <pattern>   Filter tests by name pattern (Mocha tests only)
 *   --area <area>      Filter by functional area: parts|audio|scenes|jaw|head|ai|
 *                      dashboard|models|video|calibration|webcam|orch (runs matching
 *                      tests across all applicable suites)
 *   --help             Show this help message
 *
 * Examples:
 *   node scripts/test-runner.mjs                                    # Run all suites
 *   node scripts/test-runner.mjs --suite unit                       # Unit tests only
 *   node scripts/test-runner.mjs --suite system --grep "parts"      # System tests matching "parts"
 *   node scripts/test-runner.mjs --suite browser --spec scenes      # Browser scenes spec
 *   node scripts/test-runner.mjs --area jaw                         # All jaw tests (unit+system+browser)
 *   node scripts/test-runner.mjs --area audio --suite system        # System audio tests only
 *   node scripts/test-runner.mjs --mode headed --suite browser      # Headed browser tests
 *   node scripts/test-runner.mjs --mode mcp --target live           # MCP against live server
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ── Argument parsing ──────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag('help') || hasFlag('h')) {
  // Print the docstring above and exit
  const { readFileSync } = await import('fs');
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  const docMatch = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (docMatch) console.log(docMatch[1].replace(/^ \* ?/gm, '').trim());
  process.exit(0);
}

// ── Environment detection ─────────────────────────────────────────
function detectMode() {
  const forced = process.env.MONSTERBOX_TEST_MODE || getArg('mode');
  if (forced) return forced;
  if (process.env.CI === 'true') return 'cli';
  if (process.env.VSCODE_PID) return 'mcp';
  return 'cli';
}

const suite  = getArg('suite') || 'all';
const mode   = detectMode();
const target = getArg('target') || 'test';
const spec   = getArg('spec');
const grep   = getArg('grep');
const area   = getArg('area');

// ── Area → suite/file mapping ─────────────────────────────────────
// Maps functional areas to test files across suites
const AREA_MAP = {
  parts:       { system: ['parts-api', 'hardware'],                           browser: ['setup-parts'] },
  audio:       { system: ['audio', 'audio-setup', 'audio-library', 'echo-suppression'], browser: ['audio-library', 'audio-setup', 'audio-setup-mic'] },
  scenes:      { system: ['scenes', 'animation-studio'],                      browser: ['scenes', 'scene-concurrency'] },
  jaw:         { unit: ['jaw-pre-analysis'], system: ['jaw-animation'],        browser: ['jaw-animation'] },
  head:        { system: ['head-animation'],                                   browser: ['head-tracking-dashboard', 'head-tracking-presets'] },
  ai:          { system: ['ai-audio'], ai: ['ask-ai-endpoint', 'conversation-service'], browser: ['ai-settings', 'conversation', 'conversation-refactor'] },
  dashboard:   { system: ['dashboard-api'],                                    browser: ['panel-sortable', 'relay-toggle'] },
  models:      { system: ['models'],                                           browser: ['models'] },
  video:       { system: ['video-library'],                                    browser: ['video-library'] },
  calibration: { unit: ['calibration-unified-api', 'webcam-calibration-api'],  browser: ['calibration-panels', 'webcam-calibration'] },
  webcam:      { browser: ['webcam-capture', 'webcam-calibration'] },
  orch:        { browser: ['orchestration'] },
};

// ── Banner ────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════╗`);
console.log(`║  MonsterBox Test Runner                          ║`);
console.log(`╠══════════════════════════════════════════════════╣`);
console.log(`║  Suite:  ${suite.padEnd(40)}║`);
console.log(`║  Mode:   ${mode.padEnd(40)}║`);
console.log(`║  Target: ${target.padEnd(40)}║`);
if (spec) console.log(`║  Spec:   ${spec.padEnd(40)}║`);
if (grep) console.log(`║  Grep:   ${grep.padEnd(40)}║`);
if (area) console.log(`║  Area:   ${area.padEnd(40)}║`);
console.log(`╚══════════════════════════════════════════════════╝\n`);

// ── Runner helpers ────────────────────────────────────────────────
function run(cmd, cmdArgs, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => resolve(code || 0));
    child.on('error', () => resolve(1));
  });
}

async function runMocha(testPaths, extraArgs = [], env = {}) {
  const mochaArgs = [
    '--require', 'tests/setup.js',
    ...testPaths,
    '--reporter', 'spec',
    '--exit',
    '--timeout', '10000',
  ];
  if (grep) mochaArgs.push('--grep', grep);
  mochaArgs.push(...extraArgs);
  return run('npx', ['mocha', ...mochaArgs], {
    BASE_URL: 'http://localhost:3100',
    MB_TEST_MODE: '1',
    ...env,
  });
}

async function runPlaywright(specFiles = [], extraArgs = []) {
  const baseUrl = target === 'live' ? 'http://localhost:3000' : 'http://localhost:3200';
  const configFile = mode === 'mcp'
    ? 'playwright.mcp.config.js'
    : (target === 'live' ? 'playwright.live.config.ts' : 'playwright.config.js');

  const pwArgs = ['playwright', 'test'];

  if (specFiles.length > 0) {
    pwArgs.push(...specFiles.map(f =>
      f.includes('/') ? f : `tests/browser/${f}${f.endsWith('.spec.js') ? '' : '.spec.js'}`
    ));
  } else {
    pwArgs.push('tests/browser');
  }

  pwArgs.push('--config', configFile, '--reporter=list');
  if (mode === 'headed') pwArgs.push('--headed');
  pwArgs.push(...extraArgs);

  return run('npx', pwArgs, {
    MB_TEST_MODE: '1',
    TEST_PORT: '3200',
    BASE_URL: baseUrl,
  });
}

// ── Resolve files for an area ─────────────────────────────────────
function getAreaFiles(areaName, suiteName) {
  const mapping = AREA_MAP[areaName];
  if (!mapping) {
    console.error(`Unknown area: ${areaName}. Valid areas: ${Object.keys(AREA_MAP).join(', ')}`);
    process.exit(1);
  }
  return mapping[suiteName] || [];
}

// ── Suite runners ─────────────────────────────────────────────────
async function runUnit() {
  let files;
  if (area) {
    const names = getAreaFiles(area, 'unit');
    if (names.length === 0) { console.log('  (no unit tests for this area)'); return 0; }
    files = names.map(n => `tests/unit/${n}.test.js`);
  } else {
    files = ['--recursive', 'tests/unit'];
  }
  console.log('── Unit Tests ──────────────────────────────────');
  return runMocha(files);
}

async function runSystem() {
  let files;
  if (area) {
    const names = getAreaFiles(area, 'system');
    if (names.length === 0) { console.log('  (no system tests for this area)'); return 0; }
    files = names.map(n => `tests/system/${n}.test.js`);
  } else {
    files = ['--recursive', 'tests/system'];
  }
  console.log('── System Tests ────────────────────────────────');
  return runMocha(files);
}

async function runAI() {
  let files;
  if (area) {
    const names = getAreaFiles(area, 'ai');
    if (names.length === 0) { console.log('  (no AI tests for this area)'); return 0; }
    files = names.map(n => `tests/ai/${n}.test.js`);
  } else {
    files = ['--recursive', 'tests/ai'];
  }
  console.log('── AI Tests ────────────────────────────────────');
  return runMocha(files);
}

async function runBrowser() {
  let files = [];
  if (spec) {
    files = [spec];
  } else if (area) {
    const names = getAreaFiles(area, 'browser');
    if (names.length === 0) { console.log('  (no browser tests for this area)'); return 0; }
    files = names;
  }
  console.log('── Browser Tests ───────────────────────────────');
  return runPlaywright(files);
}

async function runHardware() {
  let files;
  if (area) {
    // Hardware tests don't have area sub-mapping, run all
    files = ['--recursive', 'tests/hardware'];
  } else {
    files = ['--recursive', 'tests/hardware'];
  }
  console.log('── Hardware Tests ──────────────────────────────');
  return runMocha(files, ['--timeout', '30000'], {
    MONSTERBOX_HARDWARE_AVAILABLE: '1',
  });
}

// ── Main ──────────────────────────────────────────────────────────
const results = [];

const suites = suite === 'all'
  ? ['unit', 'system', 'browser']
  : suite.split(',').map(s => s.trim());

for (const s of suites) {
  let code = 0;
  switch (s) {
    case 'unit':     code = await runUnit(); break;
    case 'system':   code = await runSystem(); break;
    case 'browser':  code = await runBrowser(); break;
    case 'hardware': code = await runHardware(); break;
    case 'ai':       code = await runAI(); break;
    default:
      console.error(`Unknown suite: ${s}. Valid: unit, system, browser, hardware, ai, all`);
      process.exit(1);
  }
  results.push({ suite: s, code });
}

// ── Summary ───────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║  Results                                         ║');
console.log('╠══════════════════════════════════════════════════╣');
for (const r of results) {
  const icon = r.code === 0 ? '✅' : '❌';
  console.log(`║  ${icon} ${r.suite.padEnd(12)} exit code ${String(r.code).padEnd(24)}║`);
}
console.log('╚══════════════════════════════════════════════════╝\n');

const failed = results.some(r => r.code !== 0);
process.exit(failed ? 1 : 0);
