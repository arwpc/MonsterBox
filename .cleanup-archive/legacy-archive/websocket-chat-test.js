#!/usr/bin/env node
/**
 * MonsterBox 4.0 - WebSocket Chat Test
 * Tests the real-time WebSocket chat functionality
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8795';
const TEST_AGENT_ID = 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n'; // Orlok

async function testWebSocketChat() {
    console.log('🧪 MonsterBox WebSocket Chat Test');
    console.log('=' .repeat(40));
    
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let sessionId = null;
        let conversationStarted = false;
        let responseReceived = false;
        let startTime = null;
        
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Test timeout - no response received'));
        }, 30000);
        
        ws.on('open', () => {
            console.log('✅ Connected to WebSocket server');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📨 Received:', message.type, message.message || message.text || '');
                
                switch (message.type) {
                    case 'connected':
                        sessionId = message.sessionId;
                        console.log('🎭 Session ID:', sessionId);
                        
                        // Start conversation
                        console.log('🚀 Starting conversation with agent:', TEST_AGENT_ID);
                        ws.send(JSON.stringify({
                            type: 'start_conversation',
                            agentId: TEST_AGENT_ID
                        }));
                        break;
                        
                    case 'conversation_started':
                        conversationStarted = true;
                        console.log('✅ Conversation started, sending test message...');
                        
                        // Send test message
                        startTime = Date.now();
                        ws.send(JSON.stringify({
                            type: 'send_message',
                            text: 'Hello! This is a WebSocket test.'
                        }));
                        break;
                        
                    case 'agent_response':
                        responseReceived = true;
                        const responseTime = Date.now() - startTime;
                        console.log('🤖 Agent response received!');
                        console.log('   Text:', message.text);
                        console.log('   Response time:', responseTime + 'ms');
                        
                        if (responseTime < 5000) {
                            console.log('🎉 EXCELLENT! Response time under 5 seconds');
                        } else if (responseTime < 10000) {
                            console.log('✅ GOOD! Response time under 10 seconds');
                        } else {
                            console.log('⚠️  SLOW! Response time over 10 seconds');
                        }
                        
                        // End conversation
                        ws.send(JSON.stringify({
                            type: 'end_conversation'
                        }));
                        break;
                        
                    case 'conversation_ended':
                        console.log('🔚 Conversation ended');
                        clearTimeout(timeout);
                        ws.close();
                        
                        if (responseReceived) {
                            resolve({
                                success: true,
                                sessionId: sessionId,
                                responseTime: Date.now() - startTime
                            });
                        } else {
                            reject(new Error('No agent response received'));
                        }
                        break;
                        
                    case 'error':
                        console.error('❌ Server error:', message.message);
                        clearTimeout(timeout);
                        ws.close();
                        reject(new Error('Server error: ' + message.message));
                        break;
                }
                
            } catch (error) {
                console.error('❌ Failed to parse message:', error);
            }
        });
        
        ws.on('close', (code, reason) => {
            console.log('🔌 WebSocket closed:', code, reason.toString());
            clearTimeout(timeout);
        });
        
        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
            clearTimeout(timeout);
            reject(error);
        });
    });
}

async function runTest() {
    try {
        console.log('🔌 Connecting to WebSocket server:', WS_URL);
        const result = await testWebSocketChat();
        
        console.log('\n🎉 TEST PASSED!');
        console.log('✅ WebSocket chat is working correctly');
        console.log('✅ Real-time responses achieved');
        console.log('✅ Session ID:', result.sessionId);
        
        console.log('\n🌐 ACCESS THE CHAT:');
        console.log('   Visit: http://localhost:3000/ai-settings/agents');
        console.log('   Click any "Chat" button for instant responses!');
        
    } catch (error) {
        console.error('\n❌ TEST FAILED!');
        console.error('Error:', error.message);
        console.log('\n🔧 TROUBLESHOOTING:');
        console.log('   1. Make sure MonsterBox server is running (npm start)');
        console.log('   2. Check WebSocket server is listening on port 8795');
        console.log('   3. Verify ElevenLabs API key is configured');
        process.exit(1);
    }
}

runTest();
