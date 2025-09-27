#!/usr/bin/env node
import http from 'http';
const base = process.env.MONSTERBOX_BASE || 'http://localhost:3000';
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const url = new URL(path, base);
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(url, opt, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c.toString()));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }); }
        catch (e) { resolve({ status: res.statusCode, text: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
(async () => {
  console.log('[servo] Creating standard servo part...');
  let r = await req('POST', '/setup/parts/api/parts', {
    name: 'Smoke Servo', type: 'servo', pin: 18,
    config: { servoType: 'standard', minPulse: 500, maxPulse: 2500, minAngle: 0, maxAngle: 180 }
  });
  if (!r.json.success) throw new Error('Failed to create servo part');
  const id = r.json.part.id;

  console.log('[servo] Move to 15deg...');
  r = await req('POST', `/setup/parts/api/parts/${encodeURIComponent(id)}/test`, { action: 'moveToAngle', angleDeg: 15 });
  if (r.status !== 200 || !r.json.success) {
    console.log('moveToAngle fail:', r);
    throw new Error('moveToAngle failed');
  }

  console.log('[servo] Cleanup...');
  await req('DELETE', `/setup/parts/api/parts/${encodeURIComponent(id)}`);
  console.log('[servo] SUCCESS');
})().catch((e) => { console.error('[servo] FAILED', e.message); process.exit(1); });
