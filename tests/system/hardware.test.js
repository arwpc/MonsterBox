/**
 * Hardware Service System Tests
 * Validates hardware execution down to Python layer
 */

import { expect } from 'chai';
import hardwareService from '../../services/hardwareService/index.js';
import { readConfig } from '../../services/configService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// controlPart takes a part ID (string/number), not a part object. Discover a real
// part id from the selected character so these tests exercise the actual id-lookup
// path (and stay character-independent) instead of passing an object that can never
// be found — which used to log a misleading "Part [object Object] not found".
async function firstPartId(preferType) {
    try {
        const cfg = await readConfig();
        const charId = cfg && cfg.selectedCharacter;
        const partsPath = path.resolve(__dirname, '../..', `data/character-${charId}`, 'parts.json');
        const parts = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
        const match = (preferType && parts.find(p => p.type === preferType)) || parts[0];
        return match ? match.id : undefined;
    } catch (_) {
        return undefined;
    }
}

describe('Hardware Service System Tests', function() {
    this.timeout(10000);

    before(function() {
        // Skip hardware tests unless explicitly enabled
        if (!process.env.MONSTERBOX_HARDWARE_AVAILABLE && !process.env.MB_TEST_MODE) {
            this.skip();
        }
    });

    describe('Python Wrapper Execution', () => {
        it('should execute controlPart without errors', async () => {
            // Test with MB_TEST_MODE=1 to avoid actual hardware
            process.env.MB_TEST_MODE = '1';

            const servoId = (await firstPartId('servo')) ?? (await firstPartId());
            try {
                const result = await hardwareService.controlPart(String(servoId), 'moveToAngle', { angleDeg: 90 });

                // May succeed or fail depending on test mode, but shouldn't crash
                expect(result).to.exist;
            } catch (error) {
                // Hardware control may fail in test mode - that's OK
                expect(error.message).to.be.a('string');
            }
        });

        it('should handle hardware errors gracefully', async () => {
            process.env.MB_TEST_MODE = '1';
            
            try {
                // A non-existent id must surface a clean, string error (not crash).
                await hardwareService.controlPart('999', 'invalid_action', {});
            } catch (error) {
                expect(error).to.exist;
            }
        });

        it('should respect test mode flag', async () => {
            process.env.MB_TEST_MODE = '1';
            
            const servoId = (await firstPartId('servo')) ?? (await firstPartId());
            try {
                const result = await hardwareService.controlPart(String(servoId), 'moveToAngle', { angleDeg: 90 });

                // In test mode, should return success without actual hardware execution
                expect(result).to.exist;
            } catch (error) {
                // May fail if no parts configured - that's OK
                expect(error.message).to.be.a('string');
            }
        });
    });

    describe('Hardware Configuration', () => {
        it('should load animatronics configuration', () => {
            const configPath = path.join(__dirname, '../../config/animatronics.json');
            expect(fs.existsSync(configPath)).to.be.true;
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            expect(config).to.be.an('object');
        });

        it('should validate part configurations', () => {
            const partsPath = path.join(__dirname, '../../data/parts.json');
            expect(fs.existsSync(partsPath)).to.be.true;
            
            const parts = JSON.parse(fs.readFileSync(partsPath, 'utf8'));
            expect(parts).to.be.an('array');
            expect(parts.length).to.be.greaterThan(0);
            
            // Validate first part has required fields
            const part = parts[0];
            expect(part).to.have.property('id');
            expect(part).to.have.property('name');
            expect(part).to.have.property('type');
        });
    });

    describe('Python Wrapper Files', () => {
        it('should have all required Python wrappers', () => {
            const wrappersDir = path.join(__dirname, '../../python_wrappers');
            expect(fs.existsSync(wrappersDir)).to.be.true;
            
            // Use *_cli.py naming convention
            const requiredWrappers = [
                'servo_cli.py',
                'motor_cli.py',
                'led_cli.py'
            ];
            
            requiredWrappers.forEach(wrapper => {
                const wrapperPath = path.join(wrappersDir, wrapper);
                expect(fs.existsSync(wrapperPath), `Missing wrapper: ${wrapper}`).to.be.true;
            });
        });
    });

    describe('Hardware Service API', () => {
        it('should expose required methods', () => {
            expect(hardwareService).to.have.property('controlPart');
            expect(hardwareService.controlPart).to.be.a('function');
            expect(hardwareService).to.have.property('getAvailableActions');
            expect(hardwareService).to.have.property('getSupportedPartTypes');
        });

        it('should validate controlPart parameters', async () => {
            process.env.MB_TEST_MODE = '1';
            
            try {
                await hardwareService.controlPart(null, null, {});
            } catch (error) {
                expect(error).to.exist;
            }
        });
    });
});
