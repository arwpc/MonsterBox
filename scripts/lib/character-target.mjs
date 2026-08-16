/**
 * Character / node resolution for standalone scripts and diagnostic harnesses.
 *
 * Scripts have no Express `req`, so `resolveCharacter(req)` is unavailable to them.
 * They resolve a target the same way the fleet does, in this precedence order:
 *
 *   1. explicit override — `--character <id|name>` / `--host <addr>` argv, or the
 *      MB_CHARACTER_ID / MB_TARGET_HOST / BASE_URL environment variables
 *   2. this node's own hostname matched against config/animatronics.json
 *   3. the character selected in config/app-config.json
 *   4. the first character in data/characters.json
 *
 * WHY a helper rather than a literal per script: every hardcoded IP and char_id in
 * scripts/ was a copy of the same four lines. Centralizing it means a script written
 * on one node runs unchanged on any other, and the fleet address book has exactly
 * one source of truth (config/animatronics.json).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function readJson(relPath, fallback) {
    try {
        const raw = await fs.readFile(path.join(REPO_ROOT, relPath), 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

/** Fleet address book — the only place node IPs are allowed to live. */
export async function loadAnimatronics() {
    const cfg = await readJson('config/animatronics.json', {});
    return Array.isArray(cfg.animatronics) ? cfg.animatronics : [];
}

/** Character registry. */
export async function loadCharacters() {
    const chars = await readJson('data/characters.json', []);
    return Array.isArray(chars) ? chars : [];
}

/** Parts for one character. */
export async function loadParts(characterId) {
    const parts = await readJson(`data/character-${characterId}/parts.json`, []);
    return Array.isArray(parts) ? parts : [];
}

/** The character id persisted in config/app-config.json, or null. */
export async function loadSelectedCharacterId() {
    const cfg = await readJson('config/app-config.json', null);
    const id = cfg && cfg.selectedCharacter;
    return id === undefined || id === null ? null : id;
}

function argValue(argv, flag) {
    const idx = argv.indexOf(flag);
    if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
    const prefixed = argv.find((a) => a.startsWith(`${flag}=`));
    return prefixed ? prefixed.slice(flag.length + 1) : null;
}

function matchAnimatronic(nodes, needle) {
    if (needle === null || needle === undefined || needle === '') return null;
    const wanted = String(needle).trim().toLowerCase();
    return nodes.find((n) => (
        String(n.characterId) === wanted
        || String(n.id) === wanted
        || String(n.name || '').toLowerCase() === wanted
        || String(n.hostname || '').toLowerCase() === wanted
    )) || null;
}

/**
 * Resolve which character this script should act on.
 *
 * @param {string[]} argv - normally process.argv.slice(2)
 * @returns {Promise<{characterId: (number|string), name: string, source: string}>}
 */
export async function resolveCharacterTarget(argv = process.argv.slice(2)) {
    const nodes = await loadAnimatronics();
    const characters = await loadCharacters();

    const nameFor = (id) => {
        const c = characters.find((ch) => String(ch.id) === String(id));
        if (c) return c.name;
        const n = nodes.find((node) => String(node.characterId) === String(id));
        return n ? n.name : `character-${id}`;
    };

    const override = argValue(argv, '--character') || process.env.MB_CHARACTER_ID || null;
    if (override) {
        const node = matchAnimatronic(nodes, override);
        const byName = characters.find((c) => String(c.name).toLowerCase() === String(override).toLowerCase());
        const id = node ? node.characterId : (byName ? byName.id : override);
        return { characterId: id, name: nameFor(id), source: 'override' };
    }

    const selfNode = matchAnimatronic(nodes, os.hostname().split('.')[0]);
    if (selfNode) {
        return { characterId: selfNode.characterId, name: nameFor(selfNode.characterId), source: 'hostname' };
    }

    const selected = await loadSelectedCharacterId();
    if (selected !== null) {
        return { characterId: selected, name: nameFor(selected), source: 'app-config' };
    }

    if (characters.length > 0) {
        return { characterId: characters[0].id, name: characters[0].name, source: 'registry-first' };
    }

    throw new Error('No character could be resolved: config/animatronics.json and data/characters.json are both empty.');
}

/**
 * Local loopback base URL.
 *
 * WHY 3100 and not 3000: port 3000 serves HTTPS only, with a self-signed cert, so
 * plain `http://localhost:3000` connects to nothing (the hardcoded
 * `http://<node-ip>:3000` these scripts used to carry was already dead for the same
 * reason). Port 3100 is the same Express app on an always-on loopback HTTP
 * listener, so an on-node diagnostic reaches the real services without TLS setup.
 */
export const LOCAL_BASE_URL = 'http://localhost:3100';

/**
 * Resolve the base URL of the node to drive.
 *
 * Defaults to this node over loopback — a script run on an animatronic should talk
 * to itself, not reach across the network at a name it was written against. Remote
 * nodes are addressed over https, matching the inter-node rule in
 * services/orchestrationService.js (fleet nodes are HTTPS-only on :3000).
 *
 * @param {string[]} argv
 * @param {{characterId?: (number|string), protocol?: string}} [opts]
 */
export async function resolveBaseUrl(argv = process.argv.slice(2), opts = {}) {
    const explicit = argValue(argv, '--base-url') || process.env.BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');

    const protocol = opts.protocol || 'https';
    const hostOverride = argValue(argv, '--host') || process.env.MB_TARGET_HOST;
    const nodes = await loadAnimatronics();

    if (hostOverride) {
        const node = matchAnimatronic(nodes, hostOverride);
        if (node && isSelf(node)) return LOCAL_BASE_URL;
        const host = node && node.ip ? node.ip : hostOverride;
        const port = node && node.port ? node.port : 3000;
        return `${protocol}://${host}:${port}`;
    }

    // A named character target implies that node's address from the address book.
    if (opts.characterId !== undefined && opts.characterId !== null) {
        const node = matchAnimatronic(nodes, opts.characterId);
        if (node && node.ip && !isSelf(node)) {
            return `${protocol}://${node.ip}:${node.port || 3000}`;
        }
    }

    return LOCAL_BASE_URL;
}

function isSelf(node) {
    const host = os.hostname().split('.')[0].toLowerCase();
    return String(node.hostname || '').toLowerCase() === host;
}

export default {
    REPO_ROOT,
    loadAnimatronics,
    loadCharacters,
    loadParts,
    loadSelectedCharacterId,
    resolveCharacterTarget,
    resolveBaseUrl
};
