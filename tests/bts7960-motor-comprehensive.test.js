/**
 * BTS7960 Motor Comprehensive Test Suite
 * Tests full CRUD operations and hardware control for BTS7960 motor drivers
 * 
 * This test suite verifies:
 * 1. Create BTS7960 motor parts with all required pins
 * 2. Read/retrieve BTS7960 motor parts
 * 3. Update BTS7960 motor parts (edit pins, settings)
 * 4. Delete BTS7960 motor parts
 * 5. Hardware control (forward, reverse, stop)
 * 6. Integration with calibration system
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = 'http://localhost:3000';
const HW_EXPECT = String(process.env.MONSTERBOX_HARDWARE_AVAILABLE || '').toLowerCase() === 'true';

describe('BTS7960 Motor - Comprehensive CRUD & Control', () => {
    let testPartId = null;

    // Helper function to create a BTS7960 motor part
    async function createBTS7960Motor(name, rpwmPin, lpwmPin, renPin, lenPin) {
        const res = await request(BASE_URL)
            .post('/setup/parts/api/parts')
            .send({
                name: name,
                type: 'motor',
                description: 'Test BTS7960 motor',
                controlBoard: 'BTS7960',
                rpwmPin: rpwmPin,
                lpwmPin: lpwmPin,
                renPin: renPin,
                lenPin: lenPin,
                maxDuration: 5000
            })
            .expect(201);
        
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('part');
        expect(res.body.part).to.have.property('id');
        return res.body.part;
    }

    // Helper function to delete a part
    async function deletePart(id) {
        const res = await request(BASE_URL)
            .delete(`/setup/parts/api/parts/${id}`)
            .expect(200);
        
        expect(res.body).to.have.property('success', true);
    }

    describe('CREATE - BTS7960 Motor Part', () => {
        it('should create a BTS7960 motor with all required pins', async () => {
            const part = await createBTS7960Motor('Test BTS7960 Create', 23, 24, 25, 25);
            
            expect(part).to.have.property('name', 'Test BTS7960 Create');
            expect(part).to.have.property('type', 'motor');
            expect(part).to.have.property('controlBoard', 'BTS7960');
            expect(part).to.have.property('rpwmPin', 23);
            expect(part).to.have.property('lpwmPin', 24);
            expect(part).to.have.property('renPin', 25);
            expect(part).to.have.property('lenPin', 25);
            expect(part).to.have.property('maxDuration', 5000);
            
            testPartId = part.id;
        });

        it('should create a BTS7960 motor with ganged enable pins', async () => {
            const part = await createBTS7960Motor('Test BTS7960 Ganged', 27, 22, 17, 17);
            
            expect(part).to.have.property('renPin', 17);
            expect(part).to.have.property('lenPin', 17);
            
            await deletePart(part.id);
        });
    });

    describe('READ - BTS7960 Motor Part', () => {
        it('should retrieve a BTS7960 motor by ID', async () => {
            const res = await request(BASE_URL)
                .get(`/setup/parts/api/parts/${testPartId}`)
                .expect(200);
            
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('part');
            expect(res.body.part).to.have.property('id', testPartId);
            expect(res.body.part).to.have.property('controlBoard', 'BTS7960');
            expect(res.body.part).to.have.property('rpwmPin');
            expect(res.body.part).to.have.property('lpwmPin');
            expect(res.body.part).to.have.property('renPin');
            expect(res.body.part).to.have.property('lenPin');
        });

        it('should list all parts including BTS7960 motors', async () => {
            const res = await request(BASE_URL)
                .get('/setup/parts/api/parts')
                .expect(200);
            
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('parts');
            expect(res.body.parts).to.be.an('array');
            
            const bts7960Motors = res.body.parts.filter(p => 
                p.type === 'motor' && p.controlBoard === 'BTS7960'
            );
            expect(bts7960Motors.length).to.be.at.least(1);
        });
    });

    describe('UPDATE - BTS7960 Motor Part', () => {
        it('should update BTS7960 motor pins', async () => {
            const res = await request(BASE_URL)
                .put(`/setup/parts/api/parts/${testPartId}`)
                .send({
                    rpwmPin: 26,
                    lpwmPin: 27,
                    renPin: 28,
                    lenPin: 28
                })
                .expect(200);
            
            expect(res.body).to.have.property('success', true);
            expect(res.body.part).to.have.property('rpwmPin', 26);
            expect(res.body.part).to.have.property('lpwmPin', 27);
            expect(res.body.part).to.have.property('renPin', 28);
            expect(res.body.part).to.have.property('lenPin', 28);
        });

        it('should update BTS7960 motor name and description', async () => {
            const res = await request(BASE_URL)
                .put(`/setup/parts/api/parts/${testPartId}`)
                .send({
                    name: 'Updated BTS7960 Motor',
                    description: 'Updated description for BTS7960 motor'
                })
                .expect(200);
            
            expect(res.body).to.have.property('success', true);
            expect(res.body.part).to.have.property('name', 'Updated BTS7960 Motor');
            expect(res.body.part).to.have.property('description', 'Updated description for BTS7960 motor');
        });

        it('should update maxDuration setting', async () => {
            const res = await request(BASE_URL)
                .put(`/setup/parts/api/parts/${testPartId}`)
                .send({
                    maxDuration: 8000
                })
                .expect(200);
            
            expect(res.body).to.have.property('success', true);
            expect(res.body.part).to.have.property('maxDuration', 8000);
        });
    });

    describe('CONTROL - BTS7960 Motor Hardware', () => {
        it('should test motor forward direction', async () => {
            const res = await request(BASE_URL)
                .post(`/setup/parts/api/parts/${testPartId}/test`)
                .send({
                    action: 'control',
                    params: {
                        direction: 'forward',
                        speed: 50,
                        duration: 1000
                    }
                })
                .expect(200);
            
            expect(res.body).to.have.property('testResult');
            expect(res.body.testResult).to.have.property('action', 'control');
            expect(res.body.testResult.testParams).to.have.property('direction', 'forward');
            
            if (HW_EXPECT) {
                expect(res.body).to.have.property('success', true);
                expect(res.body.testResult).to.have.property('result', 'HARDWARE_SUCCESS');
            }
        });

        it('should test motor reverse direction', async () => {
            const res = await request(BASE_URL)
                .post(`/setup/parts/api/parts/${testPartId}/test`)
                .send({
                    action: 'control',
                    params: {
                        direction: 'reverse',
                        speed: 50,
                        duration: 1000
                    }
                })
                .expect(200);
            
            expect(res.body).to.have.property('testResult');
            expect(res.body.testResult.testParams).to.have.property('direction', 'reverse');
            
            if (HW_EXPECT) {
                expect(res.body).to.have.property('success', true);
                expect(res.body.testResult).to.have.property('result', 'HARDWARE_SUCCESS');
            }
        });

        it('should test motor stop', async () => {
            const res = await request(BASE_URL)
                .post(`/setup/parts/api/parts/${testPartId}/test`)
                .send({
                    action: 'stop'
                })
                .expect(200);
            
            expect(res.body).to.have.property('testResult');
            expect(res.body.testResult).to.have.property('action', 'stop');
            
            if (HW_EXPECT) {
                expect(res.body).to.have.property('success', true);
            }
        });

        it('should test motor with different speeds', async () => {
            const speeds = [25, 50, 75, 100];
            
            for (const speed of speeds) {
                const res = await request(BASE_URL)
                    .post(`/setup/parts/api/parts/${testPartId}/test`)
                    .send({
                        action: 'control',
                        params: {
                            direction: 'forward',
                            speed: speed,
                            duration: 500
                        }
                    })
                    .expect(200);
                
                expect(res.body.testResult.testParams).to.have.property('speed', speed);
            }
        });
    });

    describe('DELETE - BTS7960 Motor Part', () => {
        it('should delete the BTS7960 motor part', async () => {
            await deletePart(testPartId);
            
            // Verify part is deleted
            const res = await request(BASE_URL)
                .get(`/setup/parts/api/parts/${testPartId}`)
                .expect(404);
            
            expect(res.body).to.have.property('success', false);
        });
    });

    describe('INTEGRATION - Groundbreaker Head', () => {
        it('should verify Groundbreaker Head part exists', async () => {
            const res = await request(BASE_URL)
                .get('/setup/parts/api/parts')
                .expect(200);
            
            const groundbreaker = res.body.parts.find(p => p.name === 'Groundbreaker Head');
            expect(groundbreaker).to.exist;
            expect(groundbreaker).to.have.property('type', 'motor');
            expect(groundbreaker).to.have.property('controlBoard', 'BTS7960');
            expect(groundbreaker).to.have.property('rpwmPin', 27);
            expect(groundbreaker).to.have.property('lpwmPin', 22);
            expect(groundbreaker).to.have.property('renPin', 17);
            expect(groundbreaker).to.have.property('lenPin', 17);
        });

        if (HW_EXPECT) {
            it('should control Groundbreaker Head forward', async () => {
                const res = await request(BASE_URL)
                    .get('/setup/parts/api/parts')
                    .expect(200);
                
                const groundbreaker = res.body.parts.find(p => p.name === 'Groundbreaker Head');
                
                const testRes = await request(BASE_URL)
                    .post(`/setup/parts/api/parts/${groundbreaker.id}/test`)
                    .send({
                        action: 'control',
                        params: {
                            direction: 'forward',
                            speed: 50,
                            duration: 2000
                        }
                    })
                    .expect(200);
                
                expect(testRes.body).to.have.property('success', true);
                expect(testRes.body.testResult).to.have.property('result', 'HARDWARE_SUCCESS');
            });
        }
    });
});

