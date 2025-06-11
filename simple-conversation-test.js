// Simple conversation test that can run without external dependencies
const http = require('http');
const fs = require('fs');

class SimpleConversationTest {
    constructor() {
        this.conversations = [];
        this.prompts = [
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
    }

    async makeRequest(prompt) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                message: prompt,
                character: 'orlok'
            });

            const options = {
                hostname: '192.168.8.140',
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
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        resolve(response);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    calculateBelievabilityScore(conversation) {
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
            grade: this.getGrade(total)
        };
    }

    getGrade(score) {
        if (score >= 90) return 'A+';
        if (score >= 80) return 'A';
        if (score >= 70) return 'B';
        if (score >= 60) return 'C';
        if (score >= 50) return 'D';
        return 'F';
    }

    async runAllTests() {
        console.log('🎭 Starting 25 Orlok & Mina Conversations');
        console.log('========================================');
        
        for (let i = 0; i < 25; i++) {
            const conversationId = i + 1;
            const prompt = this.prompts[i];
            
            console.log(`\n🎭 Conversation ${conversationId}/25`);
            console.log(`📝 Mina: "${prompt}"`);
            
            try {
                const response = await this.makeRequest(prompt);
                
                if (response.success) {
                    const conversation = {
                        id: conversationId,
                        mina: prompt,
                        orlok: response.aiResponse,
                        timestamp: new Date().toISOString()
                    };
                    
                    console.log(`🧛 Orlok: "${conversation.orlok}"`);
                    
                    const believabilityScore = this.calculateBelievabilityScore(conversation);
                    conversation.believabilityScore = believabilityScore;
                    
                    console.log(`📊 Believability Score: ${believabilityScore.total}/100 (${believabilityScore.grade})`);
                    
                    this.conversations.push(conversation);
                } else {
                    console.log(`❌ Failed: ${response.error || 'Unknown error'}`);
                }
                
            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
            }
            
            // Wait 2 seconds between conversations
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        this.generateReport();
        this.saveResults();
    }

    generateReport() {
        console.log('\n🎭 CONVERSATION TEST RESULTS');
        console.log('============================');
        
        if (this.conversations.length === 0) {
            console.log('❌ No conversations completed successfully');
            return;
        }
        
        const scores = this.conversations.map(c => c.believabilityScore.total);
        const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const highestScore = Math.max(...scores);
        const lowestScore = Math.min(...scores);
        
        const highQualityCount = scores.filter(score => score >= 80).length;
        const mediumQualityCount = scores.filter(score => score >= 60).length;
        
        console.log(`📊 Total Conversations: ${this.conversations.length}`);
        console.log(`📈 Average Believability: ${averageScore.toFixed(1)}/100`);
        console.log(`🏆 Highest Score: ${highestScore}/100`);
        console.log(`📉 Lowest Score: ${lowestScore}/100`);
        console.log(`✅ High Quality (80+): ${highQualityCount} conversations`);
        console.log(`⚠️  Medium Quality (60-79): ${mediumQualityCount - highQualityCount} conversations`);
        console.log(`❌ Low Quality (<60): ${this.conversations.length - mediumQualityCount} conversations`);
        
        let overallGrade;
        if (averageScore >= 85) overallGrade = 'Excellent - Highly Believable';
        else if (averageScore >= 75) overallGrade = 'Good - Generally Believable';
        else if (averageScore >= 65) overallGrade = 'Satisfactory - Moderately Believable';
        else if (averageScore >= 55) overallGrade = 'Needs Improvement - Somewhat Believable';
        else overallGrade = 'Poor - Not Believable';
        
        console.log(`\n🎯 Overall Assessment: ${overallGrade}`);
    }

    saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const report = {
            timestamp: new Date().toISOString(),
            totalConversations: this.conversations.length,
            conversations: this.conversations,
            summary: {
                averageScore: this.conversations.reduce((sum, c) => sum + c.believabilityScore.total, 0) / this.conversations.length,
                highestScore: Math.max(...this.conversations.map(c => c.believabilityScore.total)),
                lowestScore: Math.min(...this.conversations.map(c => c.believabilityScore.total))
            }
        };
        
        fs.writeFileSync(`conversation-results-${timestamp}.json`, JSON.stringify(report, null, 2));
        console.log(`\n💾 Results saved to: conversation-results-${timestamp}.json`);
    }
}

// Run the test
const test = new SimpleConversationTest();
test.runAllTests().then(() => {
    console.log('\n✅ All conversation tests completed!');
    process.exit(0);
}).catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
});
