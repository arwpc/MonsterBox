#!/usr/bin/env node
/**
 * MonsterBox 5.3 - MCP-Aware Test Runner
 * 
 * Orchestrates Mocha + Playwright tests with optional Chrome DevTools Browser MCP validation.
 * Outputs unified results compatible with VS Code Testing tab.
 * 
 * Usage:
 *   node scripts/mcp-test-runner.js --unit          # Unit tests only
 *   node scripts/mcp-test-runner.js --e2e           # E2E tests only
 *   node scripts/mcp-test-runner.js --all           # Both
 *   node scripts/mcp-test-runner.js --all --mcp     # Include Browser MCP validation
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function banner(title) {
  log('\n' + '='.repeat(60), 'cyan');
  log(`  ${title}`, 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
}

/**
 * Run a command and return exit code
 */
function runCommand(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...env },
    });

    proc.on('close', (code) => {
      resolve(code || 0);
    });

    proc.on('error', (err) => {
      log(`Error spawning ${cmd}: ${err.message}`, 'red');
      resolve(1);
    });
  });
}

/**
 * Run unit tests (Mocha)
 */
async function runUnitTests() {
  banner('🧪 Running Unit Tests (Mocha)');
  
  const exitCode = await runCommand('npm', ['run', 'test:unit'], {
    MB_TEST_MODE: '1',
    NODE_ENV: 'test',
  });

  if (exitCode === 0) {
    log('✅ Unit tests passed\n', 'green');
  } else {
    log('❌ Unit tests failed\n', 'red');
  }

  return exitCode;
}

/**
 * Run E2E tests (Playwright)
 */
async function runE2ETests() {
  banner('🎭 Running E2E Tests (Playwright)');
  
  const exitCode = await runCommand('npm', ['run', 'test:e2e'], {
    MB_TEST_MODE: '1',
    NODE_ENV: 'test',
  });

  if (exitCode === 0) {
    log('✅ E2E tests passed\n', 'green');
  } else {
    log('❌ E2E tests failed\n', 'red');
  }

  return exitCode;
}

/**
 * Run Browser MCP validation (simulated - actual MCP calls would be via Copilot)
 * 
 * In practice, this would be invoked by Copilot using Browser MCP tools.
 * This script documents the expected validation flow.
 */
async function runBrowserMCPValidation() {
  banner('🌐 Browser MCP Validation (Recommended)');
  
  log('Browser MCP validation is performed by Copilot using:', 'yellow');
  log('  • browser_navigate(url)', 'yellow');
  log('  • browser_snapshot()', 'yellow');
  log('  • browser_console_messages(onlyErrors: true)', 'yellow');
  log('  • browser_take_screenshot()', 'yellow');
  log('\nTo validate UI changes, ask Copilot:', 'cyan');
  log('  "Navigate to /setup/calibration and check for console errors"\n', 'cyan');
  
  return 0; // Always pass (informational only)
}

/**
 * Main test orchestration
 */
async function main() {
  const args = process.argv.slice(2);
  const runUnit = args.includes('--unit') || args.includes('--all');
  const runE2E = args.includes('--e2e') || args.includes('--all');
  const runMCP = args.includes('--mcp');
  
  if (!runUnit && !runE2E) {
    log('Usage: node scripts/mcp-test-runner.js [options]', 'yellow');
    log('Options:', 'yellow');
    log('  --unit    Run unit tests (Mocha)', 'yellow');
    log('  --e2e     Run E2E tests (Playwright)', 'yellow');
    log('  --all     Run both unit and E2E', 'yellow');
    log('  --mcp     Show Browser MCP validation info', 'yellow');
    log('\nExamples:', 'cyan');
    log('  npm run test:verify         # Unit + E2E', 'cyan');
    log('  npm run test:verify --mcp   # Unit + E2E + MCP info\n', 'cyan');
    process.exit(1);
  }

  banner('🎃 MonsterBox 5.3 Test Runner');
  log(`Start time: ${new Date().toISOString()}`, 'blue');
  log(`Environment: MB_TEST_MODE=1, NODE_ENV=test\n`, 'blue');

  const results = {
    unit: null,
    e2e: null,
    mcp: null,
  };

  // Run unit tests
  if (runUnit) {
    results.unit = await runUnitTests();
    if (results.unit !== 0 && !args.includes('--continue-on-error')) {
      log('⚠️  Stopping due to unit test failures (use --continue-on-error to override)\n', 'yellow');
      await printSummary(results);
      process.exit(results.unit);
    }
  }

  // Run E2E tests
  if (runE2E) {
    results.e2e = await runE2ETests();
    if (results.e2e !== 0 && !args.includes('--continue-on-error')) {
      log('⚠️  Stopping due to E2E test failures (use --continue-on-error to override)\n', 'yellow');
      await printSummary(results);
      process.exit(results.e2e);
    }
  }

  // Show MCP validation info
  if (runMCP) {
    results.mcp = await runBrowserMCPValidation();
  }

  await printSummary(results);

  // Exit with failure if any tests failed
  const failed = Object.values(results).some(code => code !== null && code !== 0);
  process.exit(failed ? 1 : 0);
}

/**
 * Print test summary
 */
async function printSummary(results) {
  banner('📊 Test Summary');
  
  const { unit, e2e, mcp } = results;
  
  if (unit !== null) {
    const status = unit === 0 ? '✅ PASS' : '❌ FAIL';
    const color = unit === 0 ? 'green' : 'red';
    log(`  Unit Tests (Mocha):       ${status}`, color);
  }
  
  if (e2e !== null) {
    const status = e2e === 0 ? '✅ PASS' : '❌ FAIL';
    const color = e2e === 0 ? 'green' : 'red';
    log(`  E2E Tests (Playwright):   ${status}`, color);
  }
  
  if (mcp !== null) {
    log(`  Browser MCP Validation:   ℹ️  INFO`, 'cyan');
  }
  
  const allPassed = Object.values(results)
    .filter(code => code !== null)
    .every(code => code === 0);
  
  log(''); // newline
  if (allPassed) {
    log('🎉 All tests passed!', 'green');
    log('Ready to commit. For UI changes, validate with Browser MCP via Copilot.\n', 'cyan');
  } else {
    log('💥 Some tests failed', 'red');
    log('Review failures above, fix, and re-run tests.\n', 'yellow');
  }
  
  log(`End time: ${new Date().toISOString()}`, 'blue');
}

// Run
main().catch((err) => {
  log(`Fatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
