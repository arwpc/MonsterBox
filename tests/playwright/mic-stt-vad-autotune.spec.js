import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';
const execp = promisify(exec);

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

function sh(cmd) {
  return new Promise((resolve) => {
    const child = exec(cmd, { env: process.env });
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
}


async function discoverPhysicalMicId() {
  try {
    const { stdout } = await execp('pactl list short sources');
    const lines = String(stdout || '').split('\n').filter(Boolean);
    // Prefer USB mono capture devices that are not monitors
    const candidates = lines
      .map((ln) => ln.split('\t')[1] || '')
      .filter((name) => name && !/monitor/i.test(name));
    const cmedia = candidates.find((n) => /C-Media.*mono/i.test(n));
    if (cmedia) return cmedia;
    const usbMono = candidates.find((n) => /usb/i.test(n) && /mono/i.test(n));
    return usbMono || (candidates[0] || null);
  } catch (_) { return null; }
}

async function pickNonMonitorMicId(page) {
  try {
    const phys = await discoverPhysicalMicId();
    if (phys) return phys;
  } catch (_) { }
  const resp = await page.request.get(`${BASE_URL}/setup/audio/api/inputs`);
  const json = await resp.json();
  const inputs = (json && json.inputs) || [];
  // Prefer PulseAudio input alias when present, then default, else first non-monitor
  const prefer = inputs.find((x) => /pulse/i.test(x.id || ''))
    || inputs.find((x) => /default/i.test(x.id || ''))
    || inputs.find((x) => !/monitor/i.test((x.id || '') + ' ' + (x.description || '')));


  return prefer ? prefer.id : 'default';
}

async function setDefaultSource(page, id) {
  await page.request.post(`${BASE_URL}/setup/audio/api/system-config`, {
    data: { defaultSource: id }
  });
}

async function setInputGain(page, deviceId, percent) {
  await page.request.post(`${BASE_URL}/setup/audio/api/set-input-gain`, {
    data: { deviceId, gainPercent: percent }
  });
}

async function saveSTTConfig(page, patch) {
  const cur = await (await page.request.get(`${BASE_URL}/api/elevenlabs/stt/config`)).json();
  const cfg = Object.assign({}, (cur && cur.config) || {}, patch || {});
  await page.request.post(`${BASE_URL}/api/elevenlabs/stt/config`, { data: cfg });
}

function playFrontCenterWav() {
  // Use actual speech audio for better STT recognition
  const speechFile = '/home/remote/MonsterBox/tests/assets/hello_monster_box.wav';
  const fallbackFile = '/usr/share/sounds/alsa/Front_Center.wav';
  const cmd = `paplay ${speechFile} 2>/dev/null || paplay ${fallbackFile} || aplay -D pulse ${fallbackFile} || aplay ${fallbackFile} || true`;
  return sh(cmd);
}

function setSpeakerVolume(percent) {
  const vol = Math.max(0, Math.min(200, percent));
  const frac = (vol / 100).toFixed(2);
  const cmd = `wpctl set-volume @DEFAULT_AUDIO_SINK@ ${frac} || pactl set-sink-volume @DEFAULT_SINK@ ${vol}% || true`;
  return sh(cmd);
}

async function getCurrentCharacterId(page) {
  await page.goto(`${BASE_URL}/conversation`);
  const id = await page.evaluate(() => {
    var el = document.getElementById('charLabel');
    var cid = el && el.getAttribute('data-char-id');
    var n = parseInt(cid, 10); return Number.isFinite(n) ? n : null;
  });
  return id;
}

async function ensureCharacterMicPart(page, characterId, micDeviceId) {
  // Find existing mic part for this character
  const list = await (await page.request.get(`${BASE_URL}/setup/parts/api/parts`)).json();
  const parts = Array.isArray(list) ? list : (list.parts || []);
  const existing = parts.find((p) => String(p.type).toLowerCase() === 'microphone' && Number(p.characterId) === Number(characterId));
  if (existing) {
    const cfg = Object.assign({}, existing.config || {}, { deviceId: micDeviceId });
    await page.request.put(`${BASE_URL}/setup/parts/api/parts/${existing.id}`, { data: { config: cfg, characterId: characterId } });
    return existing.id;
  }
  const created = await (await page.request.post(`${BASE_URL}/setup/parts/api/parts`, {
    data: { name: 'Auto Mic', type: 'microphone', description: 'autotune mic', characterId: characterId, config: { deviceId: micDeviceId } }
  })).json();
  return (created && created.id) || null;
}


async function ensureParrotEnabled(page) {
  await page.goto(`${BASE_URL}/conversation`);
  await page.waitForFunction(() => !!document.getElementById('parrotToggle'), null, { timeout: 20000 });
  const toggle = page.locator('#parrotToggle');
  await expect(toggle).toBeVisible();
  if (!(await toggle.isChecked())) await toggle.check();
  await page.evaluate(() => {
    const t = document.getElementById('parrotToggle');
    if (t && !t.checked) t.checked = true;
    if (t) t.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function waitParrotSay(page, timeoutMs) {
  const resp = await page.waitForResponse(
    (res) => res.url().endsWith('/conversation/api/say') && res.request().method() === 'POST',
    { timeout: timeoutMs }
  );
  return resp.ok();
}

async function tryOnce(page) {
  // Play audio multiple times with varied timing to increase chance of recognition
  setTimeout(() => { playFrontCenterWav(); }, 400);
  setTimeout(() => { playFrontCenterWav(); }, 1800);
  setTimeout(() => { playFrontCenterWav(); }, 3200);
  setTimeout(() => { playFrontCenterWav(); }, 4600);
  setTimeout(() => { playFrontCenterWav(); }, 6000);
  return waitParrotSay(page, 60000);
}

/**
 * Auto-tunes microphone Input Gain, STT language/model and VAD threshold using the REAL microphone.
 * Then verifies 10 consecutive successful Parrot responses with English transcripts.
 * Intended to run on the production device (Orlok) with real audio and speakers at ~90%.
 */
test.describe('Auto-tune Mic/STT/VAD (Physical mic, noisy env)', () => {
  test('Tunes for 100% English recognition and persists settings', async ({ page }) => {
    test.setTimeout(300000);

    // 0) Set speaker volume ~90%
    await setSpeakerVolume(90);

    // 1) Choose a real microphone (exclude monitors) and set as default
    const micId = await pickNonMonitorMicId(page);
    await setDefaultSource(page, micId);

    // 1b) Ensure current character uses this microphone device
    const charId = await getCurrentCharacterId(page);
    if (charId != null) { await ensureCharacterMicPart(page, charId, micId); }

    // 2) Baseline STT config: force English model/language, enable VAD and filters
    await saveSTTConfig(page, {
      model: 'scribe_english_v1',
      language: 'en',
      vadEnabled: true,
      vadSilenceDuration: 500,
      audioFilterEnabled: true,
      highpassFreq: 180,
      lowpassFreq: 4200,
      denoiseLevel: -22,
      filterSfx: true,
      validateEnglish: true,
      minLetterRatio: 55,
      requireVowels: true,
      deviceId: micId,
      microphoneDeviceId: micId
    });

    // 3) Enable Parrot Mode + start listening (server WS + browser meter)
    await ensureParrotEnabled(page);
    const micStart = page.locator('#micStart');
    if (await micStart.isVisible()) { try { await micStart.click(); } catch (_) { } }
    await page.waitForTimeout(500);

    // 4) Search parameter grid optimized for real-world conditions
    const gainPercents = [140, 160, 180, 200];
    const vadThresholds = [0.35, 0.40, 0.45, 0.50];

    let chosen = null;
    outer: for (const g of gainPercents) {
      await setInputGain(page, micId, g);
      for (const v of vadThresholds) {
        await saveSTTConfig(page, { vadThreshold: v });
        const ok = await tryOnce(page);
        if (ok) { chosen = { gainPercent: g, vadThreshold: v }; break outer; }
      }
    }

    if (!chosen) {
      await saveSTTConfig(page, { vadThreshold: vadThresholds[vadThresholds.length - 1] });
      throw new Error('Auto-tune failed to find a working mic/VAD combination');
    }

    // 5) Persist winning settings with all filter configurations
    await setInputGain(page, micId, chosen.gainPercent);
    await saveSTTConfig(page, {
      model: 'scribe_english_v1',
      language: 'en',
      vadEnabled: true,
      vadThreshold: chosen.vadThreshold,
      vadSilenceDuration: 500,
      audioFilterEnabled: true,
      highpassFreq: 180,
      lowpassFreq: 4200,
      denoiseLevel: -22,
      filterSfx: true,
      validateEnglish: true,
      minLetterRatio: 55,
      requireVowels: true,
      deviceId: micId,
      microphoneDeviceId: micId
    });

    // 6) Ten-run verification for robustness
    let successes = 0;
    for (let i = 0; i < 10; i++) {
      const ok = await tryOnce(page);
      if (ok) successes++;
      else break;
    }
    expect(successes).toBe(10);
  });
});

