/**
 * UP-5 — liveness watchdog decision logic.
 *
 * The app deliberately swallows uncaughtException/unhandledRejection and the
 * systemd drop-in downgrades Restart= to on-failure, so a wedged-but-active
 * process was unrecoverable without a human. The watchdog script restarts
 * monsterbox.service only after N consecutive /health failures, never touches
 * a service the operator stopped, and resets its counter on any success.
 *
 * These tests run the REAL script with `curl` and `systemctl` stubbed on PATH,
 * so the threshold/reset/refusal behavior is proven without systemd or a Pi.
 * What they cannot prove from the cloud: the timer unit actually firing and a
 * real `systemctl restart` recovering a wedged node — that is bridge work.
 */

import { expect } from 'chai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(APP_ROOT, 'scripts', 'monsterbox-liveness-watchdog.sh');

describe('Liveness watchdog (UP-5)', function () {
  this.timeout(15000);

  let sandbox;
  let stubDir;
  let stateFile;
  let restartsLog;

  async function writeStub(name, body) {
    const p = path.join(stubDir, name);
    await fs.writeFile(p, '#!/bin/bash\n' + body, { mode: 0o755 });
  }

  async function setHealthy(healthy) {
    // curl stub: succeed with a health body, or fail like a timeout would.
    await writeStub('curl', healthy
      ? 'echo \'{"status":"OK","version":"test"}\'\nexit 0\n'
      : 'exit 7\n');
  }

  async function setServiceActive(active) {
    await writeStub('systemctl', [
      `RESTARTS_LOG="${restartsLog}"`,
      'if [ "$1" = "is-active" ]; then',
      active ? '  exit 0' : '  exit 3',
      'fi',
      'if [ "$1" = "restart" ]; then',
      '  echo "$2" >> "$RESTARTS_LOG"',
      '  exit 0',
      'fi',
      'exit 0'
    ].join('\n') + '\n');
  }

  async function runWatchdog() {
    return execFileAsync('bash', [SCRIPT], {
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        MB_WATCHDOG_STATE_FILE: stateFile,
        MB_WATCHDOG_THRESHOLD: '3',
        MB_WATCHDOG_CURL_TIMEOUT: '2'
      }
    });
  }

  async function failures() {
    try { return parseInt(await fs.readFile(stateFile, 'utf8'), 10); } catch (_) { return null; }
  }

  async function restarts() {
    try {
      const raw = await fs.readFile(restartsLog, 'utf8');
      return raw.split('\n').filter(Boolean);
    } catch (_) { return []; }
  }

  beforeEach(async function () {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'mb-watchdog-'));
    stubDir = path.join(sandbox, 'stubs');
    await fs.mkdir(stubDir, { recursive: true });
    stateFile = path.join(sandbox, 'failures');
    restartsLog = path.join(sandbox, 'restarts.log');
  });

  afterEach(async function () {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('healthy service: counter stays 0 and nothing is restarted', async function () {
    await setServiceActive(true);
    await setHealthy(true);

    await runWatchdog();

    expect(await failures()).to.equal(0);
    expect(await restarts()).to.have.length(0);
  });

  it('does not restart before the third consecutive failure', async function () {
    await setServiceActive(true);
    await setHealthy(false);

    await runWatchdog();
    expect(await failures()).to.equal(1);
    await runWatchdog();
    expect(await failures()).to.equal(2);

    expect(await restarts(), 'one flaky check must never bounce a live show').to.have.length(0);
  });

  it('restarts exactly once at the third consecutive failure, then resets', async function () {
    await setServiceActive(true);
    await setHealthy(false);

    await runWatchdog();
    await runWatchdog();
    await runWatchdog();

    const r = await restarts();
    expect(r).to.deep.equal(['monsterbox.service']);
    expect(await failures(), 'counter must reset after acting').to.equal(0);
  });

  it('a success between failures resets the counter', async function () {
    await setServiceActive(true);

    await setHealthy(false);
    await runWatchdog();
    await runWatchdog();
    expect(await failures()).to.equal(2);

    await setHealthy(true);
    await runWatchdog();
    expect(await failures()).to.equal(0);

    await setHealthy(false);
    await runWatchdog();
    expect(await failures(), 'must count from 1 again after a recovery').to.equal(1);
    expect(await restarts()).to.have.length(0);
  });

  it('never resurrects a service the operator stopped', async function () {
    await setServiceActive(false);
    await setHealthy(false);

    // Even with an inherited failure streak on file.
    await fs.writeFile(stateFile, '2', 'utf8');
    await runWatchdog();

    expect(await restarts(), 'a stopped service is the operator\'s decision').to.have.length(0);
    expect(await failures(), 'streak must clear so a later start gets a fresh grace window').to.equal(0);
  });

  it('treats a squatter answering without a health body as a failure', async function () {
    await setServiceActive(true);
    // curl succeeds (HTTP 200) but the body is not MonsterBox's health payload.
    await writeStub('curl', 'echo "<html>not monsterbox</html>"\nexit 0\n');

    await runWatchdog();

    expect(await failures()).to.equal(1);
  });
});
