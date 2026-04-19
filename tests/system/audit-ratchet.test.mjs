/**
 * Character-independence ratchet test.
 * Fails CI if any bias violation appears outside the baseline allowlist.
 * Also surfaces stale allowlist entries as a hint — noisy on purpose so the
 * ratchet only tightens.
 */
import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function runAuditor() {
  const res = spawnSync('node', ['scripts/audit-character-independence.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

describe('Character-Independence Ratchet', function () {
  this.timeout(10000);

  it('finds no bias violations outside the baseline allowlist', function () {
    const { status, stdout, stderr } = runAuditor();
    const output = `${stdout}\n${stderr}`;
    expect(status, `audit failed:\n${output}`).to.equal(0);
  });
});
