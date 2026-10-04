import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  driveJawFromPcmStream,
  stopPcmJawStream,
  readJawConfig
} from '../../services/jawAnimationSuperPowerService.js';
import ledSpeakingSync from '../../services/ledSpeakingSync.js';
import speechExpression from '../../services/speechExpressionService.js';

/**
 * A character with LED eye sync but NO jaw servo (Renfield, PumpkinHead) drives
 * its eyes from the realtime agent's PCM through the jaw PCM stream. Tearing that
 * stream down used to dereference `stream.guardrails.minAngle` — null on an
 * LED-only stream — so stopPcmJawStream threw before deleting the stream. The
 * caller swallows the error, the dead stream kept its `timer` handle, and every
 * later chunk was queued against a timer that never ran: after the FIRST agent
 * session ended the eyes never reacted to speech again until a restart.
 *
 * Uses a synthetic character in a temp cwd and stubs the LED / head drivers, so
 * it drives no hardware and reads no real character's data.
 */
describe('LED-only realtime stream (no jaw servo)', function () {
  const CHAR_ID = 990001;
  let tmpDir;
  let originalCwd;
  const saved = {};
  let calls;

  before(function () {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-led-only-'));
    const charDir = path.join(tmpDir, 'data', `character-${CHAR_ID}`);
    fs.mkdirSync(charDir, { recursive: true });
    fs.writeFileSync(path.join(charDir, 'super-powers.json'), JSON.stringify({
      jawAnimation: {
        enabled: false,
        servoPartId: null,
        configs: [],
        ledSync: { enabled: true, partId: '5', colorLow: [70, 0, 0], colorHigh: [255, 120, 0] }
      }
    }));
    fs.writeFileSync(path.join(charDir, 'parts.json'), '[]');
    process.chdir(tmpDir);

    for (const key of ['begin', 'noteLevel', 'end']) saved['led.' + key] = ledSpeakingSync[key];
    for (const key of ['startSpeaking', 'noteLevel', 'stopSpeaking', 'stopAll']) saved['expr.' + key] = speechExpression[key];
    ledSpeakingSync.begin = async () => { calls.begin++; return true; };
    ledSpeakingSync.noteLevel = () => { calls.level++; };
    ledSpeakingSync.end = async () => { calls.end++; };
    speechExpression.startSpeaking = async () => {};
    speechExpression.noteLevel = () => {};
    speechExpression.stopSpeaking = () => {};
    speechExpression.stopAll = () => {};
  });

  after(function () {
    try { stopPcmJawStream(CHAR_ID); } catch (_) { /* best effort */ }
    for (const [key, fn] of Object.entries(saved)) {
      const [owner, name] = key.split('.');
      (owner === 'led' ? ledSpeakingSync : speechExpression)[name] = fn;
    }
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(function () {
    calls = { begin: 0, level: 0, end: 0 };
  });

  // 0.2 s of a loud 220 Hz tone, PCM16LE mono 16 kHz.
  function tone() {
    const samples = 3200;
    const buf = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      buf.writeInt16LE(Math.round(20000 * Math.sin(2 * Math.PI * 220 * i / 16000)), i * 2);
    }
    return buf;
  }

  const settle = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  it('lights the eyes for speech in every session, not only the first', async function () {
    this.timeout(5000);

    const first = await driveJawFromPcmStream(CHAR_ID, tone(), 16000);
    expect(first.success, 'first session queues audio').to.equal(true);
    await settle(400);
    expect(calls.begin, 'first session begins LED sync').to.equal(1);
    expect(calls.level, 'first session feeds levels').to.be.greaterThan(0);

    // Session teardown must succeed on a stream with no jaw servo.
    let stopResult;
    expect(() => { stopResult = stopPcmJawStream(CHAR_ID); }).to.not.throw();
    expect(stopResult.success).to.equal(true);

    calls = { begin: 0, level: 0, end: 0 };
    const second = await driveJawFromPcmStream(CHAR_ID, tone(), 16000);
    expect(second.success, 'second session queues audio').to.equal(true);
    await settle(400);
    expect(calls.begin, 'second session begins LED sync again').to.equal(1);
    expect(calls.level, 'second session feeds levels').to.be.greaterThan(0);
  });
});

/**
 * Eyes react to speech by default: a character that owns an led_ring and has
 * never saved LED eye sync gets it on, driving that ring. A saved block (on or
 * off) and a character with no ring are untouched — this is what keeps every
 * other animatronic's behaviour exactly as it was when it pulls this repo.
 */
describe('LED eye sync default', function () {
  let tmpDir;
  let originalCwd;
  const RING = { id: '7', type: 'led_ring', name: 'Eyes', enabled: true };
  const SERVO = { id: '3', type: 'servo', name: 'Jaw' };

  function writeCharacter(id, jaw, parts) {
    const dir = path.join(tmpDir, 'data', `character-${id}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'super-powers.json'), JSON.stringify(jaw ? { jawAnimation: jaw } : {}));
    fs.writeFileSync(path.join(dir, 'parts.json'), JSON.stringify(parts));
  }

  before(function () {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-led-default-'));
    writeCharacter(990011, { enabled: false, servoPartId: null, configs: [] }, [RING]);
    writeCharacter(990012, { enabled: false, servoPartId: null, configs: [],
      ledSync: { enabled: false, partId: null } }, [RING]);
    writeCharacter(990013, { enabled: true, servoPartId: '3', configs: [] }, [SERVO]);
    writeCharacter(990014, null, [RING]);
    writeCharacter(990015, { enabled: false, servoPartId: null, configs: [],
      ledSync: { enabled: true, partId: '7', colorLow: [1, 2, 3] } }, [RING]);
    process.chdir(tmpDir);
  });

  after(function () {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('turns eye sync on for a ring-owning character that never saved it', async function () {
    const cfg = await readJawConfig(990011);
    expect(cfg.ledSync.enabled).to.equal(true);
    expect(cfg.ledSync.partId).to.equal('7');
  });

  it('also does so for a character with no jawAnimation section at all', async function () {
    const cfg = await readJawConfig(990014);
    expect(cfg.ledSync.enabled).to.equal(true);
    expect(cfg.ledSync.partId).to.equal('7');
  });

  it('leaves an explicitly disabled eye sync off', async function () {
    const cfg = await readJawConfig(990012);
    expect(cfg.ledSync.enabled).to.equal(false);
    expect(cfg.ledSync.partId).to.equal(null);
  });

  it('leaves a character with no led_ring off', async function () {
    const cfg = await readJawConfig(990013);
    expect(cfg.ledSync.enabled).to.equal(false);
    expect(cfg.ledSync.partId).to.equal(null);
  });

  it('uses a saved, enabled block exactly as stored', async function () {
    const cfg = await readJawConfig(990015);
    expect(cfg.ledSync.enabled).to.equal(true);
    expect(cfg.ledSync.partId).to.equal('7');
    expect(cfg.ledSync.colorLow).to.deep.equal([1, 2, 3]);
    expect(cfg.ledSync.autoDefault).to.equal(undefined);
  });
});
