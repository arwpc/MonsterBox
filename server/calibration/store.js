import fs from 'fs/promises';
import path from 'path';
import { writeJsonAtomic, withFileLock } from '../../services/atomicStore.js';
import { readConfig } from '../../services/configService.js';

const DEFAULT_CAL_PATH = path.resolve(process.cwd(), 'data/calibration_profiles.json');

// Part IDs are NOT globally unique — character-1 and character-3 both define a
// part id 5 referring to different physical hardware. Keying calibration profiles
// by bare partId let one character's calibration overwrite another's (and drive a
// servo to the wrong, possibly damaging, bounds). Profiles are therefore keyed by
// `${characterId}:${partId}`.
//
// Safety / backward-compatibility: reads fall back to a legacy bare-`partId` entry
// when no character-scoped entry exists, so existing calibration data keeps working
// until a part is re-calibrated (which writes the scoped key). This makes the change
// strictly non-regressive: at worst a reader gets today's shared value.
//
// The character defaults to the node's selected character (a MonsterBox node runs
// one character), resolved from config and cached briefly to avoid an SD read on
// every lookup during scene execution. Callers that know the character (scene
// executor, jaw/head services) pass it explicitly.

let _selCache = { id: undefined, at: 0 };
const SEL_TTL_MS = 2000;

async function selectedCharacterId() {
  const now = Date.now();
  if (_selCache.id !== undefined && (now - _selCache.at) < SEL_TTL_MS) {
    return _selCache.id;
  }
  try {
    const cfg = await readConfig();
    _selCache = { id: (cfg && cfg.selectedCharacter != null) ? cfg.selectedCharacter : null, at: now };
  } catch (_) {
    _selCache = { id: null, at: now };
  }
  return _selCache.id;
}

// Test/hot-swap hook: forget the cached selected character.
export function invalidateSelectedCharacterCache() {
  _selCache = { id: undefined, at: 0 };
}

function scopedKey(characterId, partId) {
  return `${characterId}:${String(partId)}`;
}

export class JsonCalibrationStore {
  constructor(filePath) {
    this.filePath = filePath || DEFAULT_CAL_PATH;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw || '{}');
    } catch (e) {
      if (e && e.code === 'ENOENT') return {};
      throw e;
    }
  }

  async save(data) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Atomic write so an interrupted calibration write can't corrupt the file.
    await writeJsonAtomic(this.filePath, data);
  }

  async _resolveCharacter(characterId) {
    return characterId !== undefined ? characterId : await selectedCharacterId();
  }

  async get(partId, characterId) {
    const cid = await this._resolveCharacter(characterId);
    const all = await this.load();
    if (cid != null) {
      const scoped = all[scopedKey(cid, partId)];
      if (scoped) return scoped;
    }
    // Legacy fallback: a pre-namespacing bare-partId entry.
    return all[String(partId)] || null;
  }

  async upsert(profile, characterId) {
    // Serialize the load→mutate→save so two concurrent calibration writes don't
    // each read the same snapshot and clobber the other (last-writer-wins).
    return withFileLock(`calibration:${this.filePath}`, async () => {
      const cid = characterId !== undefined
        ? characterId
        : (profile && profile.characterId != null ? profile.characterId : await selectedCharacterId());
      const all = await this.load();
      const key = cid != null ? scopedKey(cid, profile.partId) : String(profile.partId);
      all[key] = Object.assign({}, profile, {
        characterId: cid != null ? cid : (profile.characterId != null ? profile.characterId : undefined),
        lastCalibratedAt: new Date().toISOString()
      });
      await this.save(all);
    });
  }

  async list() {
    const all = await this.load();
    return Object.values(all);
  }

  async delete(partId, characterId) {
    return withFileLock(`calibration:${this.filePath}`, async () => {
      const cid = await this._resolveCharacter(characterId);
      const all = await this.load();
      const scoped = cid != null ? scopedKey(cid, partId) : null;
      // Prefer deleting the character-scoped entry; fall back to the legacy bare key.
      const key = (scoped && all[scoped]) ? scoped : String(partId);
      if (!all[key]) return false;
      delete all[key];
      await this.save(all);
      return true;
    });
  }
}

let instance = null;
export function getCalibrationStore(filePath) {
  if (!instance) instance = new JsonCalibrationStore(filePath);
  return instance;
}

export default { JsonCalibrationStore, getCalibrationStore, invalidateSelectedCharacterCache };
