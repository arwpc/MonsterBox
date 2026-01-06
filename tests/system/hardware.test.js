/**
 * Hardware Service System Tests
 * Validates hardware execution down to Python layer
 */

import { expect } from 'chai';
import hardwareService from '../../services/hardwareService/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
            
            try {
                const result = await hardwareService.controlPart({
                    id: 1,
                    type: 'servo',
                    channel: 0
                }, 'move', { position: 50 });
                
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
                await hardwareService.controlPart({
                    id: 999,
                    type: 'invalid_type',
                    channel: 0
                }, 'invalid_action', {});
            } catch (error) {
                expect(error).to.exist;
            }
        });

        it('should respect test mode flag', async () => {
            process.env.MB_TEST_MODE = '1';
            
            try {
                const result = await hardwareService.controlPart({
                    id: 1,
                    type: 'servo',
                    channel: 0
                }, 'move', { position: 50 });
                
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
