#!/usr/bin/env node
/**
 * Migrate existing calibration data to Unified Positions v1.5
 * MonsterBox 5.3
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function loadParts() {
  try {
    const partsPath = path.resolve(rootDir, 'data/parts.json');
    const raw = await fs.readFile(partsPath, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Failed to load parts.json:', err);
    return [];
  }
}

async function loadLegacyCalibrations() {
  const legacy = {};

  // Try to load simple_calibrations.json
  try {
    const simplePath = path.resolve(rootDir, 'data/simple_calibrations.json');
    const raw = await fs.readFile(simplePath, 'utf8');
    const data = JSON.parse(raw || '{}');
    Object.assign(legacy, data);
  } catch (err) {
    // File doesn't exist, which is fine
  }

  return legacy;
}

function getDefaultMotionModel(partType) {
  const type = String(partType).toLowerCase();

  if (type === 'servo') {
    return { type: 'direct-map' };
  } else if (type === 'linear_actuator' || type === 'motor') {
    // Conservative defaults for open-loop
    return {
      type: 'time-at-speed',
      bins: [{ pwmPct: 50, unitsPerSec: 0.2 }],
      settleMs: 120
    };
  } else if (type === 'stepper') {
    return { type: 'direct-map' };
  } else {
    return { type: 'direct-map' };
  }
}

function getDefaultCapability(partType, part) {
  const type = String(partType).toLowerCase();

  if (type === 'servo') {
    const usMin = part.config?.minPulse || part.config?.min_pulse_us || 500;
    const usMax = part.config?.maxPulse || part.config?.max_pulse_us || 2500;
    return {
      kind: 'absolute-servo',
      usMin,
      usMax,
      invert: part.config?.invert || false
    };
  } else if (type === 'linear_actuator' || type === 'motor') {
    return {
      kind: 'openloop-linear',
      invert: part.config?.invert || false
    };
  } else if (type === 'stepper') {
    return {
      kind: 'stepper',
      stepsMin: part.config?.stepsMin || 0,
      stepsMax: part.config?.stepsMax || 200,
      invert: part.config?.invert || false
    };
  } else if (type === 'speaker') {
    return { kind: 'speaker' };
  } else {
    return { kind: 'absolute-servo', usMin: 500, usMax: 2500, invert: false };
  }
}

function migrateLegacyCalibration(partId, legacyData, part) {
  const presets = [];

  // Convert legacy named points to presets
  if (legacyData.points && Array.isArray(legacyData.points)) {
    for (const point of legacyData.points) {
      presets.push({
        name: point.name,
        p: point.value // Assume legacy values are already normalized
      });
    }
  }

  // Add Min/Max if they exist
  if (typeof legacyData.safeMin === 'number') {
    presets.push({ name: 'Min', p: legacyData.safeMin });
  }
  if (typeof legacyData.safeMax === 'number') {
    presets.push({ name: 'Max', p: legacyData.safeMax });
  }

  return {
    partId: parseInt(partId, 10),
    capability: getDefaultCapability(part.type, part),
    bounds: {
      minP: typeof legacyData.safeMin === 'number' ? legacyData.safeMin : 0,
      maxP: typeof legacyData.safeMax === 'number' ? legacyData.safeMax : 1
    },
    presets,
    motion: getDefaultMotionModel(part.type),
    lastCalibratedAt: new Date().toISOString(),
    version: 1
  };
}

async function main() {
  console.log('🔄 Migrating calibration data to Unified Positions v1.5...\n');

  const parts = await loadParts();
  const legacyCalibrations = await loadLegacyCalibrations();

  const profiles = {};
  let migratedCount = 0;
  let createdCount = 0;

  for (const part of parts) {
    const partId = String(part.id);
    const legacyData = legacyCalibrations[partId];

    if (legacyData) {
      // Migrate existing calibration
      profiles[partId] = migrateLegacyCalibration(partId, legacyData, part);
      migratedCount++;
      console.log(`✅ Migrated part ${partId} (${part.name}) from legacy calibration`);
    } else {
      // Create default profile
      profiles[partId] = {
        partId: parseInt(partId, 10),
        capability: getDefaultCapability(part.type, part),
        bounds: { minP: 0, maxP: 1 },
        presets: [],
        motion: getDefaultMotionModel(part.type),
        lastCalibratedAt: new Date().toISOString(),
        version: 1
      };
      createdCount++;
      console.log(`➕ Created default profile for part ${partId} (${part.name})`);
    }
  }

  // Save migrated profiles
  const outputPath = path.resolve(rootDir, 'data/calibration_profiles.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(profiles, null, 2), 'utf8');

  console.log(`\n✅ Migration complete!`);
  console.log(`   Migrated: ${migratedCount} existing calibrations`);
  console.log(`   Created: ${createdCount} new default profiles`);
  console.log(`   Total: ${Object.keys(profiles).length} profiles`);
  console.log(`   Output: ${outputPath}\n`);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
