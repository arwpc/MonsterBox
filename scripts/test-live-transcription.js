#!/usr/bin/env node
/**
 * Live Transcription WebSocket Test
 * Tests the ElevenLabs WebSocket connection with character selection
 */

const WebSocket = require('ws');

class LiveTranscriptionTest {
    constructor(useSecureProxy = false) {
        this.wsUrl = useSecureProxy ? 'wss://127.0.0.1:8872' : 'ws://127.0.0.1:8771';
        this.testCharacterId = 1; // Orlok
        this.ws = null;
        this.sessionId = null;
        this.useSecureProxy = useSecureProxy;
    }

    async runTest() {
        console.log('🧪 Starting Live Transcription WebSocket Test');
        console.log('=' .repeat(50));

        try {
            await this.connectToWebSocket();
            await this.waitForSessionId();
            await this.testCharacterSelection();
            await this.cleanup();

            console.log('✅ All tests passed!');

        } catch (error) {
            console.error('❌ Test failed:', error.message);
            process.exit(1);
        }
    }

    connectToWebSocket() {
        return new Promise((resolve, reject) => {
            console.log(`🔗 Connecting to WebSocket: ${this.wsUrl}`);
            
            this.ws = new WebSocket(this.wsUrl);
            
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);

            this.ws.on('open', () => {
                clearTimeout(timeout);
                console.log('✅ WebSocket connected successfully');
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });

            this.ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket error: ${error.message}`));
            });

            this.ws.on('close', (code, reason) => {
                console.log(`🔌 Connection closed: ${code} ${reason}`);
            });
        });
    }

    handleMessage(message) {
        console.log('📨 Received message:', message);
        
        switch (message.type) {
            case 'connected':
                this.sessionId = message.sessionId;
                console.log(`📋 Session ID: ${this.sessionId}`);
                console.log(`🎭 Available characters: ${message.availableCharacters}`);
                break;
                
            case 'conversation_started':
                console.log(`✅ Conversation started with: ${message.characterName}`);
                break;
                
            case 'error':
                console.error(`❌ Service error: ${message.message}`);
                break;
                
            default:
                console.log(`ℹ️  Unknown message type: ${message.type}`);
        }
    }

    waitForSessionId() {
        return new Promise((resolve, reject) => {
            console.log('⏳ Waiting for session ID...');

            if (this.sessionId) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                reject(new Error('Session ID timeout'));
            }, 5000);

            const checkSessionId = () => {
                if (this.sessionId) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkSessionId, 100);
                }
            };

            checkSessionId();
        });
    }

    async testCharacterSelection() {
        return new Promise((resolve, reject) => {
            console.log(`🎭 Testing character selection with ID: ${this.testCharacterId}`);
            
            if (!this.sessionId) {
                reject(new Error('No session ID available'));
                return;
            }

            // Set up timeout for response
            const timeout = setTimeout(() => {
                reject(new Error('Character selection timeout'));
            }, 10000);

            // Listen for conversation_started or error
            const originalHandler = this.handleMessage.bind(this);
            this.handleMessage = (message) => {
                originalHandler(message);
                
                if (message.type === 'conversation_started') {
                    clearTimeout(timeout);
                    console.log('✅ Character selection successful');
                    resolve();
                } else if (message.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(`Character selection failed: ${message.message}`));
                }
            };

            // Send start conversation message
            const startMessage = {
                type: 'start_conversation',
                characterId: this.testCharacterId
            };
            
            console.log('📤 Sending start conversation message:', startMessage);
            this.ws.send(JSON.stringify(startMessage));
        });
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        
        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Run the test
if (require.main === module) {
    const test = new LiveTranscriptionTest();
    test.runTest().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = LiveTranscriptionTest;
