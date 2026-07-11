import fs from 'fs/promises';
import path from 'path';
import { writeJsonAtomic, withFileLock } from '../../services/atomicStore.js';

const DEFAULT_CAL_PATH = path.resolve(process.cwd(), 'data/calibration_profiles.json');

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

  async get(partId) {
    const all = await this.load();
    return all[String(partId)] || null;
  }

  async upsert(profile) {
    // Serialize the load→mutate→save so two concurrent calibration writes don't
    // each read the same snapshot and clobber the other (last-writer-wins).
    return withFileLock(`calibration:${this.filePath}`, async () => {
      const all = await this.load();
      all[String(profile.partId)] = Object.assign({}, profile, { lastCalibratedAt: new Date().toISOString() });
      await this.save(all);
    });
  }

  async list() {
    const all = await this.load();
    return Object.values(all);
  }

  async delete(partId) {
    return withFileLock(`calibration:${this.filePath}`, async () => {
      const all = await this.load();
      const key = String(partId);
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

export default { JsonCalibrationStore, getCalibrationStore };
