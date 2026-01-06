/**
 * MonsterBox 4.0 - Comprehensive Agent Conversation Test
 * Tests all ElevenLabs agents with 10+ exchanges each
 * Validates actual agent responses vs fallback echoes
 */

import axios from 'axios';
import { expect } from 'chai';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 180000; // 3 minutes per test

// Known agents from ElevenLabs
const AGENTS = [
    {
        id: 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n',
        name: 'Orlok - MonsterBox',
        character: 'vampire',
        expectedKeywords: ['vampire', 'blood', 'darkness', 'eternal', 'shadows', 'Transylvania', 'Orlok']
    },
    {
        id: 'agent_7901k3f1dza1ee68w1257zh3s9x6',
        name: 'Skulltalker - MonsterBox',
        character: 'skull',
        expectedKeywords: ['skull', 'bone', 'death', 'speak', 'talk', 'grave', 'spirit']
    },
    {
        id: 'agent_0801k3f1dybkecj88sta18gwwrv5',
        name: 'PumpkinHead - MonsterBox',
        character: 'pumpkin',
        expectedKeywords: ['pumpkin', 'Halloween', 'orange', 'harvest', 'autumn', 'jack', 'lantern']
    },
    {
        id: 'agent_8401k3f1dx98e05t94yp6kz4vf8n',
        name: 'Coffin Breaker - MonsterBox',
        character: 'coffin',
        expectedKeywords: ['coffin', 'grave', 'burial', 'dead', 'break', 'escape', 'tomb']
    }
];

// Conversation starters for each agent
const CONVERSATION_STARTERS = [
    "Hello! Who are you?",
    "Tell me about yourself.",
    "What is your greatest fear?",
    "What do you think about Halloween?",
    "Describe your home.",
    "What makes you unique?",
    "Tell me a scary story.",
    "What do you want most in the world?",
    "How do you spend your time?",
    "What advice would you give to mortals?",
    "What is your favorite time of day?",
    "Do you have any friends?"
];

describe('Agent Conversation Tests', function() {
    this.timeout(TEST_TIMEOUT);

    let server;
    let serverStarted = false;

    before(async function() {
        console.log('🚀 Starting comprehensive agent conversation tests...');
        
        // Check if server is already running
        try {
            const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
            if (response.status === 200) {
                serverStarted = true;
                console.log('✅ Server is already running');
            }
        } catch (error) {
            console.log('⚠️  Server not running, tests may fail');
        }
    });

    after(async function() {
        if (server) {
            console.log('🛑 Stopping test server...');
            server.close();
        }
    });

    // Test each agent individually
    AGENTS.forEach(agent => {
        describe(`${agent.name} Conversation Test`, function() {
            this.timeout(TEST_TIMEOUT);

            it(`should conduct a meaningful 10+ exchange conversation with ${agent.name}`, async function() {
                console.log(`\n🤖 Testing ${agent.name} (${agent.id})`);
                
                const conversationLog = [];
                let successfulExchanges = 0;
                let totalResponseTime = 0;
                
                for (let i = 0; i < CONVERSATION_STARTERS.length && successfulExchanges < 10; i++) {
                    const userMessage = CONVERSATION_STARTERS[i];
                    console.log(`   👤 User: "${userMessage}"`);
                    
                    const startTime = Date.now();
                    
                    try {
                        const response = await axios.post(
                            `${BASE_URL}/api/elevenlabs/conversation/test`,
                            {
                                agentId: agent.id,
                                text: userMessage
                            },
                            {
                                timeout: 120000, // 2 minutes per exchange
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                        
                        const responseTime = Date.now() - startTime;
                        totalResponseTime += responseTime;
                        
                        expect(response.status).to.equal(200);
                        expect(response.data.success).to.be.true;
                        expect(response.data.replyText).to.be.a('string');
                        expect(response.data.replyText.length).to.be.greaterThan(10);
                        
                        // Verify this is NOT an echo fallback
                        expect(response.data.replyText).to.not.include('Spooky echo:');
                        expect(response.data.agentUsed).to.be.true;
                        
                        const agentReply = response.data.replyText;
                        console.log(`   🤖 ${agent.name}: "${agentReply}" (${responseTime}ms)`);
                        
                        // Verify response is contextually appropriate
                        const lowerReply = agentReply.toLowerCase();
                        const hasCharacterKeywords = agent.expectedKeywords.some(keyword => 
                            lowerReply.includes(keyword.toLowerCase())
                        );
                        
                        // Log for analysis but don't fail test if keywords not found
                        // (agent might be creative in different ways)
                        if (hasCharacterKeywords) {
                            console.log(`   ✅ Response contains character-appropriate keywords`);
                        } else {
                            console.log(`   ⚠️  Response doesn't contain expected keywords, but may still be valid`);
                        }
                        
                        conversationLog.push({
                            exchange: successfulExchanges + 1,
                            userMessage,
                            agentReply,
                            responseTime,
                            hasKeywords: hasCharacterKeywords
                        });
                        
                        successfulExchanges++;
                        
                        // Brief pause between exchanges to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                    } catch (error) {
                        console.error(`   ❌ Exchange ${i + 1} failed:`, error.message);
                        
                        // If it's a timeout, that's a critical failure
                        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                            throw new Error(`Agent ${agent.name} timed out on exchange ${i + 1}. This indicates the conversation API is not working properly.`);
                        }
                        
                        // For other errors, continue but log them
                        console.log(`   ⚠️  Continuing with next exchange...`);
                    }
                }
                
                // Validate results
                console.log(`\n📊 ${agent.name} Results:`);
                console.log(`   Successful exchanges: ${successfulExchanges}/10`);
                console.log(`   Average response time: ${Math.round(totalResponseTime / successfulExchanges)}ms`);
                console.log(`   Total conversation time: ${Math.round(totalResponseTime / 1000)}s`);
                
                // Must have at least 10 successful exchanges
                expect(successfulExchanges).to.be.at.least(10, 
                    `Agent ${agent.name} only completed ${successfulExchanges} exchanges, need at least 10`);
                
                // Average response time should be reasonable (under 30 seconds)
                const avgResponseTime = totalResponseTime / successfulExchanges;
                expect(avgResponseTime).to.be.lessThan(30000, 
                    `Agent ${agent.name} average response time ${Math.round(avgResponseTime)}ms is too slow`);
                
                // At least 70% of responses should be unique (not repetitive)
                const uniqueResponses = new Set(conversationLog.map(log => log.agentReply.toLowerCase().trim()));
                const uniquePercentage = (uniqueResponses.size / conversationLog.length) * 100;
                expect(uniquePercentage).to.be.at.least(70, 
                    `Agent ${agent.name} responses are too repetitive (${Math.round(uniquePercentage)}% unique)`);
                
                console.log(`   Response uniqueness: ${Math.round(uniquePercentage)}%`);
                console.log(`   ✅ ${agent.name} conversation test PASSED\n`);
            });
        });
    });

    // Test all agents together (stress test)
    describe('Multi-Agent Stress Test', function() {
        this.timeout(TEST_TIMEOUT * 2);

        it('should handle concurrent conversations with all agents', async function() {
            console.log('\n🔥 Running multi-agent stress test...');
            
            const promises = AGENTS.map(async (agent, index) => {
                const testMessage = `Hello ${agent.character}, this is stress test ${index + 1}. Tell me something interesting about yourself.`;
                
                try {
                    const response = await axios.post(
                        `${BASE_URL}/api/elevenlabs/conversation/test`,
                        {
                            agentId: agent.id,
                            text: testMessage
                        },
                        {
                            timeout: 60000,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                    
                    return {
                        agent: agent.name,
                        success: true,
                        response: response.data.replyText,
                        agentUsed: response.data.agentUsed
                    };
                } catch (error) {
                    return {
                        agent: agent.name,
                        success: false,
                        error: error.message
                    };
                }
            });
            
            const results = await Promise.all(promises);
            
            console.log('\n📊 Stress test results:');
            results.forEach(result => {
                if (result.success) {
                    console.log(`   ✅ ${result.agent}: SUCCESS (agent used: ${result.agentUsed})`);
                    console.log(`      Response: "${result.response.substring(0, 100)}..."`);
                } else {
                    console.log(`   ❌ ${result.agent}: FAILED - ${result.error}`);
                }
            });
            
            const successCount = results.filter(r => r.success && r.agentUsed).length;
            const totalCount = results.length;
            
            console.log(`\n🎯 Stress test summary: ${successCount}/${totalCount} agents responded successfully`);
            
            // At least 75% should succeed
            expect(successCount).to.be.at.least(Math.ceil(totalCount * 0.75), 
                `Only ${successCount}/${totalCount} agents succeeded in stress test`);
        });
    });
});
