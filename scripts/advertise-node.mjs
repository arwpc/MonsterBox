#!/usr/bin/env node
/**
 * Advertise this MonsterBox node on the LAN via mDNS (_monsterbox._tcp).
 *
 * Writes /etc/avahi/services/monsterbox.service using the node's selected
 * character and port, so peers can discover it with no hand-typed IPs. The
 * running server also advertises on startup — this script is for install/setup
 * time and for re-advertising after a node is renamed.
 *
 *   sudo npm run advertise-node          # writes the system avahi service file
 *   MB_SERVICE_FILE=/tmp/x.service node scripts/advertise-node.mjs   # dry location
 *
 * See docs/development/NODE-DISCOVERY.md.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NodeDiscoveryService } from '../services/nodeDiscoveryService.js';
import { readConfig } from '../services/configService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

async function main() {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const cfg = await readConfig();
  const id = cfg && cfg.selectedCharacter;

  // Best-effort friendly name from config/animatronics.json (identity source).
  let character = '';
  try {
    const anim = JSON.parse(readFileSync(path.join(repoRoot, 'config', 'animatronics.json'), 'utf8'));
    const match = (anim.animatronics || []).find((a) => String(a.id) === String(id));
    character = (match && match.name) || '';
  } catch (_) { /* name is cosmetic */ }

  const svc = new NodeDiscoveryService({ serviceFile: process.env.MB_SERVICE_FILE || undefined });
  const ok = await svc.advertiseSelf({
    id: id != null ? id : 'unknown',
    character,
    port: (cfg && cfg.port) || 3000,
    version: pkg.version,
  });

  if (ok) {
    console.log(`✅ Advertised ${character || id} on _monsterbox._tcp (${svc.serviceFile}).`);
    console.log('   Peers running MonsterBox 8.4.0+ will discover this node automatically.');
  } else {
    console.log('⚠️  Could not write the avahi service file (need sudo, and avahi-daemon installed).');
    console.log('   The node still works; orchestration will fall back to config/animatronics.json.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('advertise-node failed:', err.message);
  process.exitCode = 1;
});
