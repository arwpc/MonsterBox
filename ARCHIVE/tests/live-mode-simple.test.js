const { expect } = require('chai');
const request = require('supertest');
const app = require('../app');

describe('🎙️ Live Mode Integration - Simple Tests', function() {
    this.timeout(30000);
    
    describe('Enhanced Test Chat Page', function() {
        
        it('should load the test chat page with Live Mode button', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check that the page contains Live Mode elements
                    expect(res.text).to.include('Live Mode');
                    expect(res.text).to.include('live-mode-toggle');
                    expect(res.text).to.include('liveModeToggle');
                    expect(res.text).to.include('liveModeStatus');
                    expect(res.text).to.include('🎙️');
                    
                    done();
                });
        });
        
        it('should include Live Mode CSS styling', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check for Live Mode specific CSS
                    expect(res.text).to.include('.live-mode-toggle.active');
                    expect(res.text).to.include('listening');
                    expect(res.text).to.include('speaking');
                    expect(res.text).to.include('processing');
                    expect(res.text).to.include('@keyframes wave');
                    expect(res.text).to.include('@keyframes spin');
                    
                    done();
                });
        });
        
        it('should include Live Mode JavaScript functionality', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check that the page includes the enhanced test chat script
                    expect(res.text).to.include('/js/enhanced-test-chat.js');
                    expect(res.text).to.include('EnhancedTestChat');
                    
                    done();
                });
        });
        
        it('should load with AI-enabled characters available', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check that AI-enabled characters are available
                    expect(res.text).to.include('hasAI');
                    expect(res.text).to.include('Skulltalker');
                    
                    done();
                });
        });
    });
    
    describe('Enhanced Test Chat JavaScript File', function() {
        
        it('should serve the enhanced test chat JavaScript file', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .expect('Content-Type', /javascript/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check for Live Mode specific functions
                    expect(res.text).to.include('toggleLiveMode');
                    expect(res.text).to.include('startLiveMode');
                    expect(res.text).to.include('stopLiveMode');
                    expect(res.text).to.include('startContinuousListening');
                    expect(res.text).to.include('processLiveModeAudio');
                    expect(res.text).to.include('processLiveModeMessage');
                    expect(res.text).to.include('speakLiveModeText');
                    expect(res.text).to.include('updateLiveModeStatus');
                    expect(res.text).to.include('isLiveModeActive');
                    expect(res.text).to.include('liveModeState');
                    
                    done();
                });
        });
        
        it('should include Live Mode state management', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check for state management variables
                    expect(res.text).to.include('liveModeTimeout');
                    expect(res.text).to.include('liveModeAudio');
                    expect(res.text).to.include('liveModeState');
                    expect(res.text).to.include('idle');
                    expect(res.text).to.include('listening');
                    expect(res.text).to.include('processing');
                    expect(res.text).to.include('speaking');
                    
                    done();
                });
        });
        
        it('should include Live Mode validation logic', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check for validation messages
                    expect(res.text).to.include('Please select a character first');
                    expect(res.text).to.include('Live Mode requires a character with AI capabilities');
                    expect(res.text).to.include('Cannot toggle STT while Live Mode is active');
                    
                    done();
                });
        });
        
        it('should include Live Mode audio processing', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check for audio processing functions
                    expect(res.text).to.include('getUserMedia');
                    expect(res.text).to.include('MediaRecorder');
                    expect(res.text).to.include('restartContinuousListening');
                    expect(res.text).to.include('clearChatHistory');
                    expect(res.text).to.include('Live Mode activated');
                    
                    done();
                });
        });
    });
    
    describe('API Integration', function() {
        
        it('should support voice transcription endpoint', function(done) {
            const testAudioData = Buffer.from('test audio data').toString('base64');
            
            request(app)
                .post('/api/voice/transcribe')
                .send({
                    audioData: testAudioData,
                    character: 'skulltalker',
                    characterId: 4,
                    sttOnly: true
                })
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should return a response (success or error)
                    expect(res.body).to.have.property('success');
                    
                    done();
                });
        });
        
        it('should support AI chat endpoint', function(done) {
            request(app)
                .post('/api/ai/chat')
                .send({
                    message: 'Hello, test message',
                    character: 'skulltalker',
                    characterId: 4
                })
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should return a response (success or error)
                    expect(res.body).to.have.property('success');
                    
                    done();
                });
        });
        
        it('should support TTS endpoint', function(done) {
            request(app)
                .post('/api/voice/speak')
                .send({
                    text: 'Hello, this is a test',
                    character: 'skulltalker',
                    characterId: 4,
                    voiceConfig: {}
                })
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should return a response (success or error)
                    expect(res.body).to.have.property('success');
                    
                    done();
                });
        });
    });
    
    describe('Live Mode Feature Completeness', function() {
        
        it('should have all required Live Mode components in the page', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    const requiredElements = [
                        'liveModeToggle',
                        'liveModeStatus',
                        'live-mode-toggle',
                        'voice-controls',
                        'Enhanced Test Chat'
                    ];
                    
                    requiredElements.forEach(element => {
                        expect(res.text).to.include(element);
                    });
                    
                    done();
                });
        });
        
        it('should have all required Live Mode functions in JavaScript', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    const requiredFunctions = [
                        'toggleLiveMode',
                        'startLiveMode',
                        'stopLiveMode',
                        'startContinuousListening',
                        'stopContinuousListening',
                        'processLiveModeAudio',
                        'processLiveModeMessage',
                        'speakLiveModeText',
                        'restartContinuousListening',
                        'updateLiveModeStatus',
                        'clearChatHistory'
                    ];
                    
                    requiredFunctions.forEach(func => {
                        expect(res.text).to.include(func);
                    });
                    
                    done();
                });
        });
    });
});
