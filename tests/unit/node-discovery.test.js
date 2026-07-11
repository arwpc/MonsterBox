/**
 * Unit tests for the zero-config node discovery service.
 * avahi is not present in the test container, so the exec + clock + service-file
 * path are all injected and the mDNS interaction is driven from captured
 * `avahi-browse -rpt` fixtures. Character-independent by design: uses generic
 * node names and RFC-5737 documentation IP ranges (no real character/network).
 */
import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  NodeDiscoveryService,
  parseAvahiBrowse,
  tokenHash,
} from '../../services/nodeDiscoveryService.js';

// Realistic `avahi-browse -rpt _monsterbox._tcp` output (resolved `=` lines,
// plus noise the parser must ignore).
const FIXTURE = [
  '+;wlan0;IPv4;MonsterBox\\032reaper;_monsterbox._tcp;local', // announce-only, not resolved
  '=;wlan0;IPv4;MonsterBox\\032reaper;_monsterbox._tcp;local;reaper.local;192.0.2.20;3000;"id=7" "character=Reaper" "ver=8.4.1"',
  '=;wlan0;IPv6;MonsterBox\\032reaper;_monsterbox._tcp;local;reaper.local;fe80::abcd;3000;"id=7" "character=Reaper"', // IPv6 dupe, ignored
  '=;wlan0;IPv4;MonsterBox\\032wraith;_monsterbox._tcp;local;wraith.local;192.0.2.41;3000;"id=8" "character=Wraith" "ver=8.4.1"',
].join('\n');

function fakeExec(stdout) {
  return async () => ({ stdout, stderr: '' });
}

describe('nodeDiscoveryService — parseAvahiBrowse', () => {
  it('parses resolved IPv4 records and their TXT fields', () => {
    const nodes = parseAvahiBrowse(FIXTURE);
    expect(nodes).to.have.length(2); // announce line + IPv6 dupe ignored
    const reaper = nodes.find((n) => n.id === '7');
    expect(reaper).to.include({ id: '7', character: 'Reaper', ip: '192.0.2.20', port: 3000, version: '8.4.1' });
  });

  it('ignores non-resolved lines and IPv6 duplicates', () => {
    const nodes = parseAvahiBrowse(FIXTURE);
    expect(nodes.every((n) => n.ip.indexOf(':') === -1)).to.equal(true);
  });

  it('returns [] for empty / garbage input', () => {
    expect(parseAvahiBrowse('')).to.deep.equal([]);
    expect(parseAvahiBrowse('nonsense\n+;x')).to.deep.equal([]);
  });
});

describe('nodeDiscoveryService — browse + registry', () => {
  it('populates the live registry from a browse cycle', async () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec(FIXTURE) });
    await svc.browse();
    expect(svc.avahiAvailable).to.equal(true);
    expect(svc.discovered.get('7')).to.include({ ip: '192.0.2.20', status: 'online' });
    expect(svc.discovered.get('8')).to.include({ ip: '192.0.2.41', status: 'online' });
  });

  it('degrades gracefully when avahi is absent (no throw, empty registry)', async () => {
    const svc = new NodeDiscoveryService({
      exec: async () => { throw new Error('avahi-browse: command not found'); },
    });
    const seen = await svc.browse();
    expect(seen).to.deep.equal([]);
    expect(svc.avahiAvailable).to.equal(false);
    expect(svc.discovered.size).to.equal(0);
  });

  it('marks a node offline once it goes stale, without deleting it', async () => {
    let t = 1_000_000;
    const svc = new NodeDiscoveryService({ exec: fakeExec(FIXTURE), staleAfterMs: 90_000, now: () => t });
    await svc.browse();
    expect(svc.discovered.get('7').status).to.equal('online');
    // Advance clock beyond stale window and browse an empty result.
    t += 120_000;
    svc.exec = fakeExec('');
    await svc.browse();
    expect(svc.discovered.get('7').status).to.equal('offline'); // kept, not evicted
  });
});

describe('nodeDiscoveryService — overlay (merge with static config)', () => {
  const CONFIG = [
    { id: 7, name: 'Reaper', ip: '198.51.100.7', port: 3000, characterId: 7 },   // stale config IP
    { id: 9, name: 'Offline Node', ip: '198.51.100.9', port: 3000, characterId: 9 },
  ];

  it('returns the config list UNCHANGED when nothing is discovered (non-regressive)', () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec('') });
    const merged = svc.overlay(CONFIG);
    expect(merged).to.have.length(2);
    expect(merged.find((n) => String(n.id) === '7').ip).to.equal('198.51.100.7');
  });

  it('replaces the config IP with the live discovered IP for online nodes', async () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec(FIXTURE) });
    await svc.browse();
    const merged = svc.overlay(CONFIG);
    const node = merged.find((n) => String(n.id) === '7');
    expect(node.ip).to.equal('192.0.2.20'); // discovery wins over stale config
    expect(node.status).to.equal('online');
    expect(node.discovered).to.equal(true);
  });

  it('appends fully-dynamic discovered nodes not present in config', async () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec(FIXTURE) });
    await svc.browse();
    const merged = svc.overlay(CONFIG);
    expect(merged.find((n) => String(n.id) === '8')).to.exist; // discovered-only node
  });

  it('keeps the config IP as fallback for a config node that is not discovered', async () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec(FIXTURE) });
    await svc.browse();
    const merged = svc.overlay(CONFIG);
    expect(merged.find((n) => String(n.id) === '9').ip).to.equal('198.51.100.9');
  });
});

describe('nodeDiscoveryService — manual fallback', () => {
  it('adds and removes an operator-pinned node', () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec('') });
    expect(svc.addManual({ id: 42, name: 'Garage', ip: '203.0.113.42' }).success).to.equal(true);
    expect(svc.overlay([]).find((n) => String(n.id) === '42').ip).to.equal('203.0.113.42');
    expect(svc.removeManual(42).success).to.equal(true);
    expect(svc.overlay([]).find((n) => String(n.id) === '42')).to.be.undefined;
  });

  it('rejects a manual entry missing id or ip', () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec('') });
    expect(svc.addManual({ name: 'x' }).success).to.equal(false);
  });
});

describe('nodeDiscoveryService — trust token', () => {
  it('trusts everyone when no token is configured', () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec('') });
    expect(svc.isTrusted({ token: null })).to.equal(true);
  });

  it('only trusts peers whose advertised token hash matches', () => {
    const svc = new NodeDiscoveryService({ exec: fakeExec(''), nodeToken: 'sekret' });
    expect(svc.isTrusted({ token: tokenHash('sekret') })).to.equal(true);
    expect(svc.isTrusted({ token: 'deadbeef00000000' })).to.equal(false);
    expect(svc.isTrusted({ token: null })).to.equal(false);
  });
});

describe('nodeDiscoveryService — advertiseSelf', () => {
  it('writes a valid avahi service file with the right TXT records', async () => {
    const tmp = path.join(os.tmpdir(), `mb-adv-${process.pid}.service`);
    const svc = new NodeDiscoveryService({ exec: fakeExec(''), serviceFile: tmp });
    const ok = await svc.advertiseSelf({ id: 7, character: 'Reaper', port: 3000, version: '8.4.1' });
    expect(ok).to.equal(true);
    const xml = await fs.readFile(tmp, 'utf8');
    expect(xml).to.include('<type>_monsterbox._tcp</type>');
    expect(xml).to.include('<txt-record>id=7</txt-record>');
    expect(xml).to.include('<txt-record>character=Reaper</txt-record>');
    expect(xml).to.include('<port>3000</port>');
    await fs.unlink(tmp).catch(() => {});
  });

  it('includes a token TXT record only when a node token is set', async () => {
    const tmp = path.join(os.tmpdir(), `mb-adv-tok-${process.pid}.service`);
    const svc = new NodeDiscoveryService({ exec: fakeExec(''), serviceFile: tmp, nodeToken: 'sekret' });
    await svc.advertiseSelf({ id: 1, character: 'X', port: 3000, version: '8.4.1' });
    const xml = await fs.readFile(tmp, 'utf8');
    expect(xml).to.include(`<txt-record>token=${tokenHash('sekret')}</txt-record>`);
    await fs.unlink(tmp).catch(() => {});
  });
});
