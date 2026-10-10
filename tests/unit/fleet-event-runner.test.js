/**
 * Fleet-event runner (scripts/fleet-events/run-next.mjs), driven as a child
 * process against stub servers: an HTTP stub for the conductor node (--base) and
 * an HTTPS stub standing in for a peer node (the runner talks https to peers).
 * Proves rotation, quiet hours, busy deferral, release-on-failure, the lock and
 * --force. Nothing reaches a real node: state and lock live in a temp dir.
 */
import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = path.join(ROOT, 'scripts', 'fleet-events', 'run-next.mjs');

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve(data); } });
  });
}

describe('fleet-event runner (run-next.mjs)', function () {
  this.timeout(30000);

  let tmp;
  let base;          // http stub = this node's scene API + registry
  let peer;          // https stub = one peer node
  let basePort;
  let peerPort;
  const calls = [];
  const behaviour = { playStatus: 200, playSuccess: true, peerBusy: false };

  before(async function () {
    const certDir = path.join(ROOT, 'certs');
    if (!fs.existsSync(path.join(certDir, 'server.key'))) this.skip();
    base = http.createServer(async (req, res) => {
      const body = await readBody(req);
      calls.push({ server: 'base', method: req.method, url: req.url, body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/orchestration/nodes')) {
        return res.end(JSON.stringify({ nodes: [{ id: 1, name: 'Stub Peer', characterId: 1, ip: '127.0.0.1', port: peerPort, status: 'online' }] }));
      }
      const play = req.url.match(/^\/scenes\/api\/(\d+)\/play/);
      if (play && req.method === 'POST') {
        res.statusCode = behaviour.playStatus;
        return res.end(JSON.stringify(behaviour.playStatus === 200
          ? { success: true, result: { success: behaviour.playSuccess, results: [{ success: behaviour.playSuccess, type: 'wait', index: 0 }] } }
          : { success: false, error: 'stub play failure' }));
      }
      res.statusCode = 404; res.end('{}');
    });
    peer = https.createServer({
      key: fs.readFileSync(path.join(certDir, 'server.key')),
      cert: fs.readFileSync(path.join(certDir, 'server.cert')),
    }, async (req, res) => {
      const body = await readBody(req);
      calls.push({ server: 'peer', method: req.method, url: req.url, body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/conversation/api/ai-status')) {
        return res.end(JSON.stringify({ success: true, state: behaviour.peerBusy ? 'awake' : 'lurking', conversing: behaviour.peerBusy }));
      }
      if (req.url.startsWith('/conversation/api/lurk/event-release')) return res.end(JSON.stringify({ success: true }));
      res.statusCode = 404; res.end('{}');
    });
    basePort = await listen(base);
    peerPort = await listen(peer);
  });

  after(async function () {
    if (base) base.close();
    if (peer) peer.close();
  });

  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-fleet-events-'));
    calls.length = 0;
    Object.assign(behaviour, { playStatus: 200, playSuccess: true, peerBusy: false });
  });
  afterEach(function () { fs.rmSync(tmp, { recursive: true, force: true }); });

  function config(overrides = {}) {
    const cfg = {
      events: [{ sceneId: 101, name: 'A' }, { sceneId: 102, name: 'B' }, { sceneId: 103, name: 'C' }],
      quietHours: { start: '00:00', end: '00:00' }, // start == end: never quiet
      busyRetry: { attempts: 1, delayMs: 10 },
      playTimeoutMs: 10000,
      stateFile: path.join(tmp, 'state.json'),
      lockFile: path.join(tmp, 'events.lock'),
      ...overrides,
    };
    const p = path.join(tmp, 'events.json');
    fs.writeFileSync(p, JSON.stringify(cfg));
    return p;
  }
  const state = () => JSON.parse(fs.readFileSync(path.join(tmp, 'state.json'), 'utf8'));
  const plays = () => calls.filter(c => c.server === 'base' && /\/play/.test(c.url));

  function run(cfgPath, extra = []) {
    return new Promise(resolve => {
      execFile(process.execPath, [RUNNER, '--config', cfgPath, '--base', `http://127.0.0.1:${basePort}`, ...extra],
        { cwd: ROOT, timeout: 25000, env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' } },
        (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: stdout + stderr }));
    });
  }

  it('rotates 101 -> 102 -> 103 -> 101 and records each play', async function () {
    const cfg = config();
    const seen = [];
    // --dry-run still advances the rotation; it only skips releases and the Goblin read-back.
    for (let i = 0; i < 4; i++) {
      const r = await run(cfg, ['--dry-run']);
      expect(r.code, r.out).to.equal(0);
      seen.push(state().lastSceneId);
    }
    expect(seen).to.deep.equal([101, 102, 103, 101]);
    expect(plays().map(c => c.url.match(/api\/(\d+)\//)[1])).to.deep.equal(['101', '102', '103', '101']);
    expect(state().history.every(h => h.status === 'played')).to.equal(true);
  });

  it('refuses in quiet hours, and --force overrides them', async function () {
    const now = new Date();
    const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const cfg = config({ quietHours: { start: hhmm(new Date(now - 60000)), end: hhmm(new Date(+now + 120000)) } });
    const r = await run(cfg);
    expect(r.code, r.out).to.equal(0);
    expect(r.out).to.match(/refused: quiet hours/);
    expect(plays()).to.have.length(0);
    expect(state().lastStatus).to.equal('refused-quiet');

    const forced = await run(cfg, ['--force', '--dry-run']);
    expect(forced.code, forced.out).to.equal(0);
    expect(plays()).to.have.length(1);
  });

  it('defers when a node reports a live conversation (and never plays over a guest)', async function () {
    behaviour.peerBusy = true;
    const r = await run(config());
    expect(r.code, r.out).to.equal(0);
    expect(r.out).to.match(/busy \(Stub Peer: in a live conversation\)/);
    expect(plays()).to.have.length(0);
    expect(state().lastStatus).to.equal('deferred-busy');
    expect(fs.existsSync(path.join(tmp, 'events.lock')), 'lock released').to.equal(false);
  });

  it('a failed show still releases every node, exits 1 and frees the lock', async function () {
    behaviour.playStatus = 500;
    const r = await run(config());
    expect(r.code, r.out).to.equal(1);
    expect(state().lastStatus).to.equal('failed');
    const releases = calls.filter(c => c.server === 'peer' && c.url.startsWith('/conversation/api/lurk/event-release'));
    expect(releases, 'event-release sent to the peer').to.have.length(1);
    expect(releases[0].body).to.include({ characterId: 1 });
    expect(fs.existsSync(path.join(tmp, 'events.lock'))).to.equal(false);
  });

  // f0fa5f0f: a conductor that ran to its end with non-fatal step failures (an
  // offline Goblin, a busy node) is 'played-with-warnings', not a lost show; it
  // still advances the rotation, exits 0 and lists what was missed.
  it('a show that ran to its end with step failures is played-with-warnings', async function () {
    behaviour.playSuccess = false;
    const r = await run(config());
    expect(r.code, r.out).to.equal(0);
    expect(state().lastStatus).to.equal('played-with-warnings');
    expect(state().lastSceneId).to.equal(101);
    expect(state().history.slice(-1)[0].failed).to.equal(1);
  });

  it('refuses while another live run holds the lock, and takes over a dead one', async function () {
    const cfg = config();
    fs.writeFileSync(path.join(tmp, 'events.lock'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const held = await run(cfg);
    expect(held.code, held.out).to.equal(0);
    expect(held.out).to.match(/refused: another run/);
    expect(plays()).to.have.length(0);

    fs.writeFileSync(path.join(tmp, 'events.lock'), JSON.stringify({ pid: 2147483646, startedAt: new Date().toISOString() }));
    const stale = await run(cfg, ['--dry-run']);
    expect(stale.code, stale.out).to.equal(0);
    expect(stale.out).to.match(/stale lock/);
    expect(plays()).to.have.length(1);
  });

  it('--dry-run plays with ?dryRun=1 and sends no releases', async function () {
    const r = await run(config(), ['--dry-run']);
    expect(r.code, r.out).to.equal(0);
    expect(plays()[0].url).to.contain('dryRun=1');
    expect(calls.filter(c => c.server === 'peer' && /event-release/.test(c.url))).to.have.length(0);
  });
});
