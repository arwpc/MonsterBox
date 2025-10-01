const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const logger = require('../scripts/logger');

const DATA_PATH = path.join(__dirname, '../data/super_powers.json');

/**
 * SuperPowersService
 * Simple persistence for per-character Super Powers settings (starting with Jaw Animation)
 */
class SuperPowersService extends EventEmitter {
  constructor() {
    super();
    this.data = { characters: {} }; // { [characterId]: { jawAnimation: { ... } } }
  }

  async initialize() {
    try {
      const raw = await fs.readFile(DATA_PATH, 'utf8');
      this.data = JSON.parse(raw);
      if (!this.data.characters) this.data.characters = {};
      logger.info('🧬 SuperPowersService loaded');
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.info('🧬 SuperPowersService starting fresh (no data file)');
        await this.save();
      } else {
        logger.warn('SuperPowersService load error:', err.message);
        throw err;
      }
    }
  }

  async save() {
    await fs.writeFile(DATA_PATH, JSON.stringify(this.data, null, 2));
  }

  // --- Generic helpers ---
  _ensureCharacter(characterId) {
    const cid = String(parseInt(characterId, 10));
    if (!this.data.characters[cid]) this.data.characters[cid] = {};
    return cid;
  }

  getCharacterConfig(characterId) {
    const cid = String(parseInt(characterId, 10));
    return this.data.characters[cid] || {};
  }

  // --- Jaw Animation ---
  getJawAnimationConfig(characterId) {
    const cfg = this.getCharacterConfig(characterId);
    return cfg.jawAnimation || null;
  }

  async setJawAnimationConfig(characterId, config) {
    const cid = this._ensureCharacter(characterId);
    this.data.characters[cid].jawAnimation = {
      enabled: !!config.enabled,
      servoPartId: config.servoPartId ? parseInt(config.servoPartId, 10) : null,
      minAngle: config.minAngle != null ? parseFloat(config.minAngle) : 60,
      maxAngle: config.maxAngle != null ? parseFloat(config.maxAngle) : 120,
      smoothing: config.smoothing != null ? Math.max(0, Math.min(0.99, parseFloat(config.smoothing))) : 0.6,
      sensitivity: config.sensitivity != null ? Math.max(0.1, Math.min(5.0, parseFloat(config.sensitivity))) : 1.0
    };
    await this.save();
    this.emit('jawAnimationUpdated', cid, this.data.characters[cid].jawAnimation);
    return this.data.characters[cid].jawAnimation;
  }
}

let instance = null;
function getSuperPowersService() {
  if (!instance) instance = new SuperPowersService();
  return instance;
}

module.exports = { SuperPowersService, getSuperPowersService };

