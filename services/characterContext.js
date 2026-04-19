import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from './configService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CHARACTERS_FILE = path.join(REPO_ROOT, 'data', 'characters.json');
const ANIMATRONICS_FILE = path.join(REPO_ROOT, 'config', 'animatronics.json');

let registryCache = null;
let networkCache = null;

function loadRegistry() {
  if (registryCache) return registryCache;
  try {
    registryCache = JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
  } catch (_) {
    registryCache = [];
  }
  return registryCache;
}

function loadNetwork() {
  if (networkCache) return networkCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(ANIMATRONICS_FILE, 'utf8'));
    networkCache = parsed.animatronics || [];
  } catch (_) {
    networkCache = [];
  }
  return networkCache;
}

export function invalidateCache() {
  registryCache = null;
  networkCache = null;
}

function toNumericId(value) {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function buildContext(id) {
  if (id == null) return null;
  const registry = loadRegistry();
  const entry = registry.find((c) => c.id === id);
  if (!entry) {
    return { id, name: null, dataDir: `data/character-${id}`, network: null };
  }
  const network = loadNetwork().find((a) => a.characterId === id) || null;
  return {
    id,
    name: entry.name,
    dataDir: `data/character-${id}`,
    network,
  };
}

function pickFromReq(req) {
  if (!req) return null;
  const fromQuery = toNumericId(req.query && req.query.characterId);
  if (fromQuery != null) return fromQuery;
  const fromParams = toNumericId(req.params && (req.params.characterId || req.params.charId));
  if (fromParams != null) return fromParams;
  const fromLocals =
    req.app && req.app.locals && req.app.locals.config
      ? toNumericId(req.app.locals.config.selectedCharacter)
      : null;
  if (fromLocals != null) return fromLocals;
  return null;
}

export async function resolveCharacter(req) {
  let id = pickFromReq(req);
  if (id == null) {
    const cfg = await readConfig();
    id = toNumericId(cfg && cfg.selectedCharacter);
  }
  if (id == null) return null;
  return buildContext(id);
}

export function resolveCharacterSync(req) {
  const id = pickFromReq(req);
  return id == null ? null : buildContext(id);
}

export function getCharacterById(id) {
  return buildContext(toNumericId(id));
}

export default { resolveCharacter, resolveCharacterSync, getCharacterById, invalidateCache };
