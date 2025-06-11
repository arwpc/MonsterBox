#!/bin/bash
echo "🎭 Executing 25 Orlok & Mina Conversations on RPI4b"
echo "================================================="

# Create comprehensive conversation execution script for RPI4b
cat > rpi4b-conversation-executor.sh << 'EOF'
#!/bin/bash
echo "🎭 Starting Orlok & Mina Conversation Tests on RPI4b"
echo "=================================================="

cd /home/remote/MonsterBox

# Kill any existing processes
pkill -f npm 2>/dev/null
pkill -f node 2>/dev/null
sleep 3

# Set environment variables
export REPLICA_API_KEY=dummy_key_for_testing
export NODE_ENV=development
export PORT=3000
export OPENAI_API_KEY=dummy_key

# Start MonsterBox application
echo "🚀 Starting MonsterBox application..."
npm run dev > app.log 2>&1 &
APP_PID=$!

# Wait for application to start
echo "⏳ Waiting for application to initialize..."
sleep 30

# Test if application is responding
echo "🔍 Testing application connectivity..."
for i in {1..10}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✅ MonsterBox application is running"
        break
    else
        echo "⏳ Attempt $i: Application not ready, waiting..."
        sleep 5
    fi
done

# Create Node.js conversation test script
cat > conversation-test.js << 'JSEOF'
const http = require('http');
const fs = require('fs');

const conversations = [];
const prompts = [
    "Good evening, Count. The shadows seem particularly restless tonight.",
    "I've been reading about your homeland in Transylvania. Tell me of your castle.",
    "The darkness calls to me in ways I cannot explain. Do you understand this feeling?",
    "Your eyes hold centuries of secrets. What wisdom have you gained?",
    "I dreamt of ancient rituals and blood-red moons. Were you there?",
    "The boundary between life and death fascinates me. How do you perceive it?",
    "Your presence both terrifies and intrigues me. Is this your intention?",
    "I sense a profound loneliness in your immortal existence. Am I wrong?",
    "The night reveals truths that daylight conceals. What do you see?",
    "Your transformation from mortal to immortal - was it a choice or curse?",
    "I feel drawn to the supernatural world you inhabit. Should I resist?",
    "The old legends speak of your kind with fear. But I see something more.",
    "Your castle must hold countless memories. Which ones haunt you most?",
    "The blood that sustains you - is it merely survival or something deeper?",
    "I've studied the occult extensively. Your existence challenges everything.",
    "The Victorian world I know seems so fragile compared to your reality.",
    "Your immortality grants perspective I can barely comprehend. Share it with me.",
    "The darkness you embrace - does it ever feel like a prison?",
    "I wonder if our meeting was destined or mere chance. What do you think?",
    "Your ancient wisdom could guide me through mysteries I'm discovering.",
    "The supernatural forces around us grow stronger. Do you feel it too?",
    "Your transformation story intrigues me. Was there a moment of regret?",
    "The connection between us transcends the mortal realm. Do you sense it?",
    "Your existence bridges worlds I'm only beginning to understand.",
    "The eternal night you inhabit - does it ever grow wearisome?"
];

function makeRequest(prompt) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            message: prompt,
            character: 'orlok'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/chat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function calculateBelievabilityScore(conversation) {
    const scores = {
        characterConsistency: 0,
        responseRelevance: 0,
        emotionalDepth: 0,
        languageStyle: 0,
        narrativeFlow: 0
    };
    
    const orlokResponse = conversation.orlok.toLowerCase();
    
    // Character Consistency (20 points)
    if (orlokResponse.includes('thee') || orlokResponse.includes('thou') || orlokResponse.includes('verily')) {
        scores.characterConsistency += 10;
    }
    if (orlokResponse.includes('castle') || orlokResponse.includes('night') || orlokResponse.includes('ancient') || 
        orlokResponse.includes('darkness') || orlokResponse.includes('shadow') || orlokResponse.includes('immortal')) {
        scores.characterConsistency += 10;
    }
    
    // Response Relevance (20 points)
    const relevantKeywords = ['darkness', 'shadow', 'blood', 'immortal', 'vampire', 'supernatural', 'death', 'eternal', 'castle', 'night'];
    const relevantMatches = relevantKeywords.filter(keyword => orlokResponse.includes(keyword)).length;
    scores.responseRelevance = Math.min(20, relevantMatches * 2);
    
    // Emotional Depth (20 points)
    const emotionalWords = ['loneliness', 'sorrow', 'desire', 'fear', 'fascination', 'mystery', 'haunting', 'yearning', 'melancholy', 'torment'];
    const emotionalMatches = emotionalWords.filter(word => orlokResponse.includes(word)).length;
    scores.emotionalDepth = Math.min(20, emotionalMatches * 4);
    if (orlokResponse.length > 100) scores.emotionalDepth += 5;
    
    // Language Style (20 points)
    if (orlokResponse.length > 50) scores.languageStyle += 8;
    if (orlokResponse.includes('.') && orlokResponse.includes(',')) scores.languageStyle += 6;
    if (orlokResponse.match(/[.!?]{2,}/)) scores.languageStyle += 6;
    
    // Narrative Flow (20 points)
    if (orlokResponse.includes('...') || orlokResponse.includes('—') || orlokResponse.includes('–')) scores.narrativeFlow += 10;
    if (!orlokResponse.includes('i am') && !orlokResponse.includes('my name is')) scores.narrativeFlow += 5;
    if (orlokResponse.split(' ').length > 15) scores.narrativeFlow += 5;
    
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    return {
        ...scores,
        total,
        grade: total >= 90 ? 'A+' : total >= 80 ? 'A' : total >= 70 ? 'B' : total >= 60 ? 'C' : total >= 50 ? 'D' : 'F'
    };
}

async function runAllTests() {
    console.log('🎭 Starting 25 Orlok & Mina Conversations');
    console.log('========================================');
    
    for (let i = 0; i < 25; i++) {
        const conversationId = i + 1;
        const prompt = prompts[i];
        
        console.log(`\n🎭 Conversation ${conversationId}/25`);
        console.log(`📝 Mina: "${prompt}"`);
        
        try {
            const response = await makeRequest(prompt);
            
            if (response.success) {
                const conversation = {
                    id: conversationId,
                    mina: prompt,
                    orlok: response.aiResponse,
                    timestamp: new Date().toISOString()
                };
                
                console.log(`🧛 Orlok: "${conversation.orlok}"`);
                
                const believabilityScore = calculateBelievabilityScore(conversation);
                conversation.believabilityScore = believabilityScore;
                
                console.log(`📊 Believability Score: ${believabilityScore.total}/100 (${believabilityScore.grade})`);
                
                conversations.push(conversation);
            } else {
                console.log(`❌ Failed: ${response.error || 'Unknown error'}`);
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Generate report
    console.log('\n🎭 CONVERSATION TEST RESULTS');
    console.log('============================');
    
    if (conversations.length === 0) {
        console.log('❌ No conversations completed successfully');
        return;
    }
    
    const scores = conversations.map(c => c.believabilityScore.total);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    
    const highQualityCount = scores.filter(score => score >= 80).length;
    const mediumQualityCount = scores.filter(score => score >= 60).length;
    
    console.log(`📊 Total Conversations: ${conversations.length}`);
    console.log(`📈 Average Believability: ${averageScore.toFixed(1)}/100`);
    console.log(`🏆 Highest Score: ${highestScore}/100`);
    console.log(`📉 Lowest Score: ${lowestScore}/100`);
    console.log(`✅ High Quality (80+): ${highQualityCount} conversations`);
    console.log(`⚠️  Medium Quality (60-79): ${mediumQualityCount - highQualityCount} conversations`);
    console.log(`❌ Low Quality (<60): ${conversations.length - mediumQualityCount} conversations`);
    
    let overallGrade;
    if (averageScore >= 85) overallGrade = 'Excellent - Highly Believable';
    else if (averageScore >= 75) overallGrade = 'Good - Generally Believable';
    else if (averageScore >= 65) overallGrade = 'Satisfactory - Moderately Believable';
    else if (averageScore >= 55) overallGrade = 'Needs Improvement - Somewhat Believable';
    else overallGrade = 'Poor - Not Believable';
    
    console.log(`\n🎯 Overall Assessment: ${overallGrade}`);
    
    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const report = {
        timestamp: new Date().toISOString(),
        platform: 'Raspberry Pi 4b (192.168.8.140)',
        totalConversations: conversations.length,
        conversations: conversations,
        summary: {
            averageScore: averageScore,
            highestScore: highestScore,
            lowestScore: lowestScore,
            highQualityCount: highQualityCount,
            mediumQualityCount: mediumQualityCount - highQualityCount,
            lowQualityCount: conversations.length - mediumQualityCount,
            overallGrade: overallGrade
        }
    };
    
    fs.writeFileSync(`conversation-results-${timestamp}.json`, JSON.stringify(report, null, 2));
    console.log(`\n💾 Results saved to: conversation-results-${timestamp}.json`);
}

runAllTests().then(() => {
    console.log('\n✅ All conversation tests completed!');
    process.exit(0);
}).catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
});
JSEOF

# Run the conversation tests
echo "🎭 Running 25 conversations..."
node conversation-test.js

# Stop the application
echo "🛑 Stopping MonsterBox application..."
kill $APP_PID 2>/dev/null
pkill -f npm 2>/dev/null

echo "✅ Conversation testing completed on RPI4b"
EOF

# Deploy and execute on RPI4b
scp rpi4b-conversation-executor.sh remote@192.168.8.140:/tmp/
ssh remote@192.168.8.140 "chmod +x /tmp/rpi4b-conversation-executor.sh && /tmp/rpi4b-conversation-executor.sh"
