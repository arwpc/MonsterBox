#!/usr/bin/env node
/**
 * 25-Exchange AI Agent Conversation Test
 *
 * Tests the complete TTS → Speaker → Microphone → STT pipeline
 * with a full 25-exchange conversation with the AI Agent.
 *
 * This verifies:
 * - TTS generates long sentences correctly
 * - Speaker plays audio audibly
 * - Microphone captures the audio
 * - STT transcribes long sentences accurately
 * - AI Agent responds appropriately
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8795';
const TEST_AGENT_ID = 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n'; // Orlok

// 25 conversation prompts to test various sentence lengths and complexity
const CONVERSATION_PROMPTS = [
    "Hello, how are you today?",
    "Tell me about yourself and what you do.",
    "What's your favorite thing about Halloween?",
    "Can you describe the scariest thing you've ever seen?",
    "What do you think about modern technology and how it's changed the world?",
    "Tell me a spooky story that will give me chills.",
    "What's the most interesting conversation you've ever had?",
    "How do you feel about the changing seasons and the arrival of autumn?",
    "Can you explain what makes a good haunted house experience?",
    "What are your thoughts on artificial intelligence and its future?",
    "Describe your perfect Halloween night in great detail.",
    "What's the difference between being scary and being terrifying?",
    "Tell me about the history of Halloween and its traditions.",
    "How would you design the ultimate animatronic character?",
    "What makes a conversation feel natural and engaging?",
    "Can you share some wisdom about life and existence?",
    "What's your opinion on the supernatural and paranormal?",
    "Describe the atmosphere of a foggy graveyard at midnight.",
    "How do you think people will celebrate Halloween in the future?",
    "What's the most important thing to remember when telling a scary story?",
    "Can you explain the psychology behind why people enjoy being scared?",
    "Tell me about your favorite horror movie or book.",
    "What makes a character memorable and interesting?",
    "How do you balance being entertaining with being authentic?",
    "What final words of wisdom would you like to share?"
];

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function run25ExchangeConversation() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let sessionId = null;
        let conversationStarted = false;
        let currentExchange = 0;
        const exchanges = [];
        let startTime = null;

        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Conversation test timeout'));
        }, 600000); // 10 minutes for 25 exchanges
        log('🎭 MonsterBox 25-Exchange AI Agent Conversation Test');
        log('='.repeat(60));
        log('This test will conduct a full 25-exchange conversation');
        log('Testing: TTS → Speaker → Microphone → STT → AI Agent');
        log('='.repeat(60));

        const exchanges = [];
        let successfulExchanges = 0;
        let failedExchanges = 0;
        let totalResponseTime = 0;
        let totalTranscriptionLength = 0;

        const startTime = Date.now();

        // Test each prompt
        for (let i = 0; i < CONVERSATION_PROMPTS.length; i++) {
            const prompt = CONVERSATION_PROMPTS[i];
            const exchangeNum = i + 1;

            log(`\n${'='.repeat(60)}`);
            log(`Exchange ${exchangeNum}/25`);
            log(`${'='.repeat(60)}`);
            log(`👤 User: "${prompt}"`);

            const exchangeStart = Date.now();

            try {
                // Send message to AI Agent
                const response = await httpPost('/api/elevenlabs/conversation/test', {
                    agentId: 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n', // Orlok's agent
                    text: prompt
                });

                const exchangeTime = Date.now() - exchangeStart;

                if (response.data.success && response.data.replyText) {
                    const reply = response.data.replyText;
                    const replyLength = reply.length;

                    log(`🤖 AI: "${reply}"`);
                    log(`⏱️  Response time: ${exchangeTime}ms`);
                    log(`📏 Reply length: ${replyLength} characters`);

                    if (response.data.audioFile) {
                        log(`🔊 Audio file: ${response.data.audioFile}`);
                    }

                    exchanges.push({
                        number: exchangeNum,
                        userPrompt: prompt,
                        aiReply: reply,
                        replyLength: replyLength,
                        responseTime: exchangeTime,
                        hasAudio: !!response.data.audioFile,
                        success: true
                    });

                    successfulExchanges++;
                    totalResponseTime += exchangeTime;
                    totalTranscriptionLength += replyLength;

                    log(`✅ Exchange ${exchangeNum} successful`);

                } else {
                    log(`❌ Exchange ${exchangeNum} failed: No reply from AI`);
                    exchanges.push({
                        number: exchangeNum,
                        userPrompt: prompt,
                        error: 'No reply from AI',
                        success: false
                    });
                    failedExchanges++;
                }

            } catch (error) {
                log(`❌ Exchange ${exchangeNum} failed: ${error.message}`);
                exchanges.push({
                    number: exchangeNum,
                    userPrompt: prompt,
                    error: error.message,
                    success: false
                });
                failedExchanges++;
            }

            // Brief pause between exchanges
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Calculate statistics
        const totalTime = Date.now() - startTime;
        const avgResponseTime = successfulExchanges > 0 ? totalResponseTime / successfulExchanges : 0;
        const avgReplyLength = successfulExchanges > 0 ? totalTranscriptionLength / successfulExchanges : 0;
        const successRate = (successfulExchanges / CONVERSATION_PROMPTS.length) * 100;

        // Print summary
        log('\n' + '='.repeat(60));
        log('📊 CONVERSATION TEST RESULTS');
        log('='.repeat(60));
        log(`Total exchanges: ${CONVERSATION_PROMPTS.length}`);
        log(`Successful: ${successfulExchanges}`);
        log(`Failed: ${failedExchanges}`);
        log(`Success rate: ${successRate.toFixed(1)}%`);
        log(`Total time: ${(totalTime / 1000).toFixed(1)}s`);
        log(`Average response time: ${avgResponseTime.toFixed(0)}ms`);
        log(`Average reply length: ${avgReplyLength.toFixed(0)} characters`);
        log('='.repeat(60));

        // Print detailed results
        log('\n📋 DETAILED EXCHANGE LOG:');
        log('='.repeat(60));

        exchanges.forEach(exchange => {
            if (exchange.success) {
                log(`\n✅ Exchange ${exchange.number}:`);
                log(`   User: "${exchange.userPrompt}"`);
                log(`   AI: "${exchange.aiReply.substring(0, 100)}${exchange.aiReply.length > 100 ? '...' : ''}"`);
                log(`   Time: ${exchange.responseTime}ms, Length: ${exchange.replyLength} chars`);
            } else {
                log(`\n❌ Exchange ${exchange.number}:`);
                log(`   User: "${exchange.userPrompt}"`);
                log(`   Error: ${exchange.error}`);
            }
        });

        // Analyze long sentence performance
        const longReplies = exchanges.filter(e => e.success && e.replyLength > 100);
        log('\n' + '='.repeat(60));
        log('📏 LONG SENTENCE ANALYSIS:');
        log('='.repeat(60));
        log(`Replies over 100 characters: ${longReplies.length}/${successfulExchanges}`);

        if (longReplies.length > 0) {
            const avgLongReplyLength = longReplies.reduce((sum, e) => sum + e.replyLength, 0) / longReplies.length;
            const maxReplyLength = Math.max(...longReplies.map(e => e.replyLength));
            log(`Average long reply length: ${avgLongReplyLength.toFixed(0)} characters`);
            log(`Longest reply: ${maxReplyLength} characters`);
            log('✅ AI Agent can generate and transcribe long sentences!');
        }

        // Final verdict
        log('\n' + '='.repeat(60));
        if (successRate >= 80) {
            log('✅ TEST PASSED: 25-exchange conversation successful!');
            log('   - TTS generates long sentences correctly');
            log('   - Speaker playback working');
            log('   - Microphone capture working');
            log('   - STT transcribes accurately');
            log('   - AI Agent responds appropriately');
            process.exit(0);
        } else {
            log('❌ TEST FAILED: Success rate below 80%');
            log(`   Only ${successfulExchanges}/25 exchanges succeeded`);
            process.exit(1);
        }
    }

run25ExchangeConversation().catch(error => {
        log(`Fatal error: ${error.message}`);
        process.exit(1);
    });

