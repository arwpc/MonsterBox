/**
 * Node Discovery Service — zero-config animatronic discovery over mDNS/Bonjour.
 *
 * Replaces the hand-typed `ip` in config/animatronics.json with runtime discovery:
 * each node advertises `_monsterbox._tcp` via the system avahi daemon, and every
 * peer browses for it and keeps a live in-memory registry (mirroring the Goblin
 * heartbeat registry). See docs/development/NODE-DISCOVERY.md.
 *
 * No new npm dependency: avahi (already on Raspberry Pi OS) is driven through
 * child_process, the same idiom the project uses for the Python hardware wrappers.
 * mDNS is discovery only — the control path stays HTTPS. When avahi is absent
 * (dev container, non-RPi host, mDNS-blocked network) the service degrades
 * silently and orchestration falls back to the static config, so the feature is
 * strictly non-regressive.
 */

import { exec as _exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const SERVICE_TYPE = '_monsterbox._tcp';
const DEFAULT_SERVICE_FILE = '/etc/avahi/services/monsterbox.service';
const DEFAULT_BROWSE_INTERVAL_MS = 30 * 1000;
const DEFAULT_STALE_AFTER_MS = 90 * 1000; // 3 missed browse cycles → offline

/**
 * Hash a shared secret to a short, non-reversible token for the TXT record.
 * @param {string} secret
 * @returns {string}
 */
export function tokenHash(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 16);
}

/**
 * Parse `avahi-browse -rpt _monsterbox._tcp` output into node records.
 * Resolved lines start with `=` and are `;`-separated:
 *   =;iface;proto;name;type;domain;hostname;address;port;"k=v" "k=v" …
 * Pure function — the heart of the unit tests.
 * @param {string} output
 * @returns {Array<object>}
 */
export function parseAvahiBrowse(output) {
  const nodes = [];
  for (const line of String(output || '').split('\n')) {
    if (!line.startsWith('=')) continue; // only fully-resolved records
    const parts = line.split(';');
    if (parts.length < 9) continue;
    const proto = parts[2];
    if (proto !== 'IPv4') continue; // one address family is enough; avoids dupes
    const rawName = parts[3] || '';
    const hostname = parts[6] || '';
    const address = parts[7] || '';
    const port = parseInt(parts[8], 10) || 0;
    const txtRaw = parts.slice(9).join(';');

    // TXT records are space-separated, each quoted: "id=<n>" "character=<name>"
    const txt = {};
    const re = /"([^"]*)"/g;
    let m;
    while ((m = re.exec(txtRaw)) !== null) {
      const eq = m[1].indexOf('=');
      if (eq > 0) txt[m[1].slice(0, eq)] = m[1].slice(eq + 1);
    }

    if (!address) continue;
    const id = txt.id !== undefined ? String(txt.id) : (hostname || rawName);
    nodes.push({
      id,
      name: txt.character || rawName.replace(/\\032/g, ' '),
      character: txt.character || null,
      ip: address,
      port,
      hostname,
      version: txt.ver || null,
      token: txt.token || null,
    });
  }
  return nodes;
}

export class NodeDiscoveryService {
  /**
   * @param {object} [opts]
   * @param {(cmd:string)=>Promise<{stdout:string,stderr:string}>} [opts.exec]
   * @param {string} [opts.serviceFile] - avahi service-file path (override for tests)
   * @param {number} [opts.browseIntervalMs]
   * @param {number} [opts.staleAfterMs]
   * @param {string} [opts.nodeToken] - shared secret; when set, only matching peers are trusted
   * @param {()=>number} [opts.now] - clock injection for tests
   */
  constructor(opts = {}) {
    this.exec = opts.exec || promisify(_exec);
    this.serviceFile = opts.serviceFile || DEFAULT_SERVICE_FILE;
    this.browseIntervalMs = opts.browseIntervalMs || DEFAULT_BROWSE_INTERVAL_MS;
    this.staleAfterMs = opts.staleAfterMs || DEFAULT_STALE_AFTER_MS;
    this.nodeToken = opts.nodeToken || process.env.MB_NODE_TOKEN || null;
    this.now = opts.now || (() => Date.now());

    this.discovered = new Map(); // id -> record
    this.manual = new Map();     // id -> record (operator-pinned fallback)
    this.avahiAvailable = null;  // null = unknown, true/false after first probe
    this._timer = null;
  }

  /** Whether a discovered node's advertised token is trusted by this node. */
  isTrusted(node) {
    if (!this.nodeToken) return true; // enforcement off → everyone trusted
    return node.token === tokenHash(this.nodeToken);
  }

  /**
   * Write the avahi service file so this node advertises itself. Idempotent.
   * Fails soft (returns false) when the path isn't writable — normal off-RPi.
   * @param {{id:(string|number), character:string, port:number, version:string}} self
   * @returns {Promise<boolean>}
   */
  async advertiseSelf(self) {
    const txt = [
      `id=${self.id}`,
      `character=${escapeXml(self.character || '')}`,
      `ver=${self.version || ''}`,
    ];
    if (this.nodeToken) txt.push(`token=${tokenHash(this.nodeToken)}`);
    const xml = [
      `<?xml version="1.0" standalone='no'?>`,
      `<!DOCTYPE service-group SYSTEM "avahi-service.dtd">`,
      `<service-group>`,
      `  <name replace-wildcards="yes">MonsterBox %h</name>`,
      `  <service>`,
      `    <type>${SERVICE_TYPE}</type>`,
      `    <port>${parseInt(self.port, 10) || 3000}</port>`,
      ...txt.map((t) => `    <txt-record>${t}</txt-record>`),
      `  </service>`,
      `</service-group>`,
      ``,
    ].join('\n');
    try {
      await fs.mkdir(path.dirname(this.serviceFile), { recursive: true });
      await fs.writeFile(this.serviceFile, xml, 'utf8');
      console.log(`📡 Advertising this node as ${SERVICE_TYPE} (${self.character || self.id})`);
      return true;
    } catch (err) {
      // Not root / not on an RPi with avahi — advertisement is optional.
      console.warn(`⚠️  Could not write avahi service file (${this.serviceFile}): ${err.message}`);
      return false;
    }
  }

  /** Run one browse cycle and refresh the live registry. */
  async browse() {
    let stdout;
    try {
      ({ stdout } = await this.exec(`avahi-browse -rpt ${SERVICE_TYPE}`));
      this.avahiAvailable = true;
    } catch (err) {
      if (this.avahiAvailable !== false) {
        console.warn(`⚠️  Node discovery unavailable (avahi-browse failed: ${err.message.split('\n')[0]}). Falling back to config/animatronics.json.`);
      }
      this.avahiAvailable = false;
      return [];
    }

    const seen = parseAvahiBrowse(stdout);
    const ts = new Date(this.now()).toISOString();
    for (const node of seen) {
      const prev = this.discovered.get(node.id) || {};
      this.discovered.set(node.id, {
        ...prev,
        ...node,
        status: 'online',
        source: 'discovered',
        trusted: this.isTrusted(node),
        lastSeen: ts,
      });
    }
    this._expireStale();
    return seen;
  }

  /** Mark nodes not seen within staleAfterMs as offline (don't delete — keep last-known). */
  _expireStale() {
    const cutoff = this.now() - this.staleAfterMs;
    for (const node of this.discovered.values()) {
      if (node.lastSeen && new Date(node.lastSeen).getTime() < cutoff) {
        node.status = 'offline';
      }
    }
  }

  /** Add or update an operator-pinned node (manual fallback for mDNS-blocked networks). */
  addManual(entry) {
    if (!entry || entry.id == null || !entry.ip) {
      return { success: false, error: 'id and ip are required' };
    }
    const id = String(entry.id);
    this.manual.set(id, {
      id,
      name: entry.name || id,
      character: entry.character || entry.name || null,
      ip: entry.ip,
      port: parseInt(entry.port, 10) || 3000,
      characterId: entry.characterId != null ? entry.characterId : undefined,
      status: 'unknown',
      source: 'manual',
      trusted: true,
      lastSeen: null,
    });
    return { success: true, id };
  }

  /** Remove an operator-pinned node. */
  removeManual(id) {
    return { success: this.manual.delete(String(id)) };
  }

  /**
   * Merge discovery + manual over the static config list. Each config entry's `ip`
   * is replaced by the discovered live IP when that node is online; otherwise the
   * config `ip` is kept as a fallback. Discovered/manual nodes not in the config
   * are appended. When nothing is discovered, the config list is returned
   * unchanged (fully non-regressive).
   * @param {Array<object>} configAnimatronics
   * @returns {Array<object>}
   */
  overlay(configAnimatronics = []) {
    const byId = new Map();

    // 1. Start from static config (the fallback / identity source).
    for (const cfg of configAnimatronics) {
      byId.set(String(cfg.id), { ...cfg, source: 'config', discovered: false, status: 'unknown' });
    }

    // 2. Overlay live discovery: replace ip/hostname, mark online.
    for (const node of this.discovered.values()) {
      const key = String(node.id);
      const base = byId.get(key);
      if (base) {
        byId.set(key, {
          ...base,
          ip: node.status === 'online' ? node.ip : base.ip,
          hostname: node.hostname || base.hostname,
          version: node.version || base.version,
          status: node.status,
          discovered: true,
          trusted: node.trusted,
          lastSeen: node.lastSeen,
        });
      } else {
        // Fully dynamic node with no config entry.
        byId.set(key, { ...node, discovered: true });
      }
    }

    // 3. Manual pins (win over config ip, but not over a live discovery).
    for (const node of this.manual.values()) {
      const key = String(node.id);
      const base = byId.get(key);
      if (base && base.status === 'online') continue; // live discovery already better
      byId.set(key, { ...(base || {}), ...node });
    }

    return Array.from(byId.values());
  }

  /** Start the periodic browse loop. No-op-safe to call once at startup. */
  start(self = null) {
    if (self) this.advertiseSelf(self).catch(() => {});
    if (this._timer) return;
    // Kick an immediate browse, then interval.
    this.browse().catch(() => {});
    this._timer = setInterval(() => this.browse().catch(() => {}), this.browseIntervalMs);
    if (this._timer.unref) this._timer.unref(); // don't keep the process alive
    console.log('📡 Node discovery started (browsing ' + SERVICE_TYPE + ')');
  }

  /** Stop the browse loop (used in tests / graceful shutdown). */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

// Default singleton for app use (does NOT auto-start; server.js calls start()).
const nodeDiscoveryService = new NodeDiscoveryService();
export default nodeDiscoveryService;
