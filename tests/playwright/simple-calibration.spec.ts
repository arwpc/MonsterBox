// @calibration
import { expect, test } from '@playwright/test';

async function selectByName(page, name: string) {
  await page.goto('/setup/calibration');
  const list = page.locator('#deviceList');
  await expect(list).toContainText(name, { timeout: 15000 });
  const item = page.locator('.list-group-item').filter({ hasText: name }).first();
  await item.click();
  await expect(page.locator('#devMeta')).toContainText(/ID:/);
}

async function getSelectedPartId(page) {
  return await page.evaluate(() => (window as any).selectedPartId);
}

async function getFirstPartNameByType(request, type: string): Promise<string | null> {
  const res = await request.get('/setup/calibration/api/parts');
  if (!res.ok()) return null;
  const j = await res.json();
  const p = (j.parts || []).find((x: any) => x.type === type);
  return p ? p.name : null;
}

async function getFirstPartIdByTypes(request, types: string[]): Promise<string | null> {
  const res = await request.get('/setup/calibration/api/parts');
  if (!res.ok()) return null;
  const j = await res.json();
  const p = (j.parts || []).find((x: any) => types.includes(x.type));
  return p ? String(p.id) : null;
}

test.describe('Simple Calibration (Unified)', () => {
  test('Servo: set safe min/max and create named point (API)', async ({ request }) => {
    const res = await request.get('/setup/calibration/api/parts');
    if (!res.ok()) test.skip(true, 'parts API not available');
    const j = await res.json();
    const servo = (j.parts || []).find((x: any) => x.type === 'servo');
    if (!servo) test.skip(true, 'No servo part available');
    const pid = String(servo.id);

    // Set min/max
    let r = await request.post(`/setup/calibration/api/simple/${pid}/set-safe`, { data: { which: 'min', value: 40 } });
    expect(r.ok()).toBeTruthy();
    r = await request.post(`/setup/calibration/api/simple/${pid}/set-safe`, { data: { which: 'max', value: 140 } });
    expect(r.ok()).toBeTruthy();

    // Add named point
    const make = await request.post(`/setup/calibration/api/simple/${pid}/points`, { data: { name: 'Hand Up', value: 120 } });
    expect(make.ok()).toBeTruthy();

    // Verify
    const g = await request.get(`/setup/calibration/api/simple/${pid}`);
    expect(g.ok()).toBeTruthy();
    const v = await g.json();
    expect(v.success).toBeTruthy();
    expect(v.calibration.safeMin).toBe(40);
    expect(v.calibration.safeMax).toBe(140);
    expect((v.calibration.points || []).some((p: any) => p.name === 'Hand Up' && p.value === 120)).toBeTruthy();
  });

  test('Motor: save simple min/max via API', async ({ page, request }) => {
    const pid = await getFirstPartIdByTypes(request, ['motor', 'linear_actuator', 'servo']);
    if (!pid) test.skip(true, 'No suitable part found');

    let r = await request.post(`/setup/calibration/api/simple/${pid}/set-safe`, { data: { which: 'min', value: 200 } });
    expect(r.ok()).toBeTruthy();
    r = await request.post(`/setup/calibration/api/simple/${pid}/set-safe`, { data: { which: 'max', value: 1200 } });
    expect(r.ok()).toBeTruthy();

    const g = await request.get(`/setup/calibration/api/simple/${pid}`);
    const j = await g.json();
    expect(j.success).toBeTruthy();
    expect(j.calibration.safeMin).toBe(200);
    expect(j.calibration.safeMax).toBe(1200);
  });
});

