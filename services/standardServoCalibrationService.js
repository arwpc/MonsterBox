/**
 * Standard Positional Servo Calibration Service
 * Handles calibration data for standard (absolute) servos
 */

import fs from 'fs/promises';
import path from 'path';

const CALIBRATION_FILE = path.join(process.cwd(), 'data', 'servo_calibrations.json');

// ---------- File IO ----------
export async function loadCalibrations() {
  try {
    const data = await fs.readFile(CALIBRATION_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveCalibrations(calibrations) {
  await fs.writeFile(CALIBRATION_FILE, JSON.stringify(calibrations, null, 2));
}

// ---------- Core helpers ----------
export async function getCalibration(partId) {
  const calibrations = await loadCalibrations();
  const entry = calibrations[String(partId)];
  if (entry && entry.servo_type === 'standard') return entry;
  return null;
}

function ensureEntry(calibrations, partId, partName, channel) {
  const id = String(partId);
  if (!calibrations[id]) {
    calibrations[id] = {
      part_id: parseInt(partId, 10),
      part_name: partName,
      servo_type: 'standard',
      channel: channel,
      calibrated_date: new Date().toISOString(),
      // Default pulses and angles; can be tailored per project
      min_pulse_us: 1000,
      center_pulse_us: 1500,
      max_pulse_us: 2000,
      min_angle_deg: 0,
      center_angle_deg: 90,
      max_angle_deg: 180,
      positions: {},
      functionality_status: 'working'
    };
  }
  return calibrations[id];
}

// ---------- Pulse save/reset ----------
export async function savePulse(partId, partName, pulseType, pulseUs, channel) {
  const calibrations = await loadCalibrations();
  const entry = ensureEntry(calibrations, partId, partName, channel);

  const valid = ['min', 'center', 'max'];
  if (valid.indexOf(String(pulseType)) === -1) throw new Error('Invalid pulseType');

  const key = `${pulseType}_pulse_us`;
  entry[key] = parseInt(pulseUs, 10);
  entry.calibrated_date = new Date().toISOString();

  await saveCalibrations(calibrations);
  return entry;
}

export async function resetCalibration(partId) {
  const calibrations = await loadCalibrations();
  const id = String(partId);
  if (calibrations[id] && calibrations[id].servo_type === 'standard') {
    delete calibrations[id];
    await saveCalibrations(calibrations);
    return true;
  }
  return false;
}

// ---------- Positions (absolute angle-based) ----------
export async function savePosition(partId, partName, positionName, description, channel, positionData) {
  const calibrations = await loadCalibrations();
  const entry = ensureEntry(calibrations, partId, partName, channel);

  if (!positionName || !String(positionName).trim()) throw new Error('Invalid positionName');

  const angle = positionData && positionData.angle != null ? parseInt(positionData.angle, 10) : null;
  if (angle == null || isNaN(angle)) throw new Error('angle is required for positional servo positions');

  const speed = positionData && positionData.speed != null ? parseInt(positionData.speed, 10) : undefined;
  const duration = positionData && positionData.duration != null ? parseInt(positionData.duration, 10) : undefined;

  entry.positions[positionName] = {
    description: description || `${positionName} angle position`,
    angle: angle,
    ...(speed != null ? { speed } : {}),
    ...(duration != null ? { duration } : {}),
    calibrated: true,
    calibrated_date: new Date().toISOString()
  };

  entry.calibrated_date = new Date().toISOString();
  await saveCalibrations(calibrations);
  return entry;
}

export async function listPositions(partId) {
  const entry = await getCalibration(partId);
  return entry ? (entry.positions || {}) : {};
}

export async function deletePosition(partId, positionName) {
  const calibrations = await loadCalibrations();
  const id = String(partId);
  const entry = calibrations[id];
  if (!entry || entry.servo_type !== 'standard') return false;
  if (!entry.positions || !entry.positions[positionName]) return false;
  delete entry.positions[positionName];
  entry.calibrated_date = new Date().toISOString();
  await saveCalibrations(calibrations);
  return true;
}

export async function renamePosition(partId, oldName, newName) {
  const calibrations = await loadCalibrations();
  const id = String(partId);
  const entry = calibrations[id];
  if (!entry || entry.servo_type !== 'standard') return false;
  if (!entry.positions || !entry.positions[oldName]) return false;
  if (entry.positions[newName]) return false;
  entry.positions[newName] = { ...entry.positions[oldName], calibrated_date: new Date().toISOString() };
  delete entry.positions[oldName];
  entry.calibrated_date = new Date().toISOString();
  await saveCalibrations(calibrations);
  return true;
}

export async function updatePosition(partId, positionName, updates = {}) {
  const calibrations = await loadCalibrations();
  const id = String(partId);
  const entry = calibrations[id];
  if (!entry || entry.servo_type !== 'standard') return false;
  if (!entry.positions || !entry.positions[positionName]) return false;

  const next = { ...entry.positions[positionName] };
  if (updates.description != null) next.description = updates.description;
  if (updates.angle != null) next.angle = parseInt(updates.angle, 10);
  if (updates.speed != null) next.speed = parseInt(updates.speed, 10);
  if (updates.duration != null) next.duration = parseInt(updates.duration, 10);
  next.calibrated_date = new Date().toISOString();

  entry.positions[positionName] = next;
  entry.calibrated_date = new Date().toISOString();
  await saveCalibrations(calibrations);
  return true;
}

// ---------- Copy calibration between parts ----------
export async function copyCalibration(fromPartId, toPartId, toPartName, toChannel) {
  const calibrations = await loadCalibrations();
  const from = calibrations[String(fromPartId)];
  if (!from || from.servo_type !== 'standard') throw new Error('Source calibration not found or not standard');
  const toEntry = ensureEntry(calibrations, toPartId, toPartName, toChannel);

  // Copy pulses and angles
  toEntry.min_pulse_us = from.min_pulse_us;
  toEntry.center_pulse_us = from.center_pulse_us;
  toEntry.max_pulse_us = from.max_pulse_us;
  toEntry.min_angle_deg = from.min_angle_deg || 0;
  toEntry.center_angle_deg = from.center_angle_deg || 90;
  toEntry.max_angle_deg = from.max_angle_deg || 180;

  // Deep copy positions
  toEntry.positions = {};
  const fromPositions = from.positions || {};
  Object.keys(fromPositions).forEach(function (name) {
    const p = fromPositions[name];
    toEntry.positions[name] = {
      description: p.description,
      angle: parseInt(p.angle, 10),
      ...(p.speed != null ? { speed: parseInt(p.speed, 10) } : {}),
      ...(p.duration != null ? { duration: parseInt(p.duration, 10) } : {}),
      calibrated: !!p.calibrated,
      calibrated_date: new Date().toISOString()
    };
  });

  toEntry.calibrated_date = new Date().toISOString();
  await saveCalibrations(calibrations);
  return toEntry;
}

// ---------- Status & suggestions ----------
export async function getCalibrationStatus(partId) {
  const entry = await getCalibration(partId);
  if (!entry) {
    return {
      exists: false,
      pulseCalibrated: false,
      positionsCalibrated: false,
      minPulseCalibrated: false,
      centerPulseCalibrated: false,
      maxPulseCalibrated: false,
      calibratedPositions: [],
      calibratedDate: null
    };
  }
  const positions = entry.positions || {};
  const calibratedPositions = Object.keys(positions).filter(k => positions[k] && positions[k].calibrated);
  const minPulseCalibrated = entry.min_pulse_us != null;
  const centerPulseCalibrated = entry.center_pulse_us != null;
  const maxPulseCalibrated = entry.max_pulse_us != null;

  return {
    exists: true,
    pulseCalibrated: !!(minPulseCalibrated && centerPulseCalibrated && maxPulseCalibrated),
    positionsCalibrated: calibratedPositions.length > 0,
    minPulseCalibrated,
    centerPulseCalibrated,
    maxPulseCalibrated,
    calibratedPositions,
    calibratedDate: entry.calibrated_date,
    pulses: {
      min: entry.min_pulse_us,
      center: entry.center_pulse_us,
      max: entry.max_pulse_us
    },
    positions
  };
}

export function getSuggestedPositions(partName) {
  const name = String(partName || '').toLowerCase();
  if (name.includes('head') || name.includes('swivel') || name.includes('gaze')) {
    return [
      { name: 'forward', description: 'Facing forward (center)' },
      { name: 'left_45', description: 'Left 45°' },
      { name: 'right_45', description: 'Right 45°' },
      { name: 'left_90', description: 'Left 90°' },
      { name: 'right_90', description: 'Right 90°' }
    ];
  }
  if (name.includes('jaw') || name.includes('mouth')) {
    return [
      { name: 'closed', description: 'Closed' },
      { name: 'open', description: 'Open' },
      { name: 'rest', description: 'Rest (center)' }
    ];
  }
  return [
    { name: 'min', description: 'Minimum angle' },
    { name: 'center', description: 'Center angle' },
    { name: 'max', description: 'Maximum angle' }
  ];
}

export default {
  loadCalibrations,
  saveCalibrations,
  getCalibration,
  savePulse,
  savePosition,
  listPositions,
  deletePosition,
  renamePosition,
  updatePosition,
  getCalibrationStatus,
  resetCalibration,
  getSuggestedPositions,
  copyCalibration
};

