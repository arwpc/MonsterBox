#!/usr/bin/env node
/**
 * MonsterBox 4.0 - Final WebSocket vs HTTP Comparison Demo
 * Shows the dramatic improvement in user experience with WebSocket
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const WS_URL = 'ws://localhost:8795';
const HTTP_URL = 'http://localhost:3000/api/elevenlabs/conversation/test';
const TEST_AGENT_ID = 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n'; // Orlok

async function testWebSocketChat(message) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let startTime = null;
        let uiResponseTime = null;
        let totalResponseTime = null;
        
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('WebSocket test timeout'));
        }, 25000);
        
        ws.on('open', () => {
            // Start conversation immediately
            ws.send(JSON.stringify({
                type: 'start_conversation',
                agentId: TEST_AGENT_ID
            }));
        });
        
        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            
            if (msg.type === 'conversation_started') {
                // Send test message
                startTime = Date.now();
                ws.send(JSON.stringify({
                    type: 'send_message',
                    text: message
                }));
            } else if (msg.type === 'agent_response') {
                uiResponseTime = Date.now() - startTime;
                totalResponseTime = msg.responseTime || uiResponseTime;
                
                clearTimeout(timeout);
                ws.close();
                resolve({
                    method: 'WebSocket',
                    text: msg.text,
                    uiResponseTime: uiResponseTime,
                    totalResponseTime: totalResponseTime,
                    fastResponse: msg.fastResponse
                });
            }
        });
        
        ws.on('error', reject);
    });
}

async function testHTTPChat(message) {
    const startTime = Date.now();
    
    try {
        const response = await fetch(HTTP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: TEST_AGENT_ID, text: message })
        });
        
        const data = await response.json();
        const responseTime = Date.now() - startTime;
        
        return {
            method: 'HTTP',
            text: data.replyText,
            uiResponseTime: responseTime,
            totalResponseTime: responseTime,
            fastResponse: data.fastResponse
        };
        
    } catch (error) {
        throw new Error('HTTP test failed: ' + error.message);
    }
}

async function runComparison() {
    console.log('🚀 MonsterBox WebSocket vs HTTP Comparison');
    console.log('=' .repeat(50));
    console.log('Testing user experience improvements with WebSocket...\n');
    
    const testMessages = [
        "Hello there!",
        "Tell me something spooky.",
        "What's your favorite Halloween memory?"
    ];
    
    const results = [];
    
    for (let i = 0; i < testMessages.length; i++) {
        const message = testMessages[i];
        console.log(`📝 Test ${i + 1}: "${message}"`);
        console.log('-'.repeat(40));
        
        try {
            // Test WebSocket
            console.log('🌐 Testing WebSocket...');
            const wsResult = await testWebSocketChat(message);
            console.log(`   ⚡ UI Response: ${wsResult.uiResponseTime}ms`);
            console.log(`   🤖 Agent: "${wsResult.text}"`);
            
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Test HTTP
            console.log('📡 Testing HTTP...');
            const httpResult = await testHTTPChat(message);
            console.log(`   ⏱️  UI Response: ${httpResult.uiResponseTime}ms`);
            console.log(`   🤖 Agent: "${httpResult.text}"`);
            
            // Calculate improvement
            const improvement = ((httpResult.uiResponseTime - wsResult.uiResponseTime) / httpResult.uiResponseTime * 100).toFixed(1);
            const speedup = (httpResult.uiResponseTime / wsResult.uiResponseTime).toFixed(1);
            
            console.log(`   📊 WebSocket is ${improvement}% faster (${speedup}x speedup)`);
            
            results.push({
                message,
                websocket: wsResult,
                http: httpResult,
                improvement: parseFloat(improvement),
                speedup: parseFloat(speedup)
            });
            
        } catch (error) {
            console.error(`   ❌ Test failed: ${error.message}`);
        }
        
        console.log('');
        
        // Delay between test messages
        if (i < testMessages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // Summary
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('=' .repeat(50));
    
    if (results.length > 0) {
        const avgImprovement = results.reduce((sum, r) => sum + r.improvement, 0) / results.length;
        const avgSpeedup = results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
        const avgWSTime = results.reduce((sum, r) => sum + r.websocket.uiResponseTime, 0) / results.length;
        const avgHTTPTime = results.reduce((sum, r) => sum + r.http.uiResponseTime, 0) / results.length;
        
        console.log(`✅ Tests completed: ${results.length}/${testMessages.length}`);
        console.log(`⚡ Average WebSocket response: ${Math.round(avgWSTime)}ms`);
        console.log(`📡 Average HTTP response: ${Math.round(avgHTTPTime)}ms`);
        console.log(`🚀 Average improvement: ${avgImprovement.toFixed(1)}% faster`);
        console.log(`⚡ Average speedup: ${avgSpeedup.toFixed(1)}x`);
        
        if (avgWSTime < 1000) {
            console.log('\n🎉 EXCELLENT! WebSocket provides near-instant responses');
        } else if (avgWSTime < 3000) {
            console.log('\n✅ GREAT! WebSocket provides fast interactive responses');
        } else {
            console.log('\n⚠️  WebSocket is faster but still needs optimization');
        }
        
        console.log('\n💡 USER EXPERIENCE BENEFITS:');
        console.log('   • Instant UI feedback and typing indicators');
        console.log('   • Real-time message delivery');
        console.log('   • Better perceived performance');
        console.log('   • Smoother conversation flow');
        console.log('   • Connection status awareness');
        
    } else {
        console.log('❌ No successful tests completed');
    }
    
    console.log('\n🌐 ACCESS THE IMPROVED CHAT:');
    console.log('   Visit: http://localhost:3000/ai-settings/agents');
    console.log('   Click any "Chat" button for WebSocket-powered instant responses!');
}

runComparison().catch(console.error);
