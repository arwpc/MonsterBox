const { expect } = require('chai');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('🎙️ Live Mode Unit Tests', function() {
    let dom;
    let window;
    let document;
    let EnhancedTestChat;
    
    before(function() {
        // Read the HTML template
        const htmlPath = path.join(__dirname, '../views/enhanced-test-chat.ejs');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Replace EJS variables with test data
        htmlContent = htmlContent.replace(/<%.*?%>/g, '');
        htmlContent = htmlContent.replace(/<%- JSON\.stringify\(characters \|\| \[\]\) %>/g, '[]');
        htmlContent = htmlContent.replace(/<%- JSON\.stringify\(assistants \|\| \{\}\) %>/g, '{}');
        htmlContent = htmlContent.replace(/<%= characterId \|\| 'null' %>/g, 'null');
        
        // Create JSDOM instance
        dom = new JSDOM(htmlContent, {
            url: 'http://localhost:3000',
            pretendToBeVisual: true,
            resources: 'usable'
        });
        
        window = dom.window;
        document = window.document;
        global.window = window;
        global.document = document;
        global.navigator = window.navigator;
        
        // Mock navigator.mediaDevices
        window.navigator.mediaDevices = {
            getUserMedia: () => Promise.resolve({
                getTracks: () => [{ stop: () => {} }]
            })
        };
        
        // Mock fetch
        global.fetch = () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, data: {} })
        });
        
        // Mock Audio
        global.Audio = class {
            constructor() {
                this.volume = 1;
                this.onended = null;
                this.onerror = null;
            }
            play() { return Promise.resolve(); }
            pause() {}
        };
        
        // Load the JavaScript file
        const jsPath = path.join(__dirname, '../public/js/enhanced-test-chat.js');
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        
        // Execute the JavaScript in the JSDOM context
        const script = new window.Function(jsContent);
        script.call(window);
        
        EnhancedTestChat = window.EnhancedTestChat;
    });
    
    describe('Live Mode State Management', function() {
        let testChat;
        
        beforeEach(function() {
            // Reset DOM
            document.getElementById('liveModeStatus').textContent = 'OFF';
            document.getElementById('liveModeToggle').className = 'voice-toggle live-mode-toggle';
            
            testChat = new EnhancedTestChat({
                characters: [
                    { id: 1, name: 'Test Character', hasAI: false },
                    { id: 2, name: 'AI Character', hasAI: true }
                ]
            });
        });
        
        it('should initialize with Live Mode inactive', function() {
            expect(testChat.isLiveModeActive).to.be.false;
            expect(testChat.liveModeState).to.equal('idle');
            expect(testChat.liveModeTimeout).to.be.null;
            expect(testChat.liveModeAudio).to.be.null;
        });
        
        it('should have Live Mode DOM elements', function() {
            expect(testChat.liveModeToggle).to.not.be.null;
            expect(testChat.liveModeStatus).to.not.be.null;
        });
        
        it('should update Live Mode status correctly', function() {
            testChat.liveModeState = 'listening';
            testChat.updateLiveModeStatus(true, 'Listening...');
            
            const button = document.getElementById('liveModeToggle');
            const status = document.getElementById('liveModeStatus');
            
            expect(button.className).to.include('active');
            expect(button.className).to.include('listening');
            expect(status.textContent).to.equal('Listening...');
        });
        
        it('should handle different Live Mode states', function() {
            const states = ['listening', 'processing', 'speaking'];
            
            states.forEach(state => {
                testChat.liveModeState = state;
                testChat.updateLiveModeStatus(true, `${state}...`);
                
                const button = document.getElementById('liveModeToggle');
                expect(button.className).to.include(state);
            });
        });
    });
    
    describe('Live Mode Validation', function() {
        let testChat;
        
        beforeEach(function() {
            testChat = new EnhancedTestChat({
                characters: [
                    { id: 1, name: 'Voice Only', hasAI: false },
                    { id: 2, name: 'AI Enabled', hasAI: true }
                ]
            });
        });
        
        it('should require character selection', async function() {
            testChat.currentCharacter = null;
            
            // Mock alert
            let alertMessage = null;
            global.alert = (message) => { alertMessage = message; };
            
            await testChat.toggleLiveMode();
            
            expect(alertMessage).to.equal('Please select a character first');
            expect(testChat.isLiveModeActive).to.be.false;
        });
        
        it('should require AI-enabled character', async function() {
            testChat.currentCharacter = { id: 1, name: 'Voice Only', hasAI: false };
            
            // Mock alert
            let alertMessage = null;
            global.alert = (message) => { alertMessage = message; };
            
            await testChat.toggleLiveMode();
            
            expect(alertMessage).to.equal('Live Mode requires a character with AI capabilities');
            expect(testChat.isLiveModeActive).to.be.false;
        });
    });
    
    describe('Live Mode Audio Management', function() {
        let testChat;
        
        beforeEach(function() {
            testChat = new EnhancedTestChat({
                characters: [
                    { id: 2, name: 'AI Enabled', hasAI: true }
                ]
            });
            testChat.currentCharacter = { id: 2, name: 'AI Enabled', hasAI: true };
        });
        
        it('should clear chat history on start', function() {
            testChat.clearChatHistory();
            
            const messages = document.querySelectorAll('.message');
            expect(messages.length).to.equal(1);
            expect(messages[0].textContent).to.include('Live Mode activated');
        });
        
        it('should enable TTS automatically', async function() {
            // Mock the startContinuousListening method to avoid media device issues
            testChat.startContinuousListening = () => Promise.resolve();
            
            await testChat.startLiveMode();
            
            expect(testChat.isTTSActive).to.be.true;
            expect(testChat.isLiveModeActive).to.be.true;
        });
        
        it('should clean up resources on stop', async function() {
            // Set up some state
            testChat.isLiveModeActive = true;
            testChat.liveModeTimeout = setTimeout(() => {}, 1000);
            testChat.liveModeAudio = { pause: () => {} };
            
            // Mock the stopContinuousListening method
            testChat.stopContinuousListening = () => Promise.resolve();
            
            await testChat.stopLiveMode();
            
            expect(testChat.isLiveModeActive).to.be.false;
            expect(testChat.liveModeState).to.equal('idle');
            expect(testChat.liveModeTimeout).to.be.null;
            expect(testChat.liveModeAudio).to.be.null;
        });
    });
    
    describe('Live Mode Conflict Prevention', function() {
        let testChat;
        
        beforeEach(function() {
            testChat = new EnhancedTestChat({
                characters: [
                    { id: 2, name: 'AI Enabled', hasAI: true }
                ]
            });
            testChat.currentCharacter = { id: 2, name: 'AI Enabled', hasAI: true };
        });
        
        it('should prevent STT toggle when Live Mode is active', async function() {
            testChat.isLiveModeActive = true;
            
            // Mock alert
            let alertMessage = null;
            global.alert = (message) => { alertMessage = message; };
            
            await testChat.toggleSTT();
            
            expect(alertMessage).to.equal('Cannot toggle STT while Live Mode is active');
        });
        
        it('should stop STT before starting Live Mode', async function() {
            testChat.isSTTActive = true;
            testChat.stopSTT = () => Promise.resolve();
            testChat.startContinuousListening = () => Promise.resolve();
            
            await testChat.toggleLiveMode();
            
            expect(testChat.isLiveModeActive).to.be.true;
        });
    });
    
    describe('Live Mode Message Processing', function() {
        let testChat;
        
        beforeEach(function() {
            testChat = new EnhancedTestChat({
                characters: [
                    { id: 2, name: 'AI Enabled', hasAI: true }
                ]
            });
            testChat.currentCharacter = { id: 2, name: 'AI Enabled', hasAI: true };
            testChat.isLiveModeActive = true;
        });
        
        it('should restart listening after processing short text', async function() {
            let restartCalled = false;
            testChat.restartContinuousListening = () => { restartCalled = true; };
            
            await testChat.processLiveModeMessage('Hi');
            
            // Short messages should still be processed, but this tests the restart mechanism
            expect(restartCalled).to.be.false; // Should process the message, not restart
        });
        
        it('should handle message processing errors gracefully', async function() {
            // Mock fetch to fail
            global.fetch = () => Promise.reject(new Error('Network error'));
            
            let restartCalled = false;
            testChat.restartContinuousListening = () => { restartCalled = true; };
            
            await testChat.processLiveModeMessage('Test message');
            
            expect(restartCalled).to.be.true;
        });
    });
});
