#!/usr/bin/env node
/**
 * MonsterBox 4.0 - Agent Speed Test
 * Tests response times for real-time conversation capability
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

const AGENTS = [
    { id: 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n', name: 'Orlok' },
    { id: 'agent_7901k3f1dza1ee68w1257zh3s9x6', name: 'Skulltalker' },
    { id: 'agent_0801k3f1dybkecj88sta18gwwrv5', name: 'PumpkinHead' },
    { id: 'agent_8401k3f1dx98e05t94yp6kz4vf8n', name: 'Coffin Breaker' }
];

const QUICK_MESSAGES = [
    "Hello!",
    "How are you?",
    "Tell me something scary.",
    "What's your name?",
    "Goodbye!"
];

async function testAgentSpeed(agent, message) {
    const startTime = Date.now();
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/elevenlabs/conversation/test`,
            { agentId: agent.id, text: message },
            { timeout: 20000, headers: { 'Content-Type': 'application/json' } }
        );
        
        const responseTime = Date.now() - startTime;
        
        if (response.data.success) {
            return {
                success: true,
                responseTime,
                reply: response.data.replyText,
                fastResponse: response.data.fastResponse
            };
        } else {
            return { success: false, responseTime, error: 'No success flag' };
        }
        
    } catch (error) {
        const responseTime = Date.now() - startTime;
        return { success: false, responseTime, error: error.message };
    }
}

async function runSpeedTest() {
    console.log('🚀 MonsterBox Agent Speed Test');
    console.log('Testing real-time conversation capability...\n');
    
    const results = [];
    
    for (const agent of AGENTS) {
        console.log(`🤖 Testing ${agent.name}...`);
        
        for (let i = 0; i < QUICK_MESSAGES.length; i++) {
            const message = QUICK_MESSAGES[i];
            const result = await testAgentSpeed(agent, message);
            
            if (result.success) {
                const speed = result.responseTime < 5000 ? '⚡' : result.responseTime < 15000 ? '✅' : '⚠️';
                console.log(`  ${speed} "${message}" → "${result.reply}" (${result.responseTime}ms)`);
                results.push({ agent: agent.name, responseTime: result.responseTime, success: true });
            } else {
                console.log(`  ❌ "${message}" → ERROR: ${result.error} (${result.responseTime}ms)`);
                results.push({ agent: agent.name, responseTime: result.responseTime, success: false });
            }
            
            // Small delay between messages
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log('');
    }
    
    // Calculate statistics
    const successful = results.filter(r => r.success);
    const avgResponseTime = successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length;
    const fastResponses = successful.filter(r => r.responseTime < 5000).length;
    const goodResponses = successful.filter(r => r.responseTime < 15000).length;
    
    console.log('📊 SPEED TEST RESULTS:');
    console.log(`   Total tests: ${results.length}`);
    console.log(`   Successful: ${successful.length}/${results.length} (${Math.round(successful.length/results.length*100)}%)`);
    console.log(`   Average response time: ${Math.round(avgResponseTime)}ms`);
    console.log(`   ⚡ Fast responses (<5s): ${fastResponses}/${successful.length} (${Math.round(fastResponses/successful.length*100)}%)`);
    console.log(`   ✅ Good responses (<15s): ${goodResponses}/${successful.length} (${Math.round(goodResponses/successful.length*100)}%)`);
    
    if (avgResponseTime < 10000) {
        console.log('\n🎉 EXCELLENT! System is ready for real-time conversation.');
    } else if (avgResponseTime < 20000) {
        console.log('\n✅ GOOD! System is suitable for interactive chat.');
    } else {
        console.log('\n⚠️  SLOW! System may need further optimization.');
    }
    
    console.log('\n💡 The chat UI now supports:');
    console.log('   - Press Enter to send messages quickly');
    console.log('   - Typing indicators for better UX');
    console.log('   - Fast fallback responses when needed');
    console.log('   - Background TTS generation');
}

runSpeedTest().catch(console.error);
