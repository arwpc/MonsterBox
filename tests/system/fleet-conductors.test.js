/**
 * The fleet-event conductors validate against the LIVE node without writing:
 * scripts/fleet-events/install-conductors.mjs --validate-only uses the replace
 * endpoint's validateOnly mode (every event part, bed and step resolves). Runs
 * only on the node whose own character hosts the conductors (its scenes.json
 * holds every conductor id); elsewhere it skips.
 */
import { expect } from 'chai';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('fleet-event conductors (validate-only against the node)', function () {
  this.timeout(60000);

  it('install-conductors --validate-only succeeds with no warnings and writes nothing', async function () {
    const cfg = await request(BASE_URL).get('/api/config');
    const charId = cfg.body && cfg.body.config && cfg.body.config.selectedCharacter;
    const scenesFile = path.join(ROOT, 'data', `character-${charId}`, 'scenes.json');
    const conductorIds = fs.readdirSync(path.join(ROOT, 'scripts', 'fleet-events', 'conductors'))
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fleet-events', 'conductors', f), 'utf8')).id);
    let held = [];
    try { held = JSON.parse(fs.readFileSync(scenesFile, 'utf8')).map(s => s.id); } catch { /* none */ }
    if (!conductorIds.every(id => held.includes(id))) this.skip(); // not the conductor host

    const before = crypto.createHash('sha256').update(fs.readFileSync(scenesFile)).digest('hex');
    const out = await new Promise(resolve => execFile(process.execPath,
      [path.join(ROOT, 'scripts', 'fleet-events', 'install-conductors.mjs'), '--character', String(charId), '--validate-only', '--base', BASE_URL],
      { cwd: ROOT, timeout: 55000 }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, text: stdout + stderr })));
    expect(out.code, out.text).to.equal(0);
    const json = JSON.parse(out.text.slice(out.text.indexOf('{')));
    expect(json.success).to.equal(true);
    expect(json.validateOnly).to.equal(true);
    expect(json.warnings, JSON.stringify(json.warnings)).to.deep.equal([]);
    const after = crypto.createHash('sha256').update(fs.readFileSync(scenesFile)).digest('hex');
    expect(after, 'validate-only must not write scenes.json').to.equal(before);
  });
});
