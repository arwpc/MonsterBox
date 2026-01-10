
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = '/home/remote/MonsterBox/data';
const PARTS_FILE = path.join(DATA_DIR, 'parts.json');
const CALIBRATION_FILE = path.join(DATA_DIR, 'calibration_profiles.json');

async function fixCalibration() {
    try {
        console.log('Reading files...');
        const partsRaw = await fs.readFile(PARTS_FILE, 'utf8');
        const profilesRaw = await fs.readFile(CALIBRATION_FILE, 'utf8');

        const parts = JSON.parse(partsRaw);
        let profiles = JSON.parse(profilesRaw);
        const originalCount = Object.keys(profiles).length;

        console.log(`Loaded ${parts.length} parts and ${originalCount} profiles.`);

        for (const part of parts) {
            const pid = String(part.id);
            if (profiles[pid]) {
                console.log(`Part ${pid} (${part.name}) already has profile.`);
                continue;
            }

            console.log(`Generating default profile for Part ${pid} (${part.name}) Type: ${part.type}`);

            let newProfile = null;

            if (part.type === 'servo') {
                newProfile = {
                    partId: parseInt(pid), // Use number for consistency if legacy
                    capability: {
                        kind: 'absolute-servo',
                        usMin: part.minPulse || 500,
                        usMax: part.maxPulse || 2500,
                        invert: false
                    },
                    bounds: {
                        minP: 0.0,
                        maxP: 1.0
                    },
                    presets: [],
                    motion: {
                        type: 'direct-map',
                        defaultSpeedPct: 90,
                        defaultDurationMs: 1000
                    },
                    lastCalibratedAt: new Date().toISOString(),
                    version: 1
                };
            } else if (part.type === 'linear_actuator' || part.type === 'linear-actuator') {
                newProfile = {
                    partId: parseInt(pid),
                    capability: {
                        kind: 'openloop-linear',
                        invert: false
                    },
                    bounds: {
                        minP: 0,
                        maxP: 1
                    },
                    presets: [],
                    motion: {
                        type: 'time-at-speed',
                        bins: [{ pwmPct: 100, unitsPerSec: 1.0 }],
                        settleMs: 100
                    },
                    lastCalibratedAt: new Date().toISOString(),
                    version: 1
                };
            } else if (part.type === 'light' || part.type === 'led') {
                 newProfile = {
                    partId: parseInt(pid),
                    capability: { kind: 'onoff' },
                    bounds: {},
                    presets: [],
                    motion: {},
                    version:1
                 };
            } else if (part.type === 'speaker') {
                 newProfile = {
                    partId: parseInt(pid),
                    capability: { kind: 'speaker' },
                    bounds: {},
                    presets: [],
                    motion: {},
                    version:1
                 };
            } else if (part.type === 'microphone') {
                 newProfile = {
                    partId: parseInt(pid),
                    capability: { kind: 'microhpone' }, // Typo intentional match if needed, but standard is 'microphone'
                    bounds: {},
                    motion: {},
                    version:1
                 };
            } else if (part.type === 'webcam') {
                 newProfile = {
                    partId: parseInt(pid),
                    capability: { kind: 'webcam' },
                    bounds: {},
                    motion: {},
                    version:1
                 };
            } else if (part.type === 'sensor' || part.type === 'motion_sensor') {
                 newProfile = {
                    partId: parseInt(pid),
                    capability: { kind: 'sensor' },
                    bounds: {},
                    motion: {},
                    version:1
                 };
            }

            if (newProfile) {
                profiles[pid] = newProfile;
            } else {
                console.log(`Skipping unknown type: ${part.type}`);
            }
        }

        const newCount = Object.keys(profiles).length;
        if (newCount > originalCount) {
            console.log(`Saving ${newCount} profiles to ${CALIBRATION_FILE}`);
            await fs.writeFile(CALIBRATION_FILE, JSON.stringify(profiles, null, 2));
            console.log('Success!');
        } else {
            console.log('No new profiles generated.');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

fixCalibration();
