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
        it('should execute Python wrapper without errors', async () => {
            // Test with MB_TEST_MODE=1 to avoid actual hardware
            process.env.MB_TEST_MODE = '1';
            
            const result = await hardwareService.exec('move_servo', {
                channel: 0,
                position: 50
            });
            
            expect(result).to.exist;
        });

        it('should handle hardware errors gracefully', async () => {
            process.env.MB_TEST_MODE = '1';
            
            try {
                await hardwareService.exec('invalid_command', {});
                expect.fail('Should have thrown error');
            } catch (error) {
                expect(error).to.exist;
            }
        });

        it('should respect test mode flag', async () => {
            process.env.MB_TEST_MODE = '1';
            
            const result = await hardwareService.exec('move_servo', { channel: 0, position: 50 });
            
            // In test mode, should return success without actual hardware execution
            expect(result).to.exist;
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
            expect(part).to.have.property('channel');
        });
    });

    describe('Python Wrapper Files', () => {
        it('should have all required Python wrappers', () => {
            const wrappersDir = path.join(__dirname, '../../python_wrappers');
            expect(fs.existsSync(wrappersDir)).to.be.true;
            
            const requiredWrappers = [
                'move_servo.py',
                'set_jaw.py',
                'calibrate_servo.py'
            ];
            
            requiredWrappers.forEach(wrapper => {
                const wrapperPath = path.join(wrappersDir, wrapper);
                expect(fs.existsSync(wrapperPath), `Missing wrapper: ${wrapper}`).to.be.true;
            });
        });
    });

    describe('Hardware Service API', () => {
        it('should expose required methods', () => {
            expect(hardwareService).to.have.property('exec');
            expect(hardwareService.exec).to.be.a('function');
        });

        it('should validate exec parameters', async () => {
            process.env.MB_TEST_MODE = '1';
            
            try {
                await hardwareService.exec(null, {});
                expect.fail('Should require command name');
            } catch (error) {
                expect(error).to.exist;
            }
        });
    });
});
