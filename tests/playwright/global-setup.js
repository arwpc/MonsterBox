/* Playwright global setup: ensure no stale dev server is running before starting webServer. */

export default async function globalSetup() {
  const shouldClean = process.env.PW_CLEAN_SERVER === '1' || process.env.CI === 'true';
  if (!shouldClean) return; // do nothing locally unless explicitly requested

  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
  const killURL = baseURL.replace(/\/$/, '') + '/__kill';

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 700);
    const res = await fetch(baseURL, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    if (res && res.status) {
      // Server responded; try to terminate it cleanly
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 1000);
        await fetch(killURL, { signal: ctrl2.signal }).catch(() => null);
        clearTimeout(t2);
        // Wait until server is actually down (poll for up to 3s)
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const ok = await fetch(baseURL, { method: 'GET' }).then(() => true).catch(() => false);
          if (!ok) break;
          await new Promise(r => setTimeout(r, 150));
        }
        // small settle delay
        await new Promise(r => setTimeout(r, 400));
      } catch (_) {}
    }
  } catch (_) {
    // baseURL not reachable; nothing to kill
  }
}

