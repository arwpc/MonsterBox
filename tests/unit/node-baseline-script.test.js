/**
 * Node OS baseline script — the /etc a deploy cannot carry.
 *
 * A fleet deploy rsyncs the repo and cannot touch /etc, so nodes drift: the
 * 2026-09-04 audit found a 2.3 GB journal, no log rotation, no service drop-ins
 * and a root-owned avahi file on one node, and Wi-Fi power-save on five. The
 * script converges a node in one idempotent pass. It needs root for real, so it
 * is proven here under MB_BASELINE_PREFIX: every /etc and /var path lands in a
 * temp dir and no daemon is restarted. What is asserted is the part that has
 * bitten before — the journald cap carries SystemMaxFileSize (without it the
 * cap does not hold), a second run changes nothing, and a hand-tuned drop-in is
 * never overwritten.
 */
import { expect } from 'chai';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '../../scripts/node-baseline/apply-baseline.sh');

function run(prefix) {
  return spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, MB_BASELINE_PREFIX: prefix },
    timeout: 20000
  });
}

describe('node baseline script (scripts/node-baseline/apply-baseline.sh)', function () {
  this.timeout(30000);

  let prefix;
  before(() => { prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-baseline-')); });
  after(() => { fs.rmSync(prefix, { recursive: true, force: true }); });

  it('lays down every baseline file on a bare node and exits 0', function () {
    const r = run(prefix);
    expect(r.status, r.stderr).to.equal(0);
    for (const f of [
      'etc/avahi/services/monsterbox.service',
      'etc/systemd/journald.conf.d/monsterbox.conf',
      'etc/logrotate.d/monsterbox',
      'etc/NetworkManager/conf.d/10-monsterbox-wifi-powersave.conf',
      'etc/systemd/system/monsterbox.service.d/10-priority.conf',
      'etc/systemd/system/monsterbox.service.d/20-secrets.conf',
      'etc/systemd/system/monsterbox.service.d/30-crontab.conf',
      'etc/monsterbox/env',
      'var/log/monsterbox.log',
      'var/log/monsterbox.err'
    ]) {
      expect(fs.existsSync(path.join(prefix, f)), `${f} missing`).to.equal(true);
    }
    expect(r.stdout).to.match(/\[changed\] journald/);
    expect(r.stdout).to.match(/new drop-ins apply on the next service start/);
  });

  it('caps the journal per FILE as well as in total — a total cap alone never holds', function () {
    const conf = fs.readFileSync(path.join(prefix, 'etc/systemd/journald.conf.d/monsterbox.conf'), 'utf8');
    expect(conf).to.match(/^SystemMaxUse=64M$/m);
    expect(conf).to.match(/^SystemMaxFileSize=16M$/m);
    expect(conf).to.match(/^Storage=persistent$/m);
  });

  it('keeps secrets at 0600 and drop-ins at 0644', function () {
    const mode = (f) => (fs.statSync(path.join(prefix, f)).mode & 0o777);
    expect(mode('etc/monsterbox/env')).to.equal(0o600);
    expect(mode('etc/systemd/system/monsterbox.service.d/10-priority.conf')).to.equal(0o644);
  });

  it('pins Wi-Fi power-save off with the same text the standalone script writes', function () {
    const conf = fs.readFileSync(path.join(prefix, 'etc/NetworkManager/conf.d/10-monsterbox-wifi-powersave.conf'), 'utf8');
    expect(conf).to.match(/^\[connection\]$/m);
    expect(conf).to.match(/^wifi\.powersave = 2$/m);
    // Byte-identical to wifi-powersave-off.sh's output, or a node that ran that
    // script first reports a spurious [changed] here and rewrites the file.
    const standalone = fs.readFileSync(path.resolve(__dirname, '../../scripts/node-baseline/wifi-powersave-off.sh'), 'utf8');
    for (const line of conf.trimEnd().split('\n')) {
      expect(standalone, `line not in wifi-powersave-off.sh: ${line}`).to.include(`'${line}'`);
    }
  });

  it('is idempotent: a second run reports 0 changes and rewrites nothing', function () {
    const before = fs.statSync(path.join(prefix, 'etc/logrotate.d/monsterbox')).mtimeMs;
    const r = run(prefix);
    expect(r.status).to.equal(0);
    expect(r.stdout).to.match(/: 0 change\(s\)/);
    expect(r.stdout).to.not.match(/\[changed\]/);
    expect(fs.statSync(path.join(prefix, 'etc/logrotate.d/monsterbox')).mtimeMs).to.equal(before);
  });

  it('never overwrites a drop-in an operator has tuned', function () {
    const p = path.join(prefix, 'etc/systemd/system/monsterbox.service.d/10-priority.conf');
    const tuned = '[Service]\nNice=-5\nRestart=on-failure\nRestartSec=2\n';
    fs.writeFileSync(p, tuned);
    const r = run(prefix);
    expect(r.status).to.equal(0);
    expect(fs.readFileSync(p, 'utf8')).to.equal(tuned);
    expect(r.stdout).to.match(/10-priority\.conf present \(left as tuned\)/);
  });

  it('converges a drifted journald cap instead of leaving it', function () {
    const p = path.join(prefix, 'etc/systemd/journald.conf.d/monsterbox.conf');
    fs.writeFileSync(p, '[Journal]\nSystemMaxUse=64M\n'); // the cap that never held
    const r = run(prefix);
    expect(r.stdout).to.match(/\[changed\] journald/);
    expect(fs.readFileSync(p, 'utf8')).to.match(/^SystemMaxFileSize=16M$/m);
  });
});
