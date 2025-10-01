#!/usr/bin/env node
/**
 * MonsterBox 4.0 - Text Response Debug Test
 * Check what text content ElevenLabs is actually sending
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8795';
const TEST_AGENT_ID = 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n'; // Orlok

async function testTextResponses() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let sessionId = null;
        let responses = [];
        
        console.log('🔍 MonsterBox Text Response Debug Test');
        console.log('=' .repeat(50));
        console.log('Checking what text content ElevenLabs sends...\n');
        
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Text debug test timeout'));
        }, 15000);
        
        ws.on('open', () => {
            console.log('✅ WebSocket connected - debugging text responses');
        });
        
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                
                switch (message.type) {
                    case 'connected':
                        sessionId = message.sessionId;
                        console.log(`🎯 Debug session: ${sessionId}`);
                        
                        // Start conversation
                        ws.send(JSON.stringify({
                            type: 'start_conversation',
                            agentId: TEST_AGENT_ID
                        }));
                        break;
                        
                    case 'conversation_started':
                        console.log('🚀 Agent connected - sending test message');
                        console.log('-'.repeat(40));
                        
                        // Send a simple test message
                        ws.send(JSON.stringify({
                            type: 'send_message',
                            text: "Hello Count Orlok, please respond with text"
                        }));
                        
                        // End test after 10 seconds
                        setTimeout(() => {
                            ws.send(JSON.stringify({ type: 'end_conversation' }));
                        }, 10000);
                        break;
                        
                    case 'agent_response':
                        responses.push({
                            text: message.text,
                            hasAudio: !!message.audio,
                            audioSize: message.audio ? message.audio.length : 0,
                            timestamp: Date.now()
                        });
                        
                        console.log(`📨 Agent Response Received:`);
                        console.log(`   📝 Text: "${message.text || 'NO TEXT'}"`);
                        console.log(`   🎵 Audio: ${message.audio ? `Yes (${message.audio.length} chars)` : 'No'}`);
                        console.log(`   📡 Real-time: ${message.realTime ? 'Yes' : 'No'}`);
                        console.log('');
                        break;
                        
                    case 'conversation_ended':
                        console.log('🔚 Debug test completed');
                        clearTimeout(timeout);
                        ws.close();
                        resolve({ responses, sessionId });
                        break;
                        
                    case 'error':
                        console.error('❌ Debug error:', message.message);
                        clearTimeout(timeout);
                        reject(new Error(message.message));
                        break;
                        
                    default:
                        // Ignore other message types for this debug test
                        break;
                }
                
            } catch (error) {
                console.error('❌ Message parsing error:', error);
            }
        });
        
        ws.on('close', () => {
            console.log('🔌 Debug session closed');
            clearTimeout(timeout);
        });
        
        ws.on('error', (error) => {
            console.error('❌ Debug WebSocket error:', error.message);
            clearTimeout(timeout);
            reject(error);
        });
    });
}

async function runTextDebugTest() {
    try {
        const result = await testTextResponses();
        
        console.log('\n🔍 TEXT RESPONSE DEBUG RESULTS');
        console.log('=' .repeat(50));
        
        console.log(`✅ Total responses received: ${result.responses.length}`);
        
        // Analyze text content
        const responsesWithText = result.responses.filter(r => r.text && r.text !== 'Audio response' && r.text !== 'NO TEXT');
        const responsesWithAudio = result.responses.filter(r => r.hasAudio);
        const responsesTextOnly = result.responses.filter(r => r.text && !r.hasAudio);
        const responsesAudioOnly = result.responses.filter(r => r.hasAudio && (!r.text || r.text === 'Audio response'));
        
        console.log(`📝 Responses with meaningful text: ${responsesWithText.length}`);
        console.log(`🎵 Responses with audio: ${responsesWithAudio.length}`);
        console.log(`📝 Text-only responses: ${responsesTextOnly.length}`);
        console.log(`🎵 Audio-only responses: ${responsesAudioOnly.length}`);
        
        console.log('\n📋 DETAILED RESPONSE ANALYSIS:');
        result.responses.forEach((response, i) => {
            console.log(`${i + 1}. Text: "${response.text || 'NONE'}" | Audio: ${response.hasAudio ? 'Yes' : 'No'}`);
        });
        
        console.log('\n🔧 DIAGNOSIS:');
        if (responsesWithText.length === 0) {
            console.log('❌ PROBLEM: ElevenLabs is not sending text responses');
            console.log('   • Only audio data is being received');
            console.log('   • Need to extract text from audio or use different API');
            console.log('   • Consider using transcription or text extraction');
        } else {
            console.log('✅ ElevenLabs is sending text responses');
            console.log('   • Text content is available');
            console.log('   • UI filtering may be the issue');
        }
        
        console.log('\n💡 RECOMMENDATIONS:');
        if (responsesWithText.length === 0) {
            console.log('1. Show placeholder text for audio-only responses');
            console.log('2. Consider using ElevenLabs transcription API');
            console.log('3. Use generic "Agent response" text with audio');
            console.log('4. Focus on audio playback as primary response');
        } else {
            console.log('1. Fix UI text filtering logic');
            console.log('2. Ensure all text responses are displayed');
            console.log('3. Check for text content in all message fields');
        }
        
    } catch (error) {
        console.error('\n❌ TEXT DEBUG TEST FAILED!');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runTextDebugTest();
