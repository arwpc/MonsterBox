/**
 * Unified Positions v1.5 - Calibration Data Models
 * MonsterBox 5.5
 */

// Position preset: named position with normalized value [0..1]
export interface PositionPreset {
  name: string;
  p: number; // Normalized position in [0..1]
}

// Calibration bounds: min/max normalized positions
export interface CalibrationBounds {
  minP: number; // Default 0
  maxP: number; // Default 1
}

// Capability profiles for different hardware types
export type CapabilityProfile =
  | { kind: 'absolute-servo'; usMin?: number; usMax?: number; invert?: boolean }
  | { kind: 'openloop-linear'; invert?: boolean }
  | { kind: 'stepper'; stepsMin?: number; stepsMax?: number; invert?: boolean }
  | { kind: 'dc-motor'; invert?: boolean }
  | { kind: 'speaker' };

// Motion models
export type MotionModel =
  | { type: 'direct-map' } // For servos/steppers: p maps directly to hardware units
  | {
    type: 'time-at-speed'; // For open-loop/DC: estimate position by time
    bins: Array<{ pwmPct: number; unitsPerSec: number }>; // Speed calibration bins
    settleMs: number; // Settling time after movement
  };

// Safety constraints
export interface SafetyConstraints {
  maxDutyPct?: number; // Maximum PWM duty cycle
  stallCurrentA?: number; // Stall current threshold (amps)
  maxTempC?: number; // Maximum temperature (Celsius)
}

// Main calibration profile for a part
export interface CalibrationProfile {
  partId: number;
  capability: CapabilityProfile;
  bounds: CalibrationBounds; // Default {minP: 0, maxP: 1}
  presets: PositionPreset[]; // Named positions (Min/Max implicitly included in UI)
  motion: MotionModel;
  safety?: SafetyConstraints;
  lastCalibratedAt: string; // ISO 8601 timestamp
  version: 1;
}

// Speaker-specific calibration
export interface SpeakerCalibration {
  partId: number;
  sinkId?: string; // PipeWire/ALSA sink ID
  referenceGainDb?: number; // Reference gain level
  lastCalibratedAt: string;
  version: 1;
}

// Storage interface for calibration profiles
export interface CalibrationStore {
  get(partId: number): Promise<CalibrationProfile | null>;
  upsert(profile: CalibrationProfile): Promise<void>;
  list(): Promise<CalibrationProfile[]>;
  delete(partId: number): Promise<boolean>;
}

// Runtime position state (tracked in memory)
export interface PositionState {
  currentP: number; // Current normalized position [0..1]
  lastDirection?: 'min' | 'max'; // Last movement direction (for reversal compensation)
  isMoving: boolean;
  lastUpdated: string; // ISO 8601 timestamp
}

// Motion command parameters
export interface MotionCommand {
  targetP: number; // Target normalized position [0..1]
  speedPct?: number; // Speed percentage (default 100)
  timeoutMs?: number; // Timeout (default calculated)
}

// Nudge command parameters
export interface NudgeCommand {
  dir: 'min' | 'max';
  scale: 'fine' | 'med' | 'coarse';
}

// Learn move probe result
export interface LearnProbe {
  pwmPct: number;
  msRun: number;
  fromP: number;
  toP: number;
  measuredDeltaP: number;
}

// Sensor readings (for parts with feedback)
export interface SensorReadings {
  atMin?: boolean;
  atMax?: boolean;
  currentA?: number;
  tempC?: number;
}
