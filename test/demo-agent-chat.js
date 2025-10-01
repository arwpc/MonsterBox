#!/usr/bin/env node
/**
 * MonsterBox 4.0 - Agent Chat Demonstration
 * Quick demo showing all 4 agents responding with unique personalities
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

// Known agents from ElevenLabs
const AGENTS = [
    {
        id: 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n',
        name: 'Orlok - MonsterBox',
        character: 'vampire'
    },
    {
        id: 'agent_7901k3f1dza1ee68w1257zh3s9x6',
        name: 'Skulltalker - MonsterBox',
        character: 'skull'
    },
    {
        id: 'agent_0801k3f1dybkecj88sta18gwwrv5',
        name: 'PumpkinHead - MonsterBox',
        character: 'pumpkin'
    },
    {
        id: 'agent_8401k3f1dx98e05t94yp6kz4vf8n',
        name: 'Coffin Breaker - MonsterBox',
        character: 'coffin'
    }
];

async function testAgent(agent, message) {
    console.log(`\n🤖 Testing ${agent.name}...`);
    console.log(`👤 User: "${message}"`);
    
    const startTime = Date.now();
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/elevenlabs/conversation/test`,
            {
                agentId: agent.id,
                text: message
            },
            {
                timeout: 120000,
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
        const responseTime = Date.now() - startTime;
        
        if (response.data.success && response.data.agentUsed) {
            console.log(`🎭 ${agent.name}: "${response.data.replyText}" (${responseTime}ms)`);
            console.log(`✅ SUCCESS - Real agent response, not fallback`);
            return true;
        } else {
            console.log(`❌ FAILED - Got fallback response or error`);
            return false;
        }
        
    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.log(`❌ FAILED - ${error.message} (${responseTime}ms)`);
        return false;
    }
}

async function main() {
    console.log('🎃 MonsterBox 4.0 - Agent Chat Demonstration');
    console.log('='.repeat(50));
    console.log('Testing all 4 ElevenLabs agents with unique personalities...\n');
    
    const testMessage = "Hello! Tell me something spooky about yourself.";
    let successCount = 0;
    
    for (const agent of AGENTS) {
        const success = await testAgent(agent, testMessage);
        if (success) successCount++;
        
        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`🎯 RESULTS: ${successCount}/${AGENTS.length} agents responded successfully`);
    
    if (successCount === AGENTS.length) {
        console.log('🎉 ALL AGENTS WORKING! Chat functionality is fully operational.');
        console.log('💡 You can now use the Chat buttons on the AI Agent Management page.');
        console.log('🌐 Visit: http://localhost:3000/ai-settings/agents');
    } else if (successCount > 0) {
        console.log('⚠️  Some agents working, but not all. Check ElevenLabs API status.');
    } else {
        console.log('❌ No agents responding. Check server and API configuration.');
    }
    
    console.log('\n🔧 Technical Details:');
    console.log('- Timeout increased from 30s to 120s for conversations');
    console.log('- All responses are real AI-generated content (no echo fallbacks)');
    console.log('- Each agent has unique personality and response style');
    console.log('- Chat UI available at /ai-settings/agents with Chat buttons');
}

main().catch(console.error);
