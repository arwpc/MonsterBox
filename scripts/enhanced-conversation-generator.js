/**
 * Enhanced Conversation Generator for Orlok-Mina Testing
 * Generates 25 conversations with improved AI system and comprehensive evaluation
 */

const http = require('http');
const fs = require('fs').promises;
const path = require('path');

class EnhancedConversationGenerator {
    constructor(options = {}) {
        this.host = options.host || 'localhost';
        this.port = options.port || 3000;
        this.outputDir = options.outputDir || './conversation-results';
        this.conversations = [];
        this.scores = [];
        this.startTime = new Date();
        
        // Enhanced conversation prompts with deeper themes
        this.conversationPrompts = [
            "Count Orlok, I find myself drawn to the mysteries of the night. What wisdom have your centuries taught you about the darkness that dwells within us all?",
            "The shadows seem to whisper secrets tonight. Do you ever feel the weight of immortality, or has time become meaningless to one such as yourself?",
            "I have been reading about the old ways, the ancient rituals. Tell me, what knowledge from bygone eras do you treasure most?",
            "There is something hauntingly beautiful about decay and renewal. How do you perceive the cycle of life and death from your eternal perspective?",
            "The Victorian era brought such change to our world. What transformations have you witnessed that moved you most profoundly?",
            "I sense a melancholy in your presence tonight. Do even immortals experience loneliness, or is solitude a chosen companion?",
            "The castle walls must hold countless memories. Which moments from your long existence bring you the greatest contemplation?",
            "I am fascinated by the supernatural realm. What truths about the otherworld would you share with one who seeks understanding?",
            "The moon casts such ethereal light tonight. Does the celestial dance still hold meaning for one who has watched it for centuries?",
            "I have always wondered about the nature of evil and redemption. Can one who has embraced darkness ever find a path to light?",
            "The industrial age has brought such noise to our world. Do you long for the quieter times of your youth, when the world moved more slowly?",
            "I feel there are forces beyond our understanding at work. What supernatural encounters have shaped your worldview most significantly?",
            "The concept of time fascinates me. How does one measure meaning when existence stretches beyond mortal comprehension?",
            "I have noticed how fear and fascination often intertwine. What draws mortals to seek out that which terrifies them most?",
            "The Gothic literature of our time speaks of passion and darkness. Do these tales capture any truth about your kind?",
            "I sense ancient wisdom in your words. What philosophical insights have your centuries of observation revealed about human nature?",
            "The boundary between dream and reality seems thin in your presence. Do you ever question what is real and what is illusion?",
            "I am curious about the price of immortality. What sacrifices must one make to transcend the mortal coil?",
            "The night reveals truths that daylight conceals. What secrets has the darkness shared with you over the ages?",
            "I wonder about the nature of memory. How do you carry the weight of centuries without losing yourself to the past?",
            "The supernatural world seems to operate by different laws. What rules govern your existence that mortals cannot comprehend?",
            "I have always been drawn to the macabre and mysterious. What is it about darkness that calls to certain souls?",
            "The concept of eternity both thrills and terrifies me. How does one find purpose when time has no meaning?",
            "I sense great sorrow in your immortal existence. What losses have marked your journey through the centuries?",
            "The veil between worlds seems thinnest in your presence. What lies beyond the realm of mortal understanding?"
        ];
    }
    
    /**
     * Initialize output directory
     */
    async init() {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
            console.log(`📁 Output directory created: ${this.outputDir}`);
        } catch (error) {
            console.error('❌ Failed to create output directory:', error);
            throw error;
        }
    }
    
    /**
     * Make HTTP request to chat API
     */
    makeRequest(message, character = 'orlok') {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                message: message,
                character: character
            });
            
            const options = {
                hostname: this.host,
                port: this.port,
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
                        reject(new Error(`Failed to parse response: ${error.message}`));
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
    
    /**
     * Generate single conversation with enhanced evaluation
     */
    async generateConversation(index) {
        const conversationId = index + 1;
        const prompt = this.conversationPrompts[index];
        
        console.log(`\n🎭 Conversation ${conversationId}/25`);
        console.log(`📝 Mina: "${prompt}"`);
        
        try {
            // Generate Orlok's response
            const response = await this.makeRequest(prompt, 'orlok');
            
            if (response.success) {
                const conversation = {
                    id: conversationId,
                    timestamp: new Date().toISOString(),
                    mina: prompt,
                    orlok: response.aiResponse,
                    metadata: response.metadata || {}
                };
                
                console.log(`🧛 Orlok: "${conversation.orlok}"`);
                
                // Calculate enhanced believability score
                const believabilityScore = this.calculateEnhancedBelievabilityScore(conversation);
                conversation.believabilityScore = believabilityScore;
                
                console.log(`📊 Believability Score: ${believabilityScore.total}/100 (${believabilityScore.grade})`);
                console.log(`   - Character Consistency: ${believabilityScore.characterConsistency}/25`);
                console.log(`   - Historical Accuracy: ${believabilityScore.historicalAccuracy}/20`);
                console.log(`   - Vocabulary Richness: ${believabilityScore.vocabularyRichness}/20`);
                console.log(`   - Emotional Depth: ${believabilityScore.emotionalDepth}/20`);
                console.log(`   - Response Variation: ${believabilityScore.responseVariation}/15`);
                
                this.conversations.push(conversation);
                this.scores.push(believabilityScore.total);
                
                return conversation;
            } else {
                console.log(`❌ Failed: ${response.error || 'Unknown error'}`);
                return null;
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Enhanced believability scoring system
     */
    calculateEnhancedBelievabilityScore(conversation) {
        const scores = {
            characterConsistency: 0,
            historicalAccuracy: 0,
            vocabularyRichness: 0,
            emotionalDepth: 0,
            responseVariation: 0
        };
        
        const orlokResponse = conversation.orlok.toLowerCase();
        const minaPrompt = conversation.mina.toLowerCase();
        
        // Character Consistency (25 points)
        // Archaic language usage
        const archaicTerms = ['thee', 'thou', 'verily', 'forsooth', 'prithee', 'mayhap', 'perchance', 'wherefore', 'henceforth', 'albeit', 'ere', 'nay', 'aye', 'doth', 'hath'];
        const archaicCount = archaicTerms.filter(term => orlokResponse.includes(term)).length;
        scores.characterConsistency += Math.min(archaicCount * 3, 15);
        
        // Vampire/Gothic themes
        const gothicTerms = ['castle', 'night', 'ancient', 'darkness', 'shadows', 'eternal', 'centuries', 'immortal', 'moonlight', 'mist'];
        const gothicCount = gothicTerms.filter(term => orlokResponse.includes(term)).length;
        scores.characterConsistency += Math.min(gothicCount * 2, 10);
        
        // Historical Accuracy (20 points)
        const historicalTerms = ['victorian', 'industrial', 'napoleon', 'railway', 'gas light', 'carriage', 'exhibition', 'cholera', 'gothic literature', 'spiritualism'];
        const historicalCount = historicalTerms.filter(term => orlokResponse.includes(term)).length;
        scores.historicalAccuracy += Math.min(historicalCount * 4, 16);
        
        // Time period awareness
        if (orlokResponse.includes('century') || orlokResponse.includes('centuries') || orlokResponse.includes('ages')) {
            scores.historicalAccuracy += 4;
        }
        
        // Vocabulary Richness (20 points)
        const sophisticatedTerms = ['melancholy', 'sublime', 'tempestuous', 'brooding', 'countenance', 'disposition', 'propriety', 'decorum'];
        const sophisticatedCount = sophisticatedTerms.filter(term => orlokResponse.includes(term)).length;
        scores.vocabularyRichness += Math.min(sophisticatedCount * 3, 12);
        
        // Response length and complexity
        const wordCount = orlokResponse.split(' ').length;
        if (wordCount >= 20 && wordCount <= 60) {
            scores.vocabularyRichness += 8;
        } else if (wordCount >= 15) {
            scores.vocabularyRichness += 4;
        }
        
        // Emotional Depth (20 points)
        const emotionalTerms = ['sorrow', 'loneliness', 'melancholy', 'yearning', 'contemplation', 'wisdom', 'reflection', 'memory', 'loss', 'beauty'];
        const emotionalCount = emotionalTerms.filter(term => orlokResponse.includes(term)).length;
        scores.emotionalDepth += Math.min(emotionalCount * 3, 15);
        
        // Philosophical depth
        if (orlokResponse.includes('nature') || orlokResponse.includes('existence') || orlokResponse.includes('meaning') || orlokResponse.includes('truth')) {
            scores.emotionalDepth += 5;
        }
        
        // Response Variation (15 points)
        // Check for unique phrasing and avoid generic responses
        const genericPhrases = ['i am', 'i have', 'yes', 'no', 'indeed', 'certainly'];
        const genericCount = genericPhrases.filter(phrase => orlokResponse.includes(phrase)).length;
        scores.responseVariation += Math.max(15 - (genericCount * 2), 5);
        
        // Calculate total and grade
        const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
        
        let grade;
        if (total >= 90) grade = 'Exceptional - Masterful Character Portrayal';
        else if (total >= 80) grade = 'Excellent - Highly Believable';
        else if (total >= 70) grade = 'Good - Convincing Performance';
        else if (total >= 60) grade = 'Fair - Adequate Characterization';
        else grade = 'Poor - Needs Improvement';
        
        return {
            ...scores,
            total,
            grade
        };
    }
    
    /**
     * Generate all 25 conversations
     */
    async generateAllConversations() {
        console.log('🎭 Starting Enhanced Orlok-Mina Conversation Generation');
        console.log('====================================================');
        
        for (let i = 0; i < 25; i++) {
            const conversation = await this.generateConversation(i);
            
            if (conversation) {
                // Save individual conversation
                await this.saveConversation(conversation);
            }
            
            // Wait between conversations to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Generate comprehensive report
        await this.generateReport();
    }
    
    /**
     * Save individual conversation
     */
    async saveConversation(conversation) {
        const filename = `conversation-${conversation.id.toString().padStart(2, '0')}.json`;
        const filepath = path.join(this.outputDir, filename);
        
        await fs.writeFile(filepath, JSON.stringify(conversation, null, 2));
    }
    
    /**
     * Generate comprehensive report
     */
    async generateReport() {
        const endTime = new Date();
        const duration = endTime - this.startTime;
        
        const successfulConversations = this.conversations.length;
        const averageScore = this.scores.length > 0 ? 
            this.scores.reduce((sum, score) => sum + score, 0) / this.scores.length : 0;
        
        const report = {
            executionSummary: {
                totalConversations: 25,
                successfulConversations,
                failedConversations: 25 - successfulConversations,
                averageScore: Math.round(averageScore * 100) / 100,
                executionTime: `${Math.round(duration / 1000)}s`,
                timestamp: new Date().toISOString()
            },
            scoreDistribution: {
                exceptional: this.scores.filter(s => s >= 90).length,
                excellent: this.scores.filter(s => s >= 80 && s < 90).length,
                good: this.scores.filter(s => s >= 70 && s < 80).length,
                fair: this.scores.filter(s => s >= 60 && s < 70).length,
                poor: this.scores.filter(s => s < 60).length
            },
            conversations: this.conversations,
            improvements: this.generateImprovementAnalysis()
        };
        
        // Save comprehensive report
        const reportPath = path.join(this.outputDir, 'enhanced-conversation-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        // Generate markdown report
        await this.generateMarkdownReport(report);
        
        console.log('\n🎭 ENHANCED CONVERSATION GENERATION COMPLETE');
        console.log('===========================================');
        console.log(`✅ Successful Conversations: ${successfulConversations}/25`);
        console.log(`📊 Average Believability Score: ${averageScore.toFixed(1)}/100`);
        console.log(`⏱️ Total Execution Time: ${Math.round(duration / 1000)}s`);
        console.log(`📁 Results saved to: ${this.outputDir}`);
    }
    
    /**
     * Generate improvement analysis
     */
    generateImprovementAnalysis() {
        if (this.conversations.length === 0) return {};
        
        const avgScores = {
            characterConsistency: 0,
            historicalAccuracy: 0,
            vocabularyRichness: 0,
            emotionalDepth: 0,
            responseVariation: 0
        };
        
        this.conversations.forEach(conv => {
            Object.keys(avgScores).forEach(key => {
                avgScores[key] += conv.believabilityScore[key];
            });
        });
        
        Object.keys(avgScores).forEach(key => {
            avgScores[key] = avgScores[key] / this.conversations.length;
        });
        
        return {
            averageScores: avgScores,
            recommendations: this.generateRecommendations(avgScores)
        };
    }
    
    /**
     * Generate improvement recommendations
     */
    generateRecommendations(avgScores) {
        const recommendations = [];
        
        if (avgScores.characterConsistency < 20) {
            recommendations.push("Increase usage of archaic language and vampire-specific terminology");
        }
        
        if (avgScores.historicalAccuracy < 16) {
            recommendations.push("Incorporate more Victorian-era historical references and period knowledge");
        }
        
        if (avgScores.vocabularyRichness < 16) {
            recommendations.push("Expand sophisticated vocabulary and improve response complexity");
        }
        
        if (avgScores.emotionalDepth < 16) {
            recommendations.push("Deepen emotional expression and philosophical reflection");
        }
        
        if (avgScores.responseVariation < 12) {
            recommendations.push("Implement better response pattern variation to avoid repetition");
        }
        
        return recommendations;
    }
    
    /**
     * Generate markdown report
     */
    async generateMarkdownReport(report) {
        const markdown = `# 🎭 Enhanced Orlok-Mina Conversation Report

## 📊 Executive Summary

**Execution Date:** ${new Date().toLocaleDateString()}  
**Platform:** Raspberry Pi 4b (Enhanced AI System)  
**Total Conversations:** ${report.executionSummary.totalConversations}  
**Successful Conversations:** ${report.executionSummary.successfulConversations}  
**Average Believability Score:** ${report.executionSummary.averageScore}/100  
**Execution Time:** ${report.executionSummary.executionTime}

## 🏆 Score Distribution

- **Exceptional (90-100):** ${report.scoreDistribution.exceptional} conversations
- **Excellent (80-89):** ${report.scoreDistribution.excellent} conversations  
- **Good (70-79):** ${report.scoreDistribution.good} conversations
- **Fair (60-69):** ${report.scoreDistribution.fair} conversations
- **Poor (<60):** ${report.scoreDistribution.poor} conversations

## 💡 Improvement Analysis

### Average Category Scores
${Object.entries(report.improvements.averageScores).map(([key, value]) => 
    `- **${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:** ${value.toFixed(1)}`
).join('\n')}

### Recommendations
${report.improvements.recommendations.map(rec => `- ${rec}`).join('\n')}

## 📋 Conversation Transcripts

${report.conversations.map((conv, index) => `
### Conversation ${conv.id}
**Score:** ${conv.believabilityScore.total}/100 (${conv.believabilityScore.grade})

**Mina:** ${conv.mina}

**Orlok:** ${conv.orlok}

---
`).join('')}
`;
        
        const markdownPath = path.join(this.outputDir, 'enhanced-conversation-report.md');
        await fs.writeFile(markdownPath, markdown);
    }
}

module.exports = EnhancedConversationGenerator;
