const axios = require('axios');

async function testImprovedConversation() {
    console.log('🎭 TESTING IMPROVED ORLOK & MINA CONVERSATION DYNAMICS');
    console.log('====================================================');
    console.log('Testing the new emotionally reactive conversation system...\n');
    
    const baseUrl = 'http://localhost:8766';
    
    // Test conversation with emotional reactions
    const testExchanges = [
        {
            speaker: 'mina',
            message: 'Count Orlok, I hate that I am drawn to you.',
            expectedType: 'conflicted attraction'
        },
        {
            speaker: 'orlok', 
            message: null, // Will use Orlok's response from previous
            expectedType: 'seductive/possessive'
        },
        {
            speaker: 'mina',
            message: null, // Will use Mina's reactive response
            expectedType: 'torn between love/hate'
        },
        {
            speaker: 'orlok',
            message: null,
            expectedType: 'predatory desire'
        },
        {
            speaker: 'mina',
            message: null,
            expectedType: 'fearful attraction'
        }
    ];
    
    let currentMessage = testExchanges[0].message;
    let conversationHistory = [];
    
    for (let i = 0; i < testExchanges.length; i++) {
        const exchange = testExchanges[i];
        const character = exchange.speaker;
        
        console.log(`\n💬 Exchange ${i + 1}: ${character.toUpperCase()}`);
        console.log(`📝 Message: "${currentMessage}"`);
        console.log(`🎯 Expected: ${exchange.expectedType}`);
        
        try {
            const startTime = Date.now();
            const response = await axios.post(`${baseUrl}/api/chat`, {
                message: currentMessage,
                character: character
            }, { timeout: 10000 });
            
            const responseTime = Date.now() - startTime;
            const aiResponse = response.data.aiResponse;
            
            console.log(`🤖 AI Response: "${aiResponse}"`);
            console.log(`⚡ Response Time: ${responseTime}ms`);
            
            // Analyze response quality
            const analysis = analyzeResponse(aiResponse, exchange.expectedType, character);
            console.log(`📊 Analysis: ${analysis}`);
            
            conversationHistory.push({
                speaker: character,
                message: currentMessage,
                response: aiResponse,
                responseTime: responseTime,
                analysis: analysis
            });
            
            // Set up next message
            currentMessage = aiResponse;
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            break;
        }
        
        // Brief pause between exchanges
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Summary
    console.log('\n📋 CONVERSATION SUMMARY');
    console.log('=======================');
    conversationHistory.forEach((exchange, index) => {
        console.log(`${index + 1}. ${exchange.speaker.toUpperCase()}: "${exchange.response}"`);
        console.log(`   Analysis: ${exchange.analysis}`);
        console.log(`   Time: ${exchange.responseTime}ms\n`);
    });
    
    // Overall assessment
    const avgResponseTime = conversationHistory.reduce((sum, ex) => sum + ex.responseTime, 0) / conversationHistory.length;
    const reactiveResponses = conversationHistory.filter(ex => ex.analysis.includes('✅')).length;
    
    console.log('🎯 OVERALL ASSESSMENT');
    console.log('=====================');
    console.log(`📊 Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`🎭 Reactive Responses: ${reactiveResponses}/${conversationHistory.length}`);
    console.log(`💯 Conversation Quality: ${reactiveResponses >= 3 ? 'EXCELLENT' : reactiveResponses >= 2 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
    
    if (reactiveResponses >= 3) {
        console.log('\n✅ SUCCESS: Characters are now responding to each other emotionally!');
        console.log('🎭 Mina shows conflicted love/hate, Orlok shows predatory desire');
        console.log('💬 Conversations are now genuine exchanges, not parallel monologues');
    } else {
        console.log('\n⚠️ PARTIAL SUCCESS: Some improvement but needs more work');
    }
}

function analyzeResponse(response, expectedType, character) {
    const text = response.toLowerCase();
    
    if (character === 'mina') {
        // Check for Mina's conflicted emotions
        if (expectedType.includes('conflicted') || expectedType.includes('torn')) {
            if ((text.includes('hate') && text.includes('love')) || 
                (text.includes('should') && text.includes('but')) ||
                (text.includes('resist') && text.includes('can\'t')) ||
                (text.includes('terrif') && text.includes('drawn'))) {
                return '✅ Shows conflicted love/hate dynamic';
            }
        }
        if (expectedType.includes('fearful') && text.includes('fear') || text.includes('terrif')) {
            return '✅ Shows appropriate fear response';
        }
        if (text.includes('you') && (text.includes('make') || text.includes('feel'))) {
            return '✅ Reacting to Orlok specifically';
        }
        return '⚠️ Generic response, not emotionally reactive';
    } else if (character === 'orlok') {
        // Check for Orlok's predatory/seductive responses
        if (text.includes('thou') || text.includes('thy') || text.includes('thee')) {
            if (text.includes('mine') || text.includes('desire') || text.includes('hunger') || text.includes('embrace')) {
                return '✅ Predatory/possessive with archaic language';
            }
            return '✅ Uses archaic language appropriately';
        }
        if (text.includes('mortal') && (text.includes('desire') || text.includes('nature') || text.includes('embrace'))) {
            return '✅ Seductive/commanding response';
        }
        if (text.length <= 50) { // Short response as intended
            return '✅ Appropriately brief response';
        }
        return '⚠️ Response could be more predatory/seductive';
    }
    
    return '❓ Unable to analyze';
}

// Run the test
if (require.main === module) {
    testImprovedConversation().then(() => {
        console.log('\n🎉 Improved conversation test completed!');
        process.exit(0);
    }).catch(error => {
        console.error('\n💥 Test failed:', error.message);
        process.exit(1);
    });
}

module.exports = testImprovedConversation;
