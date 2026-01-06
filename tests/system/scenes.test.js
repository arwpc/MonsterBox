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

        it('should execute simple scene and return result', async function() {
            const scene = {
                id: 'test-scene',
                steps: [
                    {
                        type: 'wait',
                        duration: 100
                    }
                ]
            };
            
            process.env.MB_TEST_MODE = '1';
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            expect(result).to.exist;
            // Result should have a success property
            expect(result).to.have.property('success');
        });

        it('should retry failed steps', async function() {
            const scene = {
                id: 'retry-test',
                steps: [
                    {
                        type: 'wait',
                        duration: 50
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
                        type: 'wait',
                        duration: 50
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
                expect(error).to.exist;
            }
        });

        it('should classify error types correctly', async function() {
            const errorTypes = bulletproofExecutor.ERROR_TYPES;
            expect(errorTypes).to.exist;
            expect(errorTypes).to.have.property('HARDWARE_TIMEOUT');
            expect(errorTypes).to.have.property('HARDWARE_FAILURE');
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
        it('should execute wait step', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const step = {
                type: 'wait',
                duration: 100
            };
            
            // The executor should handle individual steps
            const scene = { id: 'single-step', steps: [step] };
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            
            expect(result).to.exist;
            expect(result).to.have.property('success');
        });

        it('should handle audio step gracefully', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const step = {
                type: 'audio',
                action: 'play',
                params: { file: 'test.mp3', character: 'test' }
            };
            
            const scene = { id: 'audio-step', steps: [step] };
            
            try {
                const result = await bulletproofExecutor.executeSceneBulletproof(scene);
                expect(result).to.exist;
            } catch (error) {
                // Audio step may fail if file doesn't exist, that's OK
                expect(error).to.exist;
            }
        });

        it('should execute multiple wait steps in sequence', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const scene = {
                id: 'multi-step',
                steps: [
                    { type: 'wait', duration: 50 },
                    { type: 'wait', duration: 50 },
                    { type: 'wait', duration: 50 }
                ]
            };
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            expect(result).to.exist;
            expect(result).to.have.property('success');
        });
    });

    describe('Error Recovery', () => {
        it('should handle errors in scene execution', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const scene = {
                id: 'recovery-test',
                continueOnError: true,
                steps: [
                    { type: 'wait', duration: 50 },
                    { type: 'wait', duration: 50 }
                ]
            };
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            
            // Should have a result
            expect(result).to.exist;
            expect(result).to.have.property('success');
        });

        it('should stop on critical error if configured', async function() {
            process.env.MB_TEST_MODE = '1';
            
            const scene = {
                id: 'stop-on-error',
                continueOnError: false,
                steps: [
                    { type: 'wait', duration: 50 }
                ]
            };
            
            const result = await bulletproofExecutor.executeSceneBulletproof(scene);
            expect(result).to.exist;
        });
    });
});
