#!/usr/bin/env node
/**
 * Pre-Deploy Gate
 *
 * Fast-fail pipeline that blocks bad deploys. Run locally via `npm run gate`,
 * via .git/hooks/pre-push, and in CI.
 *
 * Steps (in order, each may abort the gate):
 *   1. validate:schemas          — per-character data files conform to schemas
 *   2. audit:resolver             — no direct character-state reads outside allowlist
 *   3. audit:independence         — bias-pattern ratchet (Pillar 5; stub no-op if absent)
 *   4. test:smoke                  — unit-level sanity pass
 *   5. test:pact                   — per-character contract suite
 *
 * Opt-out: MB_SKIP_GATE=1 prints a warning and exits 0. Use only for emergency pushes.
 *
 * Target wall-clock: < 90 s on RPi4B, < 3 min in CI.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

if (process.env.MB_SKIP_GATE === '1') {
  console.warn('⚠️  MB_SKIP_GATE=1 set — gate bypassed. Do not make this a habit.');
  process.exit(0);
}

const STEPS = [
  { name: 'validate:schemas',     cmd: 'npm', args: ['run', '--silent', 'validate:schemas'], timeoutMs: 10_000 },
  { name: 'audit:resolver',       cmd: 'npm', args: ['run', '--silent', 'audit:resolver'],   timeoutMs: 10_000 },
  { name: 'audit:independence',   cmd: 'npm', args: ['run', '--silent', 'audit:independence'], timeoutMs: 10_000, optional: true },
  { name: 'test:smoke',           cmd: 'npm', args: ['run', '--silent', 'test:smoke'],       timeoutMs: 60_000 },
  { name: 'test:pact',            cmd: 'npm', args: ['run', '--silent', 'test:pact'],        timeoutMs: 30_000 },
];

function hasScript(name) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    return Boolean(pkg.scripts && pkg.scripts[name]);
  } catch {
    return false;
  }
}

const overallStart = Date.now();
let failed = null;

for (const step of STEPS) {
  if (step.optional && !hasScript(step.name)) {
    console.log(`○ ${step.name}: not yet installed — skipping (optional)`);
    continue;
  }
  const start = Date.now();
  process.stdout.write(`→ ${step.name} ... `);
  const result = spawnSync(step.cmd, step.args, {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: step.timeoutMs,
  });
  const ms = Date.now() - start;
  if (result.status === 0) {
    console.log(`ok (${ms} ms)`);
    continue;
  }
  console.log(`FAIL (${ms} ms)`);
  console.log(result.stdout || '');
  console.log(result.stderr || '');
  failed = step.name;
  break;
}

const totalMs = Date.now() - overallStart;
if (failed) {
  console.error(`\n✗ Gate failed at step: ${failed} (total ${totalMs} ms)`);
  console.error('  Fix the reported issue and re-run `npm run gate`.');
  console.error('  Emergency bypass: MB_SKIP_GATE=1 git push (use sparingly; still fails in CI).\n');
  process.exit(1);
}

console.log(`\n✓ Gate passed (total ${totalMs} ms).`);
process.exit(0);
