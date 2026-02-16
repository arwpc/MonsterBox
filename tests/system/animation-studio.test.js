/**
 * Animation Studio System Tests
 * Validates new step types (jaw-animation, head-tracking) and scene executor integration
 */

import { expect } from 'chai';
import { executeStep } from '../../services/scenes/sceneExecutor.js';

describe('Animation Studio - New Step Types', function() {
    this.timeout(15000);

    before(function() {
        process.env.MB_TEST_MODE = '1';
    });

    describe('executeStep dispatch', () => {
        it('should handle jaw-animation enable step', async function() {
            const step = { type: 'jaw-animation', action: 'enable' };
            const events = [];
            const emit = function(e) { events.push(e); };

            const result = await executeStep(step, 3, emit, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('action');
            // Should emit start and complete events
            expect(events.length).to.be.greaterThanOrEqual(1);
        });

        it('should handle jaw-animation disable step', async function() {
            const step = { type: 'jaw-animation', action: 'disable' };
            const events = [];
            const emit = function(e) { events.push(e); };

            const result = await executeStep(step, 3, emit, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('action', 'disable');
        });

        it('should handle jaw-animation with default action', async function() {
            const step = { type: 'jaw-animation' };
            const result = await executeStep(step, 3, null, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
        });

        it('should handle head-tracking start step', async function() {
            const step = { type: 'head-tracking', action: 'start' };
            const events = [];
            const emit = function(e) { events.push(e); };

            const result = await executeStep(step, 3, emit, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
        });

        it('should handle head-tracking stop step', async function() {
            const step = { type: 'head-tracking', action: 'stop' };
            const events = [];
            const emit = function(e) { events.push(e); };

            const result = await executeStep(step, 3, emit, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
        });

        it('should handle head-tracking with default action', async function() {
            const step = { type: 'head-tracking' };
            const result = await executeStep(step, 3, null, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
        });

        it('should dry-run jaw-animation step', async function() {
            const step = { type: 'jaw-animation', action: 'enable' };
            const result = await executeStep(step, 3, null, { dryRun: true });
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('dryRun', true);
        });

        it('should dry-run head-tracking step', async function() {
            const step = { type: 'head-tracking', action: 'start' };
            const result = await executeStep(step, 3, null, { dryRun: true });
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('dryRun', true);
        });
    });

    describe('Step type validation', () => {
        it('should still reject unknown step types', async function() {
            const step = { type: 'nonexistent-type' };
            try {
                await executeStep(step, 3, null, {});
                expect.fail('Should have thrown for unknown step type');
            } catch (err) {
                expect(err.message).to.include('Unknown step type');
            }
        });

        it('should still handle wait step after new types added', async function() {
            const step = { type: 'wait', duration: 50 };
            const result = await executeStep(step, 3, null, {});
            expect(result).to.exist;
            expect(result).to.have.property('success', true);
        });
    });
});
