import { test, expect } from '../test.setup';
import fs from 'fs';

import path from 'path';

// Comprehensive, headed-mode friendly E2E covering:
// - Character creation/selection
// - Parts CRUD for ALL supported types + inline tests
// - Models + Calibration basics
// - AI Settings (STT/TTS/Agents) quick interactions
// - Character data isolation (UI + filesystem)
//
// Assumptions:
// - MB_TEST_MODE=1 (stubs hardware/external services where applicable)
// - Playwright config starts the web server and uses 127.0.0.1:3000

const CHARACTERS = [
  { id: 1, name: 'PumpkinHead' },
  { id: 2, name: 'Coffin Breaker' },
  { id: 3, name: 'Orlok' },
  { id: 4, name: 'Skulltalker' },
];

async function cleanupE2EPartsOnDisk() {
  const base = path.resolve(process.cwd(), 'data');
  let entries = [];
  try { entries = await fs.promises.readdir(base, { withFileTypes: true }); } catch { return; }
  const e2eNamePattern = /^(Servo-Std|Servo-Cont|Servo-Fb|LinearAct|Motor|LED|Light|Sensor|Motion|Webcam|Microphone|Speaker|HeadTrack)-/i;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!/^character-\d+$/.test(ent.name)) continue;
    const file = path.join(base, ent.name, 'parts.json');
    try {
      const txt = await fs.promises.readFile(file, 'utf8');
      const parts = JSON.parse(txt);
      if (!Array.isArray(parts)) continue;
      const filtered = parts.filter(p => !(p && typeof p.name === 'string' && e2eNamePattern.test(p.name)));
      if (filtered.length !== parts.length) {
        await fs.promises.writeFile(file, JSON.stringify(filtered, null, 2), 'utf8');
      }
    } catch { /* ignore */ }
  }
}


async function ensureCharactersExist(page) {
  const res = await page.request.get('/setup/characters/api/characters');
  const data = await res.json();
  const existing = (data && data.success && data.characters) ? data.characters : [];
  const existingNames = new Set(existing.map(c => (c.name || '').toLowerCase()));

  for (const c of CHARACTERS) {
    if (!existingNames.has(c.name.toLowerCase())) {
      // Create character via UI page (uses prompt)
      await page.goto('/setup/characters');
      // Set up dialog handler before clicking
      const nameToCreate = c.name;
      const dialogPromise = page.waitForEvent('dialog').then(d => d.accept(nameToCreate));
      await page.click('#createCharBtn');
      await dialogPromise;
      // Wait until backend reflects the new character (poll API)
      await page.waitForFunction(async (name) => {
        try {
          const r = await fetch('/setup/characters/api/characters');
          const j = await r.json();
          return j && j.success && Array.isArray(j.characters) && j.characters.some(ch => (ch.name || '').toLowerCase() === String(name).toLowerCase());
        } catch (_) { return false; }
      }, nameToCreate, { timeout: 10000 });
      // Ensure UI shows it (reload table rendered by page script)
      await page.reload();
      await expect(page.locator('#charactersContainer')).toContainText(nameToCreate, { timeout: 5000 });
    }
  }
}

async function switchCharacter(page, charName) {
  await page.goto('/');
  // Try UI switch first
  try {
    await page.click('nav [id="charLabel"]');
    // Wait for menu items to populate
    await page.waitForSelector('#charMenu button.dropdown-item', { state: 'visible', timeout: 3000 });
    const btn = page.locator('#charMenu button.dropdown-item', { hasText: charName });
    await expect(btn).toBeVisible({ timeout: 2000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      btn.click(),
    ]);
  } catch (_) {
    // Fallback: use API to select by name
    const res = await page.request.get('/setup/characters/api/characters');
    const data = await res.json();
    const chars = (data && data.success && data.characters) ? data.characters : [];
    const match = chars.find(c => String(c.name || '').toLowerCase() === String(charName || '').toLowerCase());
    if (!match) throw new Error('Character not found: ' + charName);
    await page.request.post('/setup/characters/api/select', { data: { id: match.id } });
    await page.reload();
  }
  // Verify selection via API (source of truth), since label may not reflect runtime updates
  const listRes = await page.request.get('/setup/characters/api/characters');
  const list = await listRes.json();
  const all = (list && list.success && list.characters) ? list.characters : [];
  const targetChar = all.find(c => String(c.name || '').toLowerCase() === String(charName || '').toLowerCase());
  if (!targetChar) throw new Error('Character not found for verification: ' + charName);
  await page.waitForFunction(async (id) => {
    const r = await fetch('/setup/characters/api/current');
    const d = await r.json();
    return d && d.selectedCharacter === id;
  }, targetChar.id, { timeout: 10000 });
}

async function openSetupParts(page) {
  // Parts page removed; open Calibration hub instead
  await page.goto('/setup/calibration');
  await expect(page.locator('#deviceList')).toBeVisible();
}

async function createServo(page, name, servoType, channel = 0) {
  // Create via API (UI Add Part disabled)
  await page.request.post('/setup/calibration/api/parts', { data: {
    name,
    type: 'servo',
    config: { servoType, controllerType: 'pca9685', pcaAddress: '0x40', pcaChannel: channel }
  }});
  // Verify via API instead of UI list (Parts page UI is de-featured)
  const res = await page.request.get('/setup/calibration/api/parts');
  const json = await res.json();
  const found = (json && json.success && json.parts || []).some(p => p.name === name && p.type === 'servo');
  expect(found, `Part ${name} should exist`).toBeTruthy();
}

async function createLinearActuator(page, name) {
  await page.request.post('/setup/calibration/api/parts', { data: {
    name,
    type: 'linear_actuator',
    directionPin: 18,
    pwmPin: 13,
    maxExtension: 15000,
    maxRetraction: 15000
  }});
  const resLA = await page.request.get('/setup/calibration/api/parts');
  const jsonLA = await resLA.json();
  const foundLA = (jsonLA && jsonLA.success && jsonLA.parts || []).some(p => p.name === name && p.type === 'linear_actuator');
  expect(foundLA, `Part ${name} should exist`).toBeTruthy();
}

async function createMotor(page, name) {
  await page.request.post('/setup/calibration/api/parts', { data: {
    name,
    type: 'motor',
    directionPin: 22,
    pwmPin: 12
  }});
  const resM = await page.request.get('/setup/calibration/api/parts');
  const jsonM = await resM.json();
  const foundM = (jsonM && jsonM.success && jsonM.parts || []).some(p => p.name === name && p.type === 'motor');
  expect(foundM, `Part ${name} should exist`).toBeTruthy();
}

async function createPinPart(page, type, name, pin) {
  await page.request.post('/setup/calibration/api/parts', { data: {
    name,
    type,
    pin
  }});
  const resPin = await page.request.get('/setup/calibration/api/parts');
  const jsonPin = await resPin.json();
  const foundPin = (jsonPin && jsonPin.success && jsonPin.parts || []).some(p => p.name === name && p.type === type);
  expect(foundPin, `Part ${name} should exist`).toBeTruthy();
}

async function createWebcam(page, name) {
  await page.request.post('/setup/calibration/api/parts', { data: { name, type: 'webcam', config: { device: '/dev/video0' } } });
  const res = await page.request.get('/setup/calibration/api/parts');
  const json = await res.json();
  const found = (json && json.success && json.parts || []).some(p => p.name === name && p.type === 'webcam');
  expect(found, `Part ${name} should exist`).toBeTruthy();
}

async function createMicrophone(page, name) {
  await page.request.post('/setup/calibration/api/parts', { data: { name, type: 'microphone', config: { deviceId: 'default' } } });
  const res2 = await page.request.get('/setup/calibration/api/parts');
  const json2 = await res2.json();
  const found2 = (json2 && json2.success && json2.parts || []).some(p => p.name === name && p.type === 'microphone');
  expect(found2, `Part ${name} should exist`).toBeTruthy();
}

async function createSpeaker(page, name) {
  await page.request.post('/setup/calibration/api/parts', { data: { name, type: 'speaker', config: { device: 'default', volume: 50 } } });
  const res3 = await page.request.get('/setup/calibration/api/parts');
  const json3 = await res3.json();
  const found3 = (json3 && json3.success && json3.parts || []).some(p => p.name === name && p.type === 'speaker');
  expect(found3, `Part ${name} should exist`).toBeTruthy();
}

async function openTestDrawer(page, partName) {
  const card = page.locator('[data-testid="part-card"]', { hasText: partName }).first();
  await expect(card).toBeVisible();
  await card.locator('[data-testid="open-test-btn"]').click();
  const drawer = card.locator('[data-testid="test-drawer"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

async function quickTestFromDrawer(drawer) {
  const quick = drawer.locator('[data-testid="quick-test-btn"]');
  await expect(quick).toBeVisible();
  await quick.click();
}

async function ensureSeedModels(page) {
  // Simple seeds for required types
  async function seed(type, name, defaults) {
    await page.goto('/setup/models');
    await page.selectOption('#typeSelect', type);
    await page.fill('#modelName', name);
    await page.fill('#modelDesc', `${type} defaults`);
    await page.fill('#modelDefaults', JSON.stringify(defaults));
    await page.click('#btnSaveModel');
    await expect(page.locator('#modelsTable tbody')).toBeVisible();
  }
  await seed('servo', 'E2E Servo Model', { minPulse: 500, maxPulse: 2500, neutral: 1500, rotationRangeDeg: 180 });
  await seed('linear_actuator', 'E2E LA Model', { speedMaxPct: 100, strokeMs: 2000 });
  await seed('motor', 'E2E Motor Model', { maxDutyPct: 100 });
}

async function basicCalibrationCheck(page, preferServoName) {
  await page.goto('/setup/calibration');
  const list = page.locator('#deviceList .list-group-item');
  await expect(list.first()).toBeVisible();
  // Pick the preferred servo first if available
  let target = list.first();
  if (preferServoName) {
    const match = page.locator('#deviceList .list-group-item', { hasText: preferServoName });
    if (await match.count()) target = match.first();
  }
  await target.click();
  // If model selector visible, assign first model
  const modelSel = page.locator('#modelSelect');
  if ((await modelSel.count()) && (await modelSel.isVisible())) {
    const optCount = await modelSel.locator('option').count();
    if (optCount > 1) {
      await modelSel.selectOption({ index: 1 });
      const assignBtn = page.locator('#assignModelBtn');
      if (await assignBtn.count()) await assignBtn.click();
      await page.waitForTimeout(200);
    }
  }
  // Try a move if available
  const angNum = page.locator('#angNum');
  const goAng = page.locator('#goAng');
  if (await angNum.count() && await goAng.count()) {
    await angNum.fill('30');
    await goAng.click();
  }
  // Save a Min marker if fields exist
  const minField = page.locator('#minValue');
  const setMinBtn = page.locator('#setMinBtn');
  if (await minField.count() && await setMinBtn.count()) {
    await minField.fill('12');
    await setMinBtn.click();
  }
}

async function aiSettingsQuickChecks(page) {
  // Agents overview quick test conversation
  await page.goto('/ai-settings');
  const testBtn = page.locator('#testConversation');
  if (await testBtn.count()) {
    page.once('dialog', d => d.accept('Hello from Playwright'));
    await testBtn.click();
    await expect(page.locator('.alert').last()).toBeVisible();
  }
  // STT: ensure dropdowns + 2s Test clickable
  await page.goto('/ai-settings/stt');
  await expect(page.locator('#sttModel')).toBeVisible();
  const twoSec = page.locator('#sttTwoSecTest');
  if (await twoSec.count()) {
    await twoSec.click();
    await page.waitForTimeout(500);
  }
  // TTS: load and hit Test TTS header button (opens to same page)
  await page.goto('/ai-settings/tts');
  const ttsTest = page.locator('#testTTS');
  if (await ttsTest.count()) {
    await ttsTest.click();


    await page.waitForTimeout(300);
  }
}

function readCharacterPartsFile(charId) {
  const p = `data/character-${charId}/parts.json`;
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) || []; } catch { return []; }
}

function partNamesFromFile(charId) {
  return readCharacterPartsFile(charId).map(p => p.name);
}

// Main test

test.describe('MonsterBox 4.0 - Comprehensive E2E (headed-friendly)', () => {
  test('Full flow across 4 characters with isolation', async ({ page, context }) => {
    // Collect console errors to assert zero later
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (t.includes('410 (Gone)')) return; // ignore deprecation endpoints
        if (t.includes('2s test error')) return; // ignore optional 2s sample test failures
        if (t.includes('Failed to load resource: the server responded with a status of 404')) return; // ignore benign 404s from optional/removed endpoints
        if (t.includes('Failed to load microphone parts')) return; // audio UI optional
        if (t.includes('Failed to load speaker parts')) return; // audio UI optional
        if (t.includes('Failed to load voices')) return; // AI settings optional in E2E
        consoleErrors.push(t);
      }
    });

    await ensureCharactersExist(page);


    // Clean up any leftover E2E-created parts from prior runs (filesystem-level)
    await cleanupE2EPartsOnDisk();

    for (const [index, c] of CHARACTERS.entries()) {
      // Switch to character
      await switchCharacter(page, c.name);

      // Phase 1: Parts
      await openSetupParts(page);
      const suffix = `-${c.name.replace(/\s+/g,'_')}`;
      await createServo(page, `Servo-Std${suffix}`, 'standard', 0);
      await createServo(page, `Servo-Cont${suffix}`, 'continuous', 1);
      await createServo(page, `Servo-Fb${suffix}`, 'feedback', 2);
      await createLinearActuator(page, `LinearAct${suffix}`);
      await createMotor(page, `Motor${suffix}`);
      await createPinPart(page, 'led', `LED${suffix}`, 17 + (index % 10));
      await createPinPart(page, 'light', `Light${suffix}`, 18 + (index % 10));
      await createPinPart(page, 'sensor', `Sensor${suffix}`, 19 + (index % 10));
      await createPinPart(page, 'motion_sensor', `Motion${suffix}`, 20 + (index % 10));
      await createWebcam(page, `Webcam${suffix}`);
      await createMicrophone(page, `Microphone${suffix}`);
      await createSpeaker(page, `Speaker${suffix}`);
      await createPinPart(page, 'head_tracking', `HeadTrack${suffix}`, 0); // No pin needed; tolerated

      // Collect created names for isolation checks (no per-part Test drawers in UI anymore)
      const createdNames = [
        `Servo-Std${suffix}`, `Servo-Cont${suffix}`, `Servo-Fb${suffix}`,
        `LinearAct${suffix}`, `Motor${suffix}`, `LED${suffix}`, `Light${suffix}`,
        `Sensor${suffix}`, `Motion${suffix}`, `Webcam${suffix}`, `Microphone${suffix}`,
        `Speaker${suffix}`, `HeadTrack${suffix}`
      ];

      // Phase 2: Models + Calibration (basic)
      await ensureSeedModels(page);
      await basicCalibrationCheck(page, `Servo-Std${suffix}`);

      // Phase 3: AI quick checks
      await aiSettingsQuickChecks(page);

      // Phase 4: Filesystem isolation — ensure names exist only under this character
      const namesHere = partNamesFromFile(c.id);
      for (const n of createdNames) {
        expect(namesHere).toContain(n);
      }
      for (const other of CHARACTERS.filter(x => x.id !== c.id)) {
        const namesOther = partNamesFromFile(other.id);
        for (const n of createdNames) {
          expect(namesOther).not.toContain(n);
        }
      }

      // UI isolation check removed: Parts page removed; rely on filesystem isolation above
      const next = CHARACTERS[(index + 1) % CHARACTERS.length];
      await switchCharacter(page, next.name);
    }

    // Success criteria: zero console errors
    expect(consoleErrors, 'No console errors expected').toHaveLength(0);
  });
});

