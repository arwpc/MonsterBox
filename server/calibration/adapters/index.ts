/**
 * Hardware Adapters for Unified Calibration System
 * Provides thin wrappers around existing hardware drivers
 */

import type {
  CapabilityProfile,
  SensorReadings
} from '../models.js';

// Base adapter interface
export interface PositionableAdapter {
  getCapabilities(): CapabilityProfile;
  nudge(dir: 'min' | 'max', scale: 'fine' | 'med' | 'coarse'): Promise<void>;
  stop(): Promise<void>;
  gotoNormalized(p: number, opts?: { speedPct?: number; timeoutMs?: number }): Promise<void>;
  readSensors?(): Promise<SensorReadings>;
}

// Speaker adapter (non-positional)
export interface SpeakerAdapter {
  testToneHz(hz: number, ms: number): Promise<void>;
  setGainDb(db: number): Promise<void>;
  listSinks(): Promise<Array<{ id: string; name: string }>>;
}
