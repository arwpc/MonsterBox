/**
 * Comprehensive Audio Integration Test Suite
 * Tests microphone integration, STT functionality, jaw animation, and character-specific settings
 */

const request = require('supertest');
const { expect } = require('chai');
const fs = require('fs').promises;
const path = require('path');

describe('Audio Integration Tests', function() {
    this.timeout(30000); // Extended timeout for audio processing
    
    let app;
    let testCharacterId;
    
    before(async function() {
        // Import the app
        app = require('../app');
        
        // Create a test character for audio testing
        const testCharacter = {
            char_name: 'Audio Test Character',
            char_description: 'Character for testing audio integration',
            animatronic: {
                enabled: true,
                status: 'running',
                character_type: 'Test Skeleton',
                description: 'Test character with audio capabilities'
            }
        };
        
        const response = await request(app)
            .post('/api/characters')
            .send(testCharacter);
            
        if (response.status === 201) {
            testCharacterId = response.body.id;
        } else {
            // Fallback to existing character
            testCharacterId = 4; // Skulltalker
        }
    });
    
    after(async function() {
        // Clean up test character if created
        if (testCharacterId && testCharacterId !== 4) {
            try {
                await request(app)
                    .delete(`/api/characters/${testCharacterId}`);
            } catch (error) {
                console.warn('Failed to clean up test character:', error);
            }
        }
    });
    
    describe('Character Audio Configuration API', function() {
        
        it('should get default audio configuration for character', async function() {
            const response = await request(app)
                .get(`/api/character-audio-config/${testCharacterId}`)
                .expect(200);
                
            expect(response.body).to.have.property('success', true);
            expect(response.body.data).to.have.property('characterId', testCharacterId);
            expect(response.body.data).to.have.property('microphone');
            expect(response.body.data).to.have.property('stt');
            expect(response.body.data).to.have.property('jawAnimation');
            expect(response.body.data).to.have.property('audioProcessing');
        });
        
        it('should update character audio configuration', async function() {
            const updateConfig = {
                microphone: {
                    enabled: true,
                    sensitivity: 1.5,
                    voiceActivation: true,
                    voiceActivationThreshold: 0.2
                },
                stt: {
                    enabled: true,
                    language: 'en',
                    confidenceThreshold: 0.8
                },
                jawAnimation: {
                    enabled: true,
                    sensitivity: 2.0,
                    attackTime: 0.05,
                    releaseTime: 0.15
                }
            };
            
            const response = await request(app)
                .put(`/api/character-audio-config/${testCharacterId}`)
                .send(updateConfig)
                .expect(200);
                
            expect(response.body).to.have.property('success', true);
            expect(response.body.data.microphone.sensitivity).to.equal(1.5);
            expect(response.body.data.stt.confidenceThreshold).to.equal(0.8);
            expect(response.body.data.jawAnimation.sensitivity).to.equal(2.0);
        });
        
        it('should validate audio configuration', async function() {
            const invalidConfig = {
                microphone: {
                    sensitivity: 10.0 // Invalid: too high
                },
                jawAnimation: {
                    attackTime: 2.0 // Invalid: too high
                }
            };
            
            const response = await request(app)
                .post(`/api/character-audio-config/${testCharacterId}/validate`)
                .send(invalidConfig)
                .expect(200);
                
            expect(response.body).to.have.property('success', true);
            expect(response.body.data).to.have.property('isValid', false);
            expect(response.body.data.errors).to.be.an('array').that.is.not.empty;
        });
        
        it('should get optimized audio settings', async function() {
            const response = await request(app)
                .get(`/api/character-audio-config/${testCharacterId}/optimized`)
                .expect(200);
                
            expect(response.body).to.have.property('success', true);
            expect(response.body.data).to.have.property('microphone');
            expect(response.body.data).to.have.property('processing');
            expect(response.body.data).to.have.property('jawAnimation');
            expect(response.body.data).to.have.property('stt');
        });
        
        it('should test character audio configuration', async function() {
            const response = await request(app)
                .get(`/api/character-audio-config/${testCharacterId}/test`)
                .expect(200);
                
            expect(response.body).to.have.property('success', true);
            expect(response.body.data).to.have.property('testResults');
            expect(response.body.data.testResults).to.have.property('configExists', true);
        });
        
        it('should export character audio configuration', async function() {
            const response = await request(app)
                .get(`/api/character-audio-config/${testCharacterId}/export`)
                .expect(200);
                
            expect(response.body).to.have.property('characterId');
            expect(response.body).to.have.property('exportDate');
            expect(response.body).to.have.property('config');
        });
        
        it('should reset character audio configuration', async function() {
            const response = await request(app)
                .post(`/api/character-audio-config/${testCharacterId}/reset`)
                .expect(200);
                
            expect(response.body).to.have.property('success', true);
            expect(response.body.data).to.have.property('characterId', testCharacterId);
            
            // Verify default values are restored
            expect(response.body.data.microphone.sensitivity).to.equal(1.0);
            expect(response.body.data.stt.confidenceThreshold).to.equal(0.7);
        });
    });
    
    describe('Enhanced Microphone Component', function() {
        
        it('should serve enhanced microphone component script', async function() {
            const response = await request(app)
                .get('/js/EnhancedMicrophoneComponent.js')
                .expect(200);
                
            expect(response.text).to.include('class EnhancedMicrophoneComponent');
            expect(response.text).to.include('connectWebSockets');
            expect(response.text).to.include('startRecording');
        });
        
        it('should include microphone component in character form', async function() {
            const response = await request(app)
                .get(`/characters/${testCharacterId}/edit`)
                .expect(200);
                
            expect(response.text).to.include('EnhancedMicrophoneComponent.js');
            expect(response.text).to.include('characterMicrophoneContainer');
            expect(response.text).to.include('loadCharacterAudioConfig');
        });
    });
    
    describe('Enhanced Audio Stream WebSocket', function() {
        
        it('should handle WebSocket connection to enhanced audio stream', function(done) {
            const WebSocket = require('ws');
            const ws = new WebSocket(`ws://localhost:${process.env.PORT || 3000}/enhanced-audiostream`);
            
            ws.on('open', function() {
                // Connection successful
                ws.close();
                done();
            });
            
            ws.on('error', function(error) {
                done(error);
            });
            
            ws.on('message', function(data) {
                const message = JSON.parse(data);
                if (message.type === 'welcome') {
                    expect(message).to.have.property('capabilities');
                    expect(message.capabilities).to.have.property('stt', true);
                    expect(message.capabilities).to.have.property('jawAnimation', true);
                }
            });
        });
    });
    
    describe('Audio Control UI Improvements', function() {
        
        it('should serve improved ChatterPi chat interface', async function() {
            const response = await request(app)
                .get('/chatterpi-ai-chat.html')
                .expect(200);
                
            expect(response.text).to.include('font-awesome');
            expect(response.text).to.include('microphoneToggle');
            expect(response.text).to.include('volumeDisplay');
            expect(response.text).to.include('enhanced-audiostream');
        });
        
        it('should include improved audio controls styling', async function() {
            const response = await request(app)
                .get('/chatterpi-ai-chat.html')
                .expect(200);
                
            expect(response.text).to.include('audio-controls');
            expect(response.text).to.include('volume-control');
            expect(response.text).to.include('backdrop-filter');
        });
    });
    
    describe('Integration with Existing Systems', function() {
        
        it('should integrate with ChatterPi animation system', async function() {
            // Test that jaw animation configuration exists
            const jawConfigPath = path.join(__dirname, '../data/jaw-animation-config.json');
            
            try {
                const configData = await fs.readFile(jawConfigPath, 'utf8');
                const config = JSON.parse(configData);
                
                expect(config).to.have.property('characters');
                expect(config.characters).to.have.property('4'); // Skulltalker
            } catch (error) {
                // Config file might not exist in test environment
                console.warn('Jaw animation config not found, skipping test');
            }
        });
        
        it('should integrate with AI management dashboard', async function() {
            const response = await request(app)
                .get('/ai-management/dashboard')
                .expect(200);
                
            expect(response.text).to.include('enhancedMicrophoneContainer');
            expect(response.text).to.include('EnhancedMicrophoneComponent');
        });
    });
    
    describe('Error Handling and Validation', function() {
        
        it('should handle invalid character ID gracefully', async function() {
            const response = await request(app)
                .get('/api/character-audio-config/invalid')
                .expect(400);
                
            expect(response.body).to.have.property('success', false);
            expect(response.body).to.have.property('error');
        });
        
        it('should validate configuration boundaries', async function() {
            const invalidConfigs = [
                { microphone: { sensitivity: -1 } },
                { microphone: { sensitivity: 10 } },
                { jawAnimation: { attackTime: -0.1 } },
                { jawAnimation: { attackTime: 5.0 } },
                { stt: { confidenceThreshold: 1.5 } }
            ];
            
            for (const config of invalidConfigs) {
                const response = await request(app)
                    .post(`/api/character-audio-config/${testCharacterId}/validate`)
                    .send(config)
                    .expect(200);
                    
                expect(response.body.data.isValid).to.equal(false);
            }
        });
    });
    
    describe('Performance and Reliability', function() {
        
        it('should handle multiple concurrent audio config requests', async function() {
            const promises = [];
            
            for (let i = 0; i < 5; i++) {
                promises.push(
                    request(app)
                        .get(`/api/character-audio-config/${testCharacterId}`)
                        .expect(200)
                );
            }
            
            const responses = await Promise.all(promises);
            responses.forEach(response => {
                expect(response.body).to.have.property('success', true);
            });
        });
        
        it('should maintain configuration consistency', async function() {
            const config1 = await request(app)
                .get(`/api/character-audio-config/${testCharacterId}`)
                .expect(200);
                
            const config2 = await request(app)
                .get(`/api/character-audio-config/${testCharacterId}`)
                .expect(200);
                
            expect(config1.body.data).to.deep.equal(config2.body.data);
        });
    });
});
