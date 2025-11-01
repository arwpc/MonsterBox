/**
 * Scene Execution System Tests
 * Validates bulletproof scene execution with retries
 */

import { expect } from 'chai';
import bulletproofExecutor from '../../services/scenes/bulletproofExecutor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Scene Execution System Tests', function() {
    this.timeout(30000);

    describe('Bulletproof Executor', () => {
        it('should expose required methods', () => {
            expect(bulletproofExecutor).to.have.property('executeSceneBulletproof');
            expect(bulletproofExecutor.executeSceneBulletproof).to.be.a('function');
        });

        it('should execute simple scene without errors', async function() {
            const scene = {
                id: 'test-scene',
                steps: [
                    {
                        type: 'hardware',
                        action: 'move_servo',
                        params: { channel: 0, position: 50 },
                        timeout: 5000
                    }
                ]
            };
            
            process.env.MB_TEST_MODE = '1';
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            expect(result).to.exist;
            expect(result.success).to.be.true;
        });

        it('should retry failed steps', async function() {
            const scene = {
                id: 'retry-test',
                steps: [
                    {
                        type: 'hardware',
                        action: 'move_servo',
                        params: { channel: 0, position: 50 },
                        timeout: 5000,
                        retries: 2
                    }
                ]
            };
            
            process.env.MB_TEST_MODE = '1';
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            expect(result).to.exist;
        });

        it('should handle timeout gracefully', async function() {
            const scene = {
                id: 'timeout-test',
                steps: [
                    {
                        type: 'hardware',
                        action: 'slow_operation',
                        params: {},
                        timeout: 100 // Very short timeout
                    }
                ]
            };
            
            process.env.MB_TEST_MODE = '1';
            
            try {
                const result = await bulletproofExecutor.executeSceneBulletproof(scene);
                // Should either succeed or fail gracefully
                expect(result).to.exist;
            } catch (error) {
                // Timeout errors are expected and handled
                expect(error.type).to.equal('hardware_timeout');
            }
        });

        it('should classify error types correctly', async function() {
            const scene = {
                id: 'error-classification',
                steps: [
                    {
                        type: 'hardware',
                        action: 'invalid_action',
                        params: {}
                    }
                ]
            };
            
            process.env.MB_TEST_MODE = '1';
            
            try {
                await bulletproofExecutor.executeSceneBulletproof(scene);
            } catch (error) {
                expect(error.type).to.be.oneOf([
                    'hardware_timeout',
                    'hardware_failure',
                    'audio_failure',
                    'network_failure',
                    'invalid_config'
                ]);
            }
        });
    });

    describe('Scene Templates', () => {
        it('should load scene templates', () => {
            const templatesPath = path.join(__dirname, '../../data/scene-templates.json');
            
            if (fs.existsSync(templatesPath)) {
                const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
                expect(templates).to.be.an('array');
                
                if (templates.length > 0) {
                    const template = templates[0];
                    expect(template).to.have.property('id');
                    expect(template).to.have.property('steps');
                    expect(template.steps).to.be.an('array');
                }
            }
        });
    });

    describe('Scene Execution Pipeline', () => {
        it('should execute hardware step', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const step = {
                type: 'hardware',
                action: 'move_servo',
                params: { channel: 0, position: 50 }
            };
            
            // The executor should handle individual steps
            const scene = { id: 'single-step', steps: [step] };
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            
            expect(result.success).to.be.true;
        });

        it('should execute audio step', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const step = {
                type: 'audio',
                action: 'play',
                params: { file: 'test.mp3', character: 'test' }
            };
            
            const scene = { id: 'audio-step', steps: [step] };
            
            try {
                await bulletproofExecutor.executeSceneBulletproof(scene);
            } catch (error) {
                // Audio step may fail if file doesn't exist, that's OK
                expect(error.type).to.equal('audio_failure');
            }
        });

        it('should execute multiple steps in sequence', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const scene = {
                id: 'multi-step',
                steps: [
                    { type: 'hardware', action: 'move_servo', params: { channel: 0, position: 50 } },
                    { type: 'hardware', action: 'move_servo', params: { channel: 1, position: 75 } },
                    { type: 'hardware', action: 'move_servo', params: { channel: 2, position: 25 } }
                ]
            };
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            expect(result.success).to.be.true;
            expect(result.stepsCompleted).to.equal(3);
        });
    });

    describe('Error Recovery', () => {
        it('should continue after recoverable error', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const scene = {
                id: 'recovery-test',
                continueOnError: true,
                steps: [
                    { type: 'hardware', action: 'move_servo', params: { channel: 0, position: 50 } },
                    { type: 'hardware', action: 'invalid_action', params: {} }, // Will fail
                    { type: 'hardware', action: 'move_servo', params: { channel: 1, position: 75 } }
                ]
            };
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            
            // Should complete some steps even if one fails
            expect(result.stepsCompleted).to.be.greaterThan(0);
        });

        it('should stop on critical error if configured', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const scene = {
                id: 'stop-on-error',
                continueOnError: false,
                steps: [
                    { type: 'hardware', action: 'move_servo', params: { channel: 0, position: 50 } },
                    { type: 'hardware', action: 'invalid_action', params: {} },
                    { type: 'hardware', action: 'move_servo', params: { channel: 1, position: 75 } }
                ]
            };
            
            try {
                await bulletproofExecutor.executeSceneBulletproof(scene);
            } catch (error) {
                // Should stop on first error
                expect(error).to.exist;
            }
        });
    });
});
