const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AutomatedConversationRunner {
    constructor() {
        this.baseUrl = 'http://192.168.8.140:3000';
        this.conversations = [];
        this.believabilityScores = [];
        this.performanceMetrics = [];
        this.iteration = 1;
        this.maxIterations = 3;
        this.improvements = [];

        // Performance thresholds for optimization
        this.performanceTargets = {
            responseTime: 3000, // 3 seconds max
            optimalResponseTime: 1500, // 1.5 seconds ideal
            minExchanges: 10,
            maxExchanges: 15
        };
        
        this.conversationPrompts = [
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
    
    async runAllConversations() {
        console.log('🎭 Starting 25 Orlok & Mina Conversations');
        console.log('========================================');
        
        for (let i = 0; i < 25; i++) {
            await this.runSingleConversation(i + 1, this.conversationPrompts[i]);
            await this.delay(2000); // Pause between conversations
        }
        
        this.generateReport();
        this.saveResults();
    }
    
    async runSingleConversation(conversationId, prompt) {
        console.log(`\n🎭 Conversation ${conversationId}/25`);
        console.log(`📝 Mina: "${prompt}"`);
        
        try {
            const response = await axios.post(`${this.baseUrl}/api/chat`, {
                message: prompt,
                character: 'orlok'
            }, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data.success) {
                const conversation = {
                    id: conversationId,
                    mina: prompt,
                    orlok: response.data.aiResponse,
                    character: response.data.character,
                    timestamp: new Date().toISOString()
                };
                
                console.log(`🧛 Orlok: "${conversation.orlok}"`);
                
                const believabilityScore = this.calculateBelievabilityScore(conversation);
                conversation.believabilityScore = believabilityScore;
                
                console.log(`📊 Believability Score: ${believabilityScore.total}/100 (${believabilityScore.grade})`);
                console.log(`   - Character Consistency: ${believabilityScore.characterConsistency}/20`);
                console.log(`   - Response Relevance: ${believabilityScore.responseRelevance}/20`);
                console.log(`   - Emotional Depth: ${believabilityScore.emotionalDepth}/20`);
                console.log(`   - Language Style: ${believabilityScore.languageStyle}/20`);
                console.log(`   - Narrative Flow: ${believabilityScore.narrativeFlow}/20`);
                
                this.conversations.push(conversation);
                this.believabilityScores.push(believabilityScore);
                
            } else {
                console.log(`❌ Failed to get response: ${response.data.error || 'Unknown error'}`);
            }
            
        } catch (error) {
            console.log(`❌ Error in conversation ${conversationId}: ${error.message}`);
        }
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
        const minaPrompt = conversation.mina.toLowerCase();
        
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
        const relevantMatches = relevantKeywords.filter(keyword => 
            orlokResponse.includes(keyword) || minaPrompt.includes(keyword)
        ).length;
        scores.responseRelevance = Math.min(20, relevantMatches * 2);
        
        // Emotional Depth (20 points)
        const emotionalWords = ['loneliness', 'sorrow', 'desire', 'fear', 'fascination', 'mystery', 'haunting', 'yearning', 'melancholy', 'torment'];
        const emotionalMatches = emotionalWords.filter(word => orlokResponse.includes(word)).length;
        scores.emotionalDepth = Math.min(20, emotionalMatches * 4);
        if (orlokResponse.length > 100) scores.emotionalDepth += 5; // Bonus for detailed responses
        
        // Language Style (20 points)
        if (orlokResponse.length > 50) scores.languageStyle += 8;
        if (orlokResponse.includes('.') && orlokResponse.includes(',')) scores.languageStyle += 6;
        if (orlokResponse.match(/[.!?]{2,}/)) scores.languageStyle += 6; // Dramatic punctuation
        
        // Narrative Flow (20 points)
        if (orlokResponse.includes('...') || orlokResponse.includes('—') || orlokResponse.includes('–')) scores.narrativeFlow += 10;
        if (!orlokResponse.includes('i am') && !orlokResponse.includes('my name is')) scores.narrativeFlow += 5;
        if (orlokResponse.split(' ').length > 15) scores.narrativeFlow += 5; // Substantial response
        
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
    
    generateReport() {
        console.log('\n🎭 CONVERSATION TEST RESULTS');
        console.log('============================');
        
        const totalScores = this.believabilityScores.map(s => s.total);
        const averageScore = totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;
        const highestScore = Math.max(...totalScores);
        const lowestScore = Math.min(...totalScores);
        
        const gradeDistribution = {};
        this.believabilityScores.forEach(score => {
            gradeDistribution[score.grade] = (gradeDistribution[score.grade] || 0) + 1;
        });
        
        const highQualityCount = totalScores.filter(score => score >= 80).length;
        const mediumQualityCount = totalScores.filter(score => score >= 60).length;
        const lowQualityCount = totalScores.filter(score => score < 60).length;
        
        console.log(`📊 Total Conversations: ${this.conversations.length}`);
        console.log(`📈 Average Believability: ${averageScore.toFixed(1)}/100`);
        console.log(`🏆 Highest Score: ${highestScore}/100`);
        console.log(`📉 Lowest Score: ${lowestScore}/100`);
        console.log(`✅ High Quality (80+): ${highQualityCount} conversations`);
        console.log(`⚠️  Medium Quality (60-79): ${mediumQualityCount - highQualityCount} conversations`);
        console.log(`❌ Low Quality (<60): ${lowQualityCount} conversations`);
        
        console.log('\n📋 Grade Distribution:');
        Object.entries(gradeDistribution).forEach(([grade, count]) => {
            console.log(`   ${grade}: ${count} conversations`);
        });
        
        // Category Analysis
        const avgCharacterConsistency = this.believabilityScores.reduce((sum, s) => sum + s.characterConsistency, 0) / this.believabilityScores.length;
        const avgResponseRelevance = this.believabilityScores.reduce((sum, s) => sum + s.responseRelevance, 0) / this.believabilityScores.length;
        const avgEmotionalDepth = this.believabilityScores.reduce((sum, s) => sum + s.emotionalDepth, 0) / this.believabilityScores.length;
        const avgLanguageStyle = this.believabilityScores.reduce((sum, s) => sum + s.languageStyle, 0) / this.believabilityScores.length;
        const avgNarrativeFlow = this.believabilityScores.reduce((sum, s) => sum + s.narrativeFlow, 0) / this.believabilityScores.length;
        
        console.log('\n📊 Category Analysis:');
        console.log(`   Character Consistency: ${avgCharacterConsistency.toFixed(1)}/20`);
        console.log(`   Response Relevance: ${avgResponseRelevance.toFixed(1)}/20`);
        console.log(`   Emotional Depth: ${avgEmotionalDepth.toFixed(1)}/20`);
        console.log(`   Language Style: ${avgLanguageStyle.toFixed(1)}/20`);
        console.log(`   Narrative Flow: ${avgNarrativeFlow.toFixed(1)}/20`);
        
        // Overall Assessment
        let overallGrade;
        if (averageScore >= 85) overallGrade = 'Excellent - Highly Believable';
        else if (averageScore >= 75) overallGrade = 'Good - Generally Believable';
        else if (averageScore >= 65) overallGrade = 'Satisfactory - Moderately Believable';
        else if (averageScore >= 55) overallGrade = 'Needs Improvement - Somewhat Believable';
        else overallGrade = 'Poor - Not Believable';
        
        console.log(`\n🎯 Overall Assessment: ${overallGrade}`);
        
        // Recommendations
        console.log('\n💡 Recommendations:');
        if (avgCharacterConsistency < 15) {
            console.log('   - Improve character consistency by using more archaic language and vampire-specific terminology');
        }
        if (avgResponseRelevance < 15) {
            console.log('   - Enhance response relevance by better addressing themes raised by Mina');
        }
        if (avgEmotionalDepth < 15) {
            console.log('   - Increase emotional depth by exploring psychological aspects of immortality');
        }
        if (avgLanguageStyle < 15) {
            console.log('   - Improve language style with more sophisticated vocabulary and sentence structure');
        }
        if (avgNarrativeFlow < 15) {
            console.log('   - Enhance narrative flow with better pacing and dramatic elements');
        }
    }
    
    saveResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const report = {
            timestamp: new Date().toISOString(),
            totalConversations: this.conversations.length,
            conversations: this.conversations,
            believabilityScores: this.believabilityScores,
            summary: {
                averageScore: this.believabilityScores.reduce((sum, s) => sum + s.total, 0) / this.believabilityScores.length,
                highestScore: Math.max(...this.believabilityScores.map(s => s.total)),
                lowestScore: Math.min(...this.believabilityScores.map(s => s.total)),
                gradeDistribution: this.believabilityScores.reduce((acc, score) => {
                    acc[score.grade] = (acc[score.grade] || 0) + 1;
                    return acc;
                }, {})
            }
        };
        
        // Save detailed report
        fs.writeFileSync(`orlok-mina-conversations-${timestamp}.json`, JSON.stringify(report, null, 2));
        
        // Save transcript only
        const transcriptReport = {
            timestamp: new Date().toISOString(),
            conversations: this.conversations.map(c => ({
                id: c.id,
                mina: c.mina,
                orlok: c.orlok,
                believabilityScore: c.believabilityScore.total,
                grade: c.believabilityScore.grade
            }))
        };
        
        fs.writeFileSync(`conversation-transcripts-${timestamp}.json`, JSON.stringify(transcriptReport, null, 2));
        
        console.log(`\n💾 Results saved to:`);
        console.log(`   - orlok-mina-conversations-${timestamp}.json`);
        console.log(`   - conversation-transcripts-${timestamp}.json`);
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the automated conversation tests
if (require.main === module) {
    const runner = new AutomatedConversationRunner();
    runner.runAllConversations().then(() => {
        console.log('\n✅ All conversation tests completed successfully!');
        process.exit(0);
    }).catch(error => {
        console.error('\n❌ Conversation tests failed:', error.message);
        process.exit(1);
    });
}

module.exports = AutomatedConversationRunner;
