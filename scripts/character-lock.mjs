#!/usr/bin/env node
/**
 * Character configuration lock CLI.
 *
 * A character that is "done" (tuned, calibrated, and running the way the
 * operator wants) gets frozen: every configuration write under
 * data/character-<id>/ is refused until someone deliberately unlocks it here.
 * The lock also records a sha256 fingerprint per config file, so drift on THIS
 * node can be detected later (`verify`) even if something wrote around the app.
 *
 * Usage:
 *   node scripts/character-lock.mjs status
 *   node scripts/character-lock.mjs lock <characterId> [--reason "..."] [--by "..."]
 *   node scripts/character-lock.mjs unlock <characterId>
 *   node scripts/character-lock.mjs verify [characterId]
 *   node scripts/character-lock.mjs refresh <characterId>   # re-fingerprint an existing lock
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCKS_PATH = path.join(APP_ROOT, 'config', 'character-locks.json');
const DATA_ROOT = path.join(APP_ROOT, 'data');

const { isRuntimeStatePath } = await import('../services/characterConfigLock.js');

async function readLocks() {
    try {
        const parsed = JSON.parse(await fs.readFile(LOCKS_PATH, 'utf8'));
        return Array.isArray(parsed.locks) ? parsed : { locks: [] };
    } catch (_) {
        return { locks: [] };
    }
}

async function writeLocks(doc) {
    await fs.mkdir(path.dirname(LOCKS_PATH), { recursive: true });
    await fs.writeFile(LOCKS_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

async function characterName(id) {
    try {
        const chars = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'characters.json'), 'utf8'));
        const hit = chars.find(c => String(c.id) === String(id));
        return hit ? hit.name : null;
    } catch (_) {
        return null;
    }
}

/** Every configuration file under a character dir, relative-path → sha256. */
async function fingerprint(characterId) {
    const root = path.join(DATA_ROOT, `character-${characterId}`);
    const out = {};
    async function walk(dir) {
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (_) {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.thumbs') continue; // derived cache, not config
                await walk(full);
                continue;
            }
            if (!entry.isFile()) continue;
            if (isRuntimeStatePath(full)) continue;
            const buf = await fs.readFile(full);
            out[path.relative(root, full).split(path.sep).join('/')] =
                crypto.createHash('sha256').update(buf).digest('hex');
        }
    }
    await walk(root);
    return out;
}

function arg(flag) {
    const i = process.argv.indexOf(flag);
    return i > -1 ? process.argv[i + 1] : null;
}

const command = process.argv[2] || 'status';
const targetId = process.argv[3];
const doc = await readLocks();

if (command === 'status') {
    if (!doc.locks.length) {
        console.log('No characters are locked.');
    } else {
        for (const lock of doc.locks) {
            console.log(
                `🔒 ${lock.name || 'character'} (id ${lock.characterId}) — locked ${lock.lockedAt} by ${lock.lockedBy || 'operator'}\n` +
                `   ${lock.reason || ''}\n` +
                `   ${Object.keys(lock.fingerprints || {}).length} config files fingerprinted`
            );
        }
    }
} else if (command === 'lock' || command === 'refresh') {
    if (!targetId) throw new Error('usage: character-lock.mjs ' + command + ' <characterId>');
    const existing = doc.locks.find(l => String(l.characterId) === String(targetId));
    const entry = existing || { characterId: Number(targetId) };
    entry.name = entry.name || (await characterName(targetId)) || `character-${targetId}`;
    if (!existing) {
        entry.lockedAt = new Date().toISOString();
        entry.lockedBy = arg('--by') || 'operator';
        entry.reason = arg('--reason') || 'Configuration frozen at operator direction.';
        doc.locks.push(entry);
    } else {
        if (arg('--reason')) entry.reason = arg('--reason');
        entry.refreshedAt = new Date().toISOString();
    }
    entry.fingerprints = await fingerprint(targetId);
    await writeLocks(doc);
    console.log(`🔒 ${entry.name} (id ${entry.characterId}) locked — ${Object.keys(entry.fingerprints).length} config files fingerprinted.`);
} else if (command === 'unlock') {
    if (!targetId) throw new Error('usage: character-lock.mjs unlock <characterId>');
    const before = doc.locks.length;
    doc.locks = doc.locks.filter(l => String(l.characterId) !== String(targetId));
    await writeLocks(doc);
    console.log(before === doc.locks.length
        ? `character ${targetId} was not locked.`
        : `🔓 character ${targetId} UNLOCKED — its configuration can be changed again.`);
} else if (command === 'verify') {
    const locks = targetId ? doc.locks.filter(l => String(l.characterId) === String(targetId)) : doc.locks;
    let drift = 0;
    for (const lock of locks) {
        const now = await fingerprint(lock.characterId);
        const then = lock.fingerprints || {};
        const names = new Set([...Object.keys(then), ...Object.keys(now)]);
        const changed = [...names].filter(n => then[n] !== now[n]);
        if (!changed.length) {
            console.log(`✅ ${lock.name} (id ${lock.characterId}) — ${names.size} config files match the lock.`);
        } else {
            drift += changed.length;
            console.log(`❌ ${lock.name} (id ${lock.characterId}) — ${changed.length} config file(s) DIFFER from the lock:`);
            for (const n of changed) {
                const state = !then[n] ? 'added' : !now[n] ? 'missing' : 'modified';
                console.log(`   ${state}: ${n}`);
            }
        }
    }
    if (!locks.length) console.log('Nothing to verify — no locks recorded.');
    // Drift is reported, not fatal: node-local config legitimately differs
    // between the repo on this node and the character's own node.
    process.exitCode = 0;
} else {
    console.error(`unknown command: ${command}`);
    process.exitCode = 2;
}
