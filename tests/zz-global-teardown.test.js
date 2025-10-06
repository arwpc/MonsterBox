import axios from 'axios';

const BASE = 'http://127.0.0.1:3100';

async function safeDeletePart(id) {
  try { await axios.delete(`${BASE}/setup/parts/api/parts/${id}`); } catch (_) { }
}

async function cleanupTestParts() {
  try {
    const { data } = await axios.get(`${BASE}/setup/parts/api/parts`);
    const parts = (data && data.parts) || [];
    const RX = /^(T\s|Test\b|UI\s|PW\s|E2E\s|PW Servo Model\b)/i;
    const toDelete = parts.filter(p => p && typeof p.name === 'string' && RX.test(p.name));
    for (const p of toDelete) {
      // Best-effort reset calibrations via controller hook in delete
      await safeDeletePart(p.id);
    }
  } catch (_) { /* ignore */ }
}

async function cleanupTestModels() {
  const types = ['servo', 'linear_actuator', 'motor', 'led', 'light', 'sensor', 'motion_sensor', 'microphone', 'speaker', 'webcam', 'head_tracking'];
  const RX = /^(Test|UI\s|PW\s|PW Servo Model\b)/i;
  for (const t of types) {
    try {
      const { data } = await axios.get(`${BASE}/setup/models/api/${t}`);
      const arr = (data && (data.models || data)) || [];
      for (const m of arr) {
        if (m && typeof m.name === 'string' && RX.test(m.name)) {
          try { await axios.delete(`${BASE}/setup/models/api/${t}/${m.id}`); } catch (_) { }
        }
      }
    } catch (_) { /* ignore */ }
  }
}

// Root-level hook that runs after all tests
after(async () => {
  // Clean artifacts left by any tests that failed before their own cleanup
  await cleanupTestParts();
  await cleanupTestModels();

  if (process.env.KILL_SERVER_AFTER_TESTS === '1') {
    try { await axios.get(`${BASE}/__kill`); } catch (_) { }
  }
});

