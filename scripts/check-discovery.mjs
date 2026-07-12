#!/usr/bin/env node
/**
 * Fleet discovery matrix — query /api/orchestration/nodes on every node and show
 * who sees whom. The fast way to spot a node that's up but NOT being discovered
 * (mDNS asymmetry, multicast blocking). No dependencies; reads the roster from
 * config/animatronics.json (character-independent).
 *
 *   npm run check:discovery
 *   PORT=3000 SCHEME=https TIMEOUT=5000 node scripts/check-discovery.mjs
 *
 * See docs/setup/NODE-DISCOVERY-VALIDATION.md.
 */
import https from 'https';
import http from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = parseInt(process.env.PORT || '3000', 10);
const SCHEME = process.env.SCHEME || 'https';
const TIMEOUT = parseInt(process.env.TIMEOUT || '5000', 10);

/** GET /api/orchestration/nodes from one node; resolves null if unreachable. */
function fetchNodes(ip) {
  return new Promise((resolve) => {
    const lib = SCHEME === 'https' ? https : http;
    const req = lib.get(
      { host: ip, port: PORT, path: '/api/orchestration/nodes', rejectUnauthorized: false, timeout: TIMEOUT },
      (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  const anim = JSON.parse(readFileSync(path.join(repoRoot, 'config', 'animatronics.json'), 'utf8'));
  const roster = (anim.animatronics || [])
    .filter((n) => n.id != null && n.ip)
    .map((n) => ({ id: String(n.id), name: n.name || `node-${n.id}`, ip: n.ip }));
  if (!roster.length) { console.error('No nodes with an ip in config/animatronics.json'); process.exit(1); }

  console.log(`\nQuerying ${roster.length} node(s) on ${SCHEME}://<ip>:${PORT}/api/orchestration/nodes …`);

  // Query every observer in parallel.
  const views = await Promise.all(roster.map(async (o) => {
    const j = await fetchNodes(o.ip);
    return {
      id: o.id,
      reachable: !!j,
      avahi: j ? j.avahiAvailable : null,
      onlineIds: j && Array.isArray(j.nodes)
        ? new Set(j.nodes.filter((n) => n.status === 'online').map((n) => String(n.id)))
        : new Set(),
    };
  }));
  const viewById = new Map(views.map((v) => [v.id, v]));

  // Matrix: rows = observer, columns = target.
  const nameW = Math.max(12, ...roster.map((r) => `${r.name}(${r.id})`.length)) + 2;
  const colW = Math.max(5, ...roster.map((r) => r.id.length + 2));
  const pad = (s, w) => String(s).padEnd(w);

  console.log('\n  Discovery matrix — a row shows which columns that node currently sees ONLINE');
  console.log('  ✓ sees online   · not discovered   — self   ? observer unreachable\n');
  let header = pad('observer \\ target', nameW);
  for (const t of roster) header += pad(t.id, colW);
  console.log('  ' + header);

  for (const o of roster) {
    const v = viewById.get(o.id);
    let row = pad(`${o.name}(${o.id})`, nameW);
    for (const t of roster) {
      let mark;
      if (o.id === t.id) mark = '—';
      else if (!v.reachable) mark = '?';
      else mark = v.onlineIds.has(t.id) ? '✓' : '·';
      row += pad(mark, colW);
    }
    console.log('  ' + row);
  }

  // Diagnostics.
  console.log('');
  const nameOf = (id) => (roster.find((r) => r.id === id) || {}).name || id;
  const down = views.filter((v) => !v.reachable).map((v) => nameOf(v.id));
  const noAvahi = views.filter((v) => v.reachable && v.avahi === false).map((v) => nameOf(v.id));
  // Reachable node that no OTHER reachable peer sees online → classic multicast block.
  const invisible = roster.filter((t) => {
    if (!viewById.get(t.id).reachable) return false;
    return views.every((v) => v.id === t.id || !v.reachable || !v.onlineIds.has(t.id));
  }).map((t) => t.name);

  if (down.length) console.log(`  ⚠ Unreachable (API down or wrong IP): ${down.join(', ')}`);
  if (noAvahi.length) console.log(`  ⚠ avahi not running (no discovery on that node): ${noAvahi.join(', ')}`);
  if (invisible.length) console.log(`  ⚠ Up but discovered by NO peer (likely multicast-blocked / different subnet): ${invisible.join(', ')}`);
  if (!down.length && !noAvahi.length && !invisible.length) {
    console.log('  ✓ Every node is reachable and discovered by its peers.');
  } else {
    console.log('  → Fixes: docs/setup/NODE-DISCOVERY-VALIDATION.md (manual pin, avahi, subnet).');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
