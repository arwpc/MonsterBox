/**
 * JSON File-based Calibration Storage
 * Stores calibration profiles in data/calibration_profiles.json
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CalibrationProfile, CalibrationStore } from './models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default calibration file path
const DEFAULT_CAL_PATH = path.resolve(__dirname, '../../data/calibration_profiles.json');

export class JsonCalibrationStore implements CalibrationStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || DEFAULT_CAL_PATH;
  }

  private async load(): Promise<Record<string, CalibrationProfile>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw || '{}');
    } catch (e: any) {
      if (e.code === 'ENOENT') return {};
      throw e;
    }
  }

  private async save(data: Record<string, CalibrationProfile>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async get(partId: number): Promise<CalibrationProfile | null> {
    const all = await this.load();
    return all[String(partId)] || null;
  }

  async upsert(profile: CalibrationProfile): Promise<void> {
    const all = await this.load();
    all[String(profile.partId)] = {
      ...profile,
      lastCalibratedAt: new Date().toISOString()
    };
    await this.save(all);
  }

  async list(): Promise<CalibrationProfile[]> {
    const all = await this.load();
    return Object.values(all);
  }

  async delete(partId: number): Promise<boolean> {
    const all = await this.load();
    const key = String(partId);
    if (!all[key]) return false;
    delete all[key];
    await this.save(all);
    return true;
  }
}

// Singleton instance
let storeInstance: JsonCalibrationStore | null = null;

export function getCalibrationStore(filePath?: string): CalibrationStore {
  if (!storeInstance) {
    storeInstance = new JsonCalibrationStore(filePath);
  }
  return storeInstance;
}

export default { JsonCalibrationStore, getCalibrationStore };
