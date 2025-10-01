#!/usr/bin/env node
// Minimal smoke test for calibration webcam controls
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
        try {
          resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, text: buf });
        }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function pickFirstWebcam(parts) {
  return (parts || []).find((p) => p.type === 'webcam');
}

(async () => {
  console.log('[smoke] Listing calibration parts...');
  let r = await req('GET', '/setup/calibration/api/parts');
  if (r.status !== 200 || !r.json.success) throw new Error('Failed to list parts');
  let webcam = pickFirstWebcam(r.json.parts);

  if (!webcam) {
    console.log('[smoke] Creating a webcam part...');
    const create = await req('POST', '/setup/parts/api/parts', {
      name: 'Skull Cam',
      type: 'webcam',
      config: { deviceId: 0, resolution: '640x480', fps: 24, quality: 80 }
    });
    if (!create.json.success) throw new Error('Failed to create webcam part');
    webcam = create.json.part;
  }

  console.log('[smoke] Listing webcam controls...');
  r = await req('GET', `/setup/webcam/api/parts/${encodeURIComponent(webcam.id)}/controls/list`);
  if (r.status !== 200 || !r.json.success) {
    console.log('controls list fail:', r);
    throw new Error('listControls failed');
  }
  const names = r.json.controls || [];
  const raw = r.json.rawOutput || '';
  const first = names[0];
  let value = null;
  if (first && raw) {
    const line = raw.split('\n').find(l => l.trim().startsWith(first + ' ')) || '';
    const m = /(?:value|default)=([0-9]+)/.exec(line);
    if (m) value = parseInt(m[1], 10);
  }
  if (first && value != null) {
    const patch = { [first]: value };
    console.log('[smoke] Setting webcam controls (no-op patch)...', first, '=', value);
    r = await req('PUT', `/setup/webcam/api/parts/${encodeURIComponent(webcam.id)}/controls/set`, { controls: patch, persist: false });
    if (r.status !== 200 || !r.json.success) {
      console.log('setControls fail:', r);
      throw new Error('setControls failed');
    }
  } else {
    console.log('[smoke] Skipping setControls (no controls or value parse failed)');
  }

  console.log('[smoke] Apply to mjpg-streamer (dry-run)...');
  r = await req('POST', `/setup/webcam/api/parts/${encodeURIComponent(webcam.id)}/apply-device`, { dryRun: true });
  if (r.status !== 200 || !r.json.success) {
    console.log('applyDevice fail:', r);
    throw new Error('applyDevice failed');
  }
  console.log('[smoke] SUCCESS');
})().catch((e) => { console.error('[smoke] FAILED', e.message); process.exit(1); });
