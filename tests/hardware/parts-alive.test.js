/**
 * Parts alive — the smallest safe motion of every working part, judged by the
 * HARDWARE OUTPUT, never by a success field.
 *
 * Run it ON the node, by hand, with someone watching (it moves things):
 *     npm run test:hardware:parts
 * It is never part of the gate (tests/hardware is not in test:smoke).
 *
 * What it does, for the node's OWN character (resolveCharacter, no hardcoded id):
 *   - reads data/character-<id>/parts.json, config/physical-faults.json and
 *     config/scene-hazards.json;
 *   - skips every part listed broken (the servo daemon vetoes their channels anyway);
 *   - skips every part named in a hazard rule (exclusiveParts, partAngleRanges) unless
 *     MB_HARDWARE_ALLOW_HAZARDS=1 — that is where the fused shared rail and the
 *     900-degree multi-turn neck live; this file names no character;
 *   - drives each remaining movable part through the calibration API by a few
 *     degrees / a few hundred milliseconds, and checks the output stage:
 *       PCA9685 servo   goto +-5 deg inside its window, then back; the chip's channel
 *                       duty (servo_cli.py get_duty_pca) must move in the commanded
 *                       direction and return to where it started;
 *       GPIO servo      goto +-5 deg; the signal pin must be seen pulsing (pinctrl);
 *       motor           jog-raw 300 ms at 25 % (or the character's maxMotorSpeed, never
 *                       above 40 %); the drive pins must be seen high while it runs;
 *       linear actuator jog-raw 0.5 s extend, then 0.6 s retract (a retract at least as
 *                       long as the extend); the drive pins must be seen high;
 *       light           on, then off, via POST /api/parts/:id/test; the GPIO level or the
 *                       PCA duty must follow; the light is left as it was found.
 *   A reply carrying `simulated: true` anywhere fails the part outright.
 *
 * Head tracking and the idle loop are paused with a lurk event hold for the run
 * (released in after()), so they do not fight the probe motions.
 *
 * Env: BASE_URL (default http://localhost:3100, must be this node),
 *      MB_HARDWARE_ALLOW_HAZARDS=1, MB_PARTS_ONLY=<id,id> to probe a subset.
 */
import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
const ALLOW_HAZARDS = process.env.MB_HARDWARE_ALLOW_HAZARDS === '1';
const ONLY = (process.env.MB_PARTS_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

const SERVO_STEP_DEG = 5;
const MOTOR_MS = 300;
const MOTOR_PCT = 25;
const MOTOR_PCT_CEILING = 40;
const ACTUATOR_EXTEND_MS = 500;
const ACTUATOR_RETRACT_MS = 600;
const ACTUATOR_PCT = 50;

const readJson = (rel, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')); } catch { return fallback; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function hasSimulated(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.simulated === true) return true;
  return Object.values(obj).some(v => typeof v === 'object' && hasSimulated(v));
}

async function api(method, urlPath, body) {
  const res = await fetch(BASE_URL + urlPath, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (hasSimulated(json)) throw new Error(`${method} ${urlPath} answered simulated:true — that is not hardware`);
  return { status: res.status, json };
}

async function pcaDuty(channel, address) {
  const { stdout } = await execFileP('python3', ['servo_cli.py', 'get_duty_pca', String(channel), String(address)],
    { cwd: path.join(REPO_ROOT, 'python_wrappers'), timeout: 15000 });
  const line = stdout.trim().split('\n').pop();
  const j = JSON.parse(line);
  if (!j.success || !j.data) throw new Error(`get_duty_pca ch${channel}: ${line}`);
  return Number(j.data.duty_pct);
}

async function hasPinctrl() {
  try { await execFileP('pinctrl', ['get', '2'], { timeout: 3000 }); return true; } catch { return false; }
}

async function pinLevels(pins) {
  const { stdout } = await execFileP('pinctrl', ['get', pins.join(',')], { timeout: 3000 });
  const levels = {};
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*(\d+):.*\|\s*(hi|lo)\b/);
    if (m) levels[m[1]] = m[2];
  }
  return levels;
}

/** Sample pins with pinctrl as fast as it runs while `action` is in flight. */
async function sampleWhile(pins, action) {
  let running = true;
  const samples = [];
  const sampler = (async () => {
    while (running) {
      try { samples.push(await pinLevels(pins)); } catch { /* keep sampling */ }
    }
  })();
  let result;
  try { result = await action(); } finally { running = false; await sampler; }
  const highs = {};
  for (const p of pins) highs[p] = samples.filter(s => s[String(p)] === 'hi').length;
  return { result, samples: samples.length, highs };
}

function drivePins(part) {
  const c = part.config || {};
  const pick = k => (part[k] != null ? part[k] : c[k]);
  return ['pwmPin', 'rpwmPin', 'lpwmPin', 'directionPin', 'dirPin', 'renPin', 'lenPin']
    .map(pick).filter(v => Number.isInteger(Number(v)) && v !== null && v !== '').map(Number);
}
function pwmPins(part) {
  const c = part.config || {};
  const pick = k => (part[k] != null ? part[k] : c[k]);
  return ['pwmPin', 'rpwmPin', 'lpwmPin'].map(pick).filter(v => v != null && v !== '').map(Number);
}

/** Map an absolute-servo duty back to the wrapper's angle scale (500–2400 µs over 180°). */
function dutyToAngle(dutyPct) {
  const us = (dutyPct / 100) * 20000;
  return ((us - 500) / 1900) * 180;
}

// The node's own character, through the one supported resolver (top-level await: ESM).
const { resolveCharacter } = await import('../../services/characterContext.js');
const LOAD_CHAR_ID = ((await resolveCharacter({ query: {}, params: {}, app: { locals: {} } })) || {}).id ?? null;

describe('Parts alive (hardware, run on the node)', function () {
  this.timeout(120000);

  let charId = null;
  let parts = [];
  let broken = {};
  let hazardous = new Set();
  let motorCeiling = null;
  let pinctrl = false;
  let held = false;
  const report = [];

  before(async function () {
    if (process.env.MONSTERBOX_HARDWARE_AVAILABLE !== '1') {
      console.log('  parts-alive moves real hardware: run it with npm run test:hardware:parts');
      this.skip();
    }
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL)) {
      console.log('  parts-alive reads the node\'s own files: BASE_URL must be this node');
      this.skip();
    }
    charId = LOAD_CHAR_ID;
    if (charId == null) this.skip();

    parts = readJson(`data/character-${charId}/parts.json`, []);
    const faults = readJson('config/physical-faults.json', {});
    broken = ((faults.characters || {})[String(charId)] || {}).parts || {};
    const hz = ((readJson('config/scene-hazards.json', {}).characters || {})[String(charId)]) || {};
    for (const group of hz.exclusiveParts || []) for (const id of group) hazardous.add(String(id));
    for (const id of Object.keys(hz.partAngleRanges || {})) hazardous.add(String(id));
    motorCeiling = Number.isFinite(hz.maxMotorSpeed) ? hz.maxMotorSpeed : null;
    pinctrl = await hasPinctrl();

    const health = await fetch(`${BASE_URL}/health`).then(r => r.json()).catch(() => null);
    if (!health) throw new Error(`no MonsterBox listener at ${BASE_URL}`);

    // Pause head tracking and the idle loop so they do not move parts under the probe.
    const hold = await api('POST', `/conversation/api/lurk/event-hold?characterId=${charId}`,
      { characterId: charId, reason: 'parts-alive test', maxMs: 10 * 60 * 1000 }).catch(() => null);
    held = !!(hold && hold.status === 200);
    console.log(`  character ${charId}: ${parts.length} parts; broken [${Object.keys(broken).join(', ')}]; ` +
      `hazard [${[...hazardous].join(', ')}]${ALLOW_HAZARDS ? ' (ALLOWED)' : ''}; pinctrl ${pinctrl}; lurk hold ${held}`);
    await sleep(held ? 1500 : 0);
  });

  after(async function () {
    if (held) {
      await api('POST', `/conversation/api/lurk/event-release?characterId=${charId}`,
        { characterId: charId, reason: 'parts-alive test done' }).catch(() => {});
    }
    if (report.length) {
      console.log('\n  parts-alive summary:');
      for (const r of report) console.log(`    part ${r.id} ${r.type} "${r.name}": ${r.verdict} — ${r.detail}`);
    }
  });

  // Mocha registers tests synchronously; the part list is the node's, resolved at load time.
  const staticParts = LOAD_CHAR_ID != null ? readJson(`data/character-${LOAD_CHAR_ID}/parts.json`, []) : [];
  const MOVABLE = new Set(['servo', 'motor', 'linear_actuator', 'light']);

  for (const staticPart of staticParts.filter(p => MOVABLE.has(String(p.type)))) {
    const id = String(staticPart.id);
    it(`part ${id} (${staticPart.type}) "${staticPart.name}" moves and the hardware shows it`, async function () {
      const part = parts.find(p => String(p.id) === id);
      if (!part) this.skip();
      if (ONLY.length && !ONLY.includes(id)) this.skip();
      const record = (verdict, detail) => report.push({ id, type: part.type, name: part.name, verdict, detail });
      if (part.enabled === false) { record('skipped', 'disabled in parts.json'); this.skip(); }
      if (broken[id] && broken[id].status === 'broken') { record('skipped', `listed broken: ${broken[id].reason}`); this.skip(); }
      if (hazardous.has(id) && !ALLOW_HAZARDS) { record('skipped', 'hazard part (set MB_HARDWARE_ALLOW_HAZARDS=1)'); this.skip(); }

      const c = part.config || {};
      const q = `?characterId=${charId}`;

      if (part.type === 'servo') {
        const profRes = await api('GET', `/api/calibration/${id}/profile${q}`);
        const profile = profRes.json && profRes.json.profile;
        expect(profile, 'calibration profile').to.be.ok;
        const kind = profile.capability && profile.capability.kind;
        if (kind !== 'absolute-servo') { record('skipped', `capability ${kind}: no few-degree probe defined`); this.skip(); }
        const maxDeg = profile.capability.maxAngleDeg || 180;
        const b = profile.bounds || {};
        const calibrated = profile.calibrated && !profile.autoGenerated && Number.isFinite(b.minAngle)
          && Number.isFinite(b.maxAngle) && b.maxAngle - b.minAngle >= SERVO_STEP_DEG;
        const lo = calibrated ? b.minAngle : 0;
        const hi = calibrated ? b.maxAngle : maxDeg;

        if (String(c.controllerType).toLowerCase() === 'pca9685') {
          const ch = c.channel; const addr = c.address || 64;
          const d0 = await pcaDuty(ch, addr);
          const now = d0 > 0 ? dutyToAngle(d0) : (lo + hi) / 2;
          const a = Math.round(Math.min(hi, Math.max(lo, now)));
          const target = a + SERVO_STEP_DEG <= hi ? a + SERVO_STEP_DEG : a - SERVO_STEP_DEG;
          // Up to three tries: speech can drive a jaw between our reads.
          let last = '';
          for (let attempt = 1; attempt <= 3; attempt++) {
            const r1 = await api('POST', `/api/calibration/${id}/goto${q}`, { angle: a });
            expect(r1.status, JSON.stringify(r1.json)).to.equal(200);
            await sleep(500);
            const dA = await pcaDuty(ch, addr);
            const r2 = await api('POST', `/api/calibration/${id}/goto${q}`, { angle: target });
            expect(r2.status, JSON.stringify(r2.json)).to.equal(200);
            await sleep(500);
            const dB = await pcaDuty(ch, addr);
            const r3 = await api('POST', `/api/calibration/${id}/goto${q}`, { angle: a });
            expect(r3.status, JSON.stringify(r3.json)).to.equal(200);
            await sleep(500);
            const dA2 = await pcaDuty(ch, addr);
            const inverted = !!(profile.capability.invert);
            const wantUp = (target > a) !== inverted;
            last = `ch${ch} duty ${dA}% @${a}° -> ${dB}% @${target}° -> ${dA2}% @${a}° (window ${lo}-${hi}${calibrated ? '' : ', uncalibrated'})`;
            const moved = Math.abs(dB - dA) >= 0.1 && (wantUp ? dB > dA : dB < dA);
            const returned = Math.abs(dA2 - dA) <= 0.1;
            if (moved && returned) { record('ALIVE', last); return; }
          }
          record('FAILED', last);
          expect.fail(`PCA9685 channel did not follow the commanded angle: ${last}`);
        } else {
          const pin = Number(part.pin != null ? part.pin : (c.pin != null ? c.pin : c.gpioPin));
          if (!pinctrl || !Number.isInteger(pin)) { record('skipped', 'GPIO servo: no pinctrl or no pin'); this.skip(); }
          const pos = await api('GET', `/api/calibration/${id}/position${q}`);
          const now = pos.json && Number.isFinite(pos.json.currentAngle) ? pos.json.currentAngle : (lo + hi) / 2;
          const a = Math.round(Math.min(hi, Math.max(lo, now)));
          const target = a + SERVO_STEP_DEG <= hi ? a + SERVO_STEP_DEG : a - SERVO_STEP_DEG;
          const { result, samples, highs } = await sampleWhile([pin], async () => {
            const r = await api('POST', `/api/calibration/${id}/goto${q}`, { angle: target });
            await api('POST', `/api/calibration/${id}/goto${q}`, { angle: a });
            return r;
          });
          expect(result.status, JSON.stringify(result.json)).to.equal(200);
          const detail = `GPIO${pin} high in ${highs[pin]}/${samples} samples during ${a}°->${target}°->${a}°`;
          if (highs[pin] > 0) { record('ALIVE', detail); return; }
          record('FAILED', detail);
          expect.fail(`no pulse seen on the servo pin: ${detail}`);
        }
      }

      if (part.type === 'motor' || part.type === 'linear_actuator') {
        const pins = drivePins(part);
        const pwm = pwmPins(part);
        if (!pinctrl || pwm.length === 0) { record('skipped', `no pinctrl or no PWM pin in the part (${pins.join(',') || 'none'})`); this.skip(); }
        const idle = await pinLevels(pins);
        const busyPwm = pwm.filter(p => idle[String(p)] === 'hi');
        if (busyPwm.length) { record('skipped', `PWM pin(s) ${busyPwm} already high before the probe — something else is driving it`); this.skip(); }
        const isMotor = part.type === 'motor';
        const speed = isMotor ? Math.min(MOTOR_PCT_CEILING, motorCeiling != null ? motorCeiling : MOTOR_PCT) : ACTUATOR_PCT;
        const extendMs = isMotor ? MOTOR_MS : ACTUATOR_EXTEND_MS;
        const { result, samples, highs } = await sampleWhile(pins, () =>
          api('POST', `/api/calibration/${id}/jog-raw${q}`, { direction: 'extend', speedPct: speed, durationMs: extendMs }));
        // Bring an actuator back at least as far as it went.
        let back = null;
        if (!isMotor) {
          await sleep(300);
          back = await api('POST', `/api/calibration/${id}/jog-raw${q}`, { direction: 'retract', speedPct: speed, durationMs: ACTUATOR_RETRACT_MS });
        }
        expect(result.status, JSON.stringify(result.json)).to.equal(200);
        if (back) expect(back.status, JSON.stringify(back.json)).to.equal(200);
        const pwmHighs = pwm.reduce((n, p) => n + (highs[p] || 0), 0);
        const after = await pinLevels(pins);
        const detail = `${speed}% for ${extendMs} ms${back ? ` then retract ${ACTUATOR_RETRACT_MS} ms` : ''}; PWM pin(s) ${pwm} high in ${pwmHighs} of ${samples} samples; ` +
          `pins after: ${JSON.stringify(after)}`;
        const stillDriving = pwm.some(p => after[String(p)] === 'hi');
        if (pwmHighs > 0 && !stillDriving) { record('ALIVE', detail); return; }
        record('FAILED', detail);
        expect.fail(stillDriving ? `PWM still high after the jog: ${detail}` : `drive pins never went high: ${detail}`);
      }

      if (part.type === 'light') {
        const isPca = String(c.controllerType).toLowerCase() === 'pca9685';
        const pin = Number(part.pin != null ? part.pin : c.pin);
        if (!isPca && (!pinctrl || !Number.isInteger(pin))) { record('skipped', 'GPIO light: no pinctrl or no pin'); this.skip(); }
        const read = async () => (isPca ? ((await pcaDuty(c.channel, c.address || 64)) > 5 ? 'on' : 'off')
          : (await pinLevels([pin]))[String(pin)]);
        const initial = await read();
        const on = await api('POST', `/api/parts/${id}/test${q}`, { action: 'on' });
        await sleep(400);
        const sOn = await read();
        const off = await api('POST', `/api/parts/${id}/test${q}`, { action: 'off' });
        await sleep(400);
        const sOff = await read();
        // Leave it as found: a level equal to the "on" reading means it was on.
        if (initial === sOn) await api('POST', `/api/parts/${id}/test${q}`, { action: 'on' });
        expect(on.status, JSON.stringify(on.json)).to.equal(200);
        expect(off.status, JSON.stringify(off.json)).to.equal(200);
        const detail = `${isPca ? `PCA ch${c.channel}` : `GPIO${pin}`}: initial ${initial}, after on ${sOn}, after off ${sOff}; restored ${initial === sOn ? 'on' : 'off'}`;
        if (sOn !== sOff) { record('ALIVE', detail); return; }
        record('FAILED', detail);
        expect.fail(`the output did not follow on/off: ${detail}`);
      }
    });
  }

  it('found the node\'s part list', function () {
    expect(staticParts.length, 'parts.json of the selected character').to.be.greaterThan(0);
  });
});
