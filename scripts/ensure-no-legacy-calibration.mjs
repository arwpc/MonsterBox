#!/usr/bin/env node
/**
 * CI Guard: Ensure no legacy calibration code exists
 * Fails the build if any legacy calibration patterns are found
 */

import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Legacy patterns to ban (case-insensitive)
// Note: UI text like "Simple Calibration" in HTML/comments is acceptable
// We're looking for functional code patterns
const BANNED_PATTERNS = [
  'simpleCalibrationService',
  'lockMinMax',
  'speedForTime',
  'moveForMs',
  'setMinLegacy',
  'setMaxLegacy',
  'legacyCal',
  'continuousServoCalibrationService',
  'standardServoCalibrationService',
  'linearActuatorCalibrationService'
];

// Files/directories to exclude from search
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
  '.vscode',
  '.idea',
  'scripts/ensure-no-legacy-calibration.mjs', // Exclude this file itself
  'remote-snapshots', // Historical snapshots
  'eslint-rules/no-legacy-calibration.js', // Exclude the rule definition
  'test/', // Exclude test files that reference "Simple Calibration" UI text
  'tests/' // Exclude Playwright tests
];

const LEGACY_FILES = [
  'client/components/calibration',
  'client/views/CalibrationSimple',
  'server/routes/calibration-legacy',
  'server/services/calibrationLegacy',
  'server/controllers/calibrationLegacy',
  'public/js/calibration-legacy',
  'services/simpleCalibrationService.js',
  'services/continuousServoCalibrationService.js',
  'services/standardServoCalibrationService.js',
  'services/linearActuatorCalibrationService.js',
  'views/setup/calibration-linear-actuator.ejs',
  'views/setup/calibration-standard-servo.ejs',
  'views/setup/calibration-continuous-servo.ejs'
];

async function checkForLegacyFiles() {
  const violations = [];

  for (const legacyPath of LEGACY_FILES) {
    const fullPath = path.join(rootDir, legacyPath);
    try {
      const { stdout } = await execAsync(`test -e "${fullPath}" && echo "exists" || echo "missing"`);
      if (stdout.trim() === 'exists') {
        violations.push(`Legacy file/directory exists: ${legacyPath}`);
      }
    } catch (err) {
      // Ignore errors (file doesn't exist, which is what we want)
    }
  }

  return violations;
}

async function grepForPatterns() {
  const violations = [];

  // Build grep command with exclusions
  const excludeArgs = EXCLUDE_PATTERNS
    .filter(p => !p.includes('.'))  // Only directory exclusions
    .map(p => `--exclude-dir="${p}"`)
    .join(' ');

  for (const pattern of BANNED_PATTERNS) {
    try {
      const cmd = `cd "${rootDir}" && grep -r -i ${excludeArgs} --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" --include="*.ejs" "${pattern}" . 2>/dev/null || true`;
      const { stdout } = await execAsync(cmd);

      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        // Filter out excluded files
        const filteredLines = lines.filter(line => {
          const filePath = line.split(':')[0];
          return !EXCLUDE_PATTERNS.some(excl => {
            if (typeof excl === 'string') {
              return filePath.includes(excl);
            }
            return false;
          });
        });

        if (filteredLines.length > 0) {
          violations.push(`Found banned pattern "${pattern}" in ${filteredLines.length} location(s):`);
          filteredLines.slice(0, 5).forEach(line => {
            violations.push(`  ${line.substring(0, 120)}`);
          });
          if (filteredLines.length > 5) {
            violations.push(`  ... and ${filteredLines.length - 5} more`);
          }
        }
      }
    } catch (err) {
      // grep returns non-zero if no matches, which is fine
    }
  }

  return violations;
}

async function main() {
  console.log('🔍 Checking for legacy calibration code...\n');

  const fileViolations = await checkForLegacyFiles();
  const patternViolations = await grepForPatterns();

  const allViolations = [...fileViolations, ...patternViolations];

  if (allViolations.length > 0) {
    console.error('❌ LEGACY CALIBRATION CODE DETECTED!\n');
    console.error('The following violations were found:\n');
    allViolations.forEach(v => console.error(v));
    console.error('\n⚠️  Please remove all legacy calibration code before proceeding.');
    console.error('    The new Unified Positions v1.5 system should be used instead.\n');
    process.exit(1);
  }

  console.log('✅ No legacy calibration code detected. Build can proceed.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Error running legacy calibration check:', err);
  process.exit(1);
});
