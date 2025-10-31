#!/usr/bin/env node
// Find a PCA9685-backed servo channel from current character parts or global parts
// Outputs shell exports for easy sourcing, e.g. TEST_SERVO_CHANNEL=4\nTEST_PCA_ADDRESS=64

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readJSONSafe(file) {
  try { const raw = await fs.readFile(file, 'utf8'); return JSON.parse(raw); } catch { return null; }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  // config/app-config.json → selectedCharacter
  const cfg = await readJSONSafe(path.join(root, 'config', 'app-config.json'));
  const dataDir = path.join(root, 'data');

  let parts = null;
  // Character-specific parts first
  if (cfg && cfg.selectedCharacter) {
    parts = await readJSONSafe(path.join(dataDir, `character-${cfg.selectedCharacter}`, 'parts.json'));
  }
  // Fallback to global
  if (!Array.isArray(parts)) {
    parts = await readJSONSafe(path.join(dataDir, 'parts.json'));
  }

  let channel = null;
  let address = null; // integer like 64 for 0x40

  if (Array.isArray(parts)) {
    // Prefer servos explicitly using PCA9685 with a numeric channel
    const candidates = parts.filter(p => String(p.type).toLowerCase() === 'servo');
    for (const p of candidates) {
      const ctl = p.controllerType || (p.config && p.config.controllerType);
      const usePCA = p.usePCA9685 === true || String(ctl).toLowerCase() === 'pca9685';
      const ch = (p.channel != null) ? p.channel : (p.config && p.config.channel);
      if (usePCA && typeof ch === 'number' && Number.isFinite(ch)) {
        channel = ch;
        const addrRaw = (p.pca9685Settings && p.pca9685Settings.address) || (p.config && p.config.address);
        if (addrRaw != null) {
          if (typeof addrRaw === 'string' && addrRaw.startsWith('0x')) address = parseInt(addrRaw, 16);
          else if (typeof addrRaw === 'number') address = addrRaw;
        }
        break;
      }
    }
  }

  if (channel == null) channel = 0; // safe default

  process.stdout.write(`TEST_SERVO_CHANNEL=${channel}\n`);
  if (address != null) process.stdout.write(`TEST_PCA_ADDRESS=${address}\n`);
}

main().catch(() => { process.stdout.write('TEST_SERVO_CHANNEL=0\n'); });
