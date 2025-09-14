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
        
        // Natural conversation starters - alternating who starts
        this.conversationStarters = [
            // Mina starts (conversations 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25)
            {
                starter: "mina",
                opening: "Count Orlok... there's something I must ask you."
            },
            {
                starter: "orlok",
                opening: "Thou art curious about things best left unknown."
            },
            {
                starter: "mina",
                opening: "I've been having the strangest dreams lately."
            },
            {
                starter: "orlok",
                opening: "The night calls to thee, does it not?"
            },
            {
                starter: "mina",
                opening: "There's something different about you... something ancient."
            },
            {
                starter: "orlok",
                opening: "Mortals fear what they do not understand."
            },
            {
                starter: "mina",
                opening: "I feel as though I've met you before, in another life perhaps."
            },
            {
                starter: "orlok",
                opening: "Time moves differently for my kind."
            },
            {
                starter: "mina",
                opening: "The shadows seem to follow you wherever you go."
            },
            {
                starter: "orlok",
                opening: "Darkness is my domain, child."
            },
            {
                starter: "mina",
                opening: "I shouldn't be here, should I?"
            },
            {
                starter: "orlok",
                opening: "Fear is... wise."
            },
            {
                starter: "mina",
                opening: "What are you, really?"
            },
            {
                starter: "orlok",
                opening: "Death walks among the living."
            },
            {
                starter: "mina",
                opening: "I can't stop thinking about our last conversation."
            },
            {
                starter: "orlok",
                opening: "Blood remembers."
            },
            {
                starter: "mina",
                opening: "You're not like the others, are you?"
            },
            {
                starter: "orlok",
                opening: "I am eternal."
            },
            {
                starter: "mina",
                opening: "Sometimes I wonder if I'm losing my mind."
            },
            {
                starter: "orlok",
                opening: "Madness and truth are... close companions."
            },
            {
                starter: "mina",
                opening: "The way you look at me... it's unsettling."
            },
            {
                starter: "orlok",
                opening: "Hunger never sleeps."
            },
            {
                starter: "mina",
                opening: "I should leave. This isn't safe."
            },
            {
                starter: "orlok",
                opening: "Running will not save thee."
            },
            {
                starter: "mina",
                opening: "What do you want from me?"
            }
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
     * Generate single 20-exchange conversation with realistic flow
     */
    async generateConversation(index) {
        const conversationId = index + 1;
        const starter = this.conversationStarters[index];

        console.log(`\n🎭 Conversation ${conversationId}/25`);
        console.log(`👤 Starter: ${starter.starter}`);

        try {
            const conversation = {
                id: conversationId,
                timestamp: new Date().toISOString(),
                exchanges: [],
                starter: starter.starter,
                metadata: {}
            };

            // Start the conversation
            let currentSpeaker = starter.starter;
            let currentMessage = starter.opening;

            console.log(`${currentSpeaker === 'mina' ? '👩' : '🧛'} ${currentSpeaker === 'mina' ? 'Mina' : 'Orlok'}: "${currentMessage}"`);

            conversation.exchanges.push({
                speaker: currentSpeaker,
                message: currentMessage,
                timestamp: new Date().toISOString()
            });

            // Generate 19 more exchanges (total 20)
            for (let i = 1; i < 20; i++) {
                // Switch speaker
                currentSpeaker = currentSpeaker === 'mina' ? 'orlok' : 'mina';

                // Generate response
                const response = await this.makeRequest(currentMessage, currentSpeaker);

                if (response.success) {
                    currentMessage = response.aiResponse;

                    // Add natural pauses and interruptions occasionally
                    if (Math.random() < 0.15) { // 15% chance
                        if (currentSpeaker === 'mina') {
                            currentMessage = this.addNaturalPause(currentMessage);
                        } else {
                            currentMessage = this.addOminousPause(currentMessage);
                        }
                    }

                    console.log(`${currentSpeaker === 'mina' ? '👩' : '🧛'} ${currentSpeaker === 'mina' ? 'Mina' : 'Orlok'}: "${currentMessage}"`);

                    conversation.exchanges.push({
                        speaker: currentSpeaker,
                        message: currentMessage,
                        timestamp: new Date().toISOString()
                    });

                    // Small delay between exchanges for realism
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    console.log(`❌ Failed at exchange ${i + 1}: ${response.error || 'Unknown error'}`);
                    break;
                }
            }

            // Calculate enhanced believability score
            const believabilityScore = this.calculateConversationScore(conversation);
            conversation.believabilityScore = believabilityScore;

            console.log(`📊 Believability Score: ${believabilityScore.total}/100 (${believabilityScore.grade})`);
            console.log(`   - Natural Flow: ${believabilityScore.naturalFlow}/25`);
            console.log(`   - Character Consistency: ${believabilityScore.characterConsistency}/25`);
            console.log(`   - Response Length: ${believabilityScore.responseLength}/20`);
            console.log(`   - Realism: ${believabilityScore.realism}/20`);
            console.log(`   - Engagement: ${believabilityScore.engagement}/10`);

            this.conversations.push(conversation);
            this.scores.push(believabilityScore.total);

            return conversation;

        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            return null;
        }
    }

    /**
     * Add natural pauses to Mina's responses
     */
    addNaturalPause(message) {
        const pauses = [
            "I... " + message,
            message + " ...I think.",
            message.replace(/\.$/, "... if that makes sense."),
            "Wait, " + message.toLowerCase(),
            message + " I'm sorry, that sounded strange."
        ];
        return pauses[Math.floor(Math.random() * pauses.length)];
    }

    /**
     * Add ominous pauses to Orlok's responses
     */
    addOminousPause(message) {
        const pauses = [
            message + " ...",
            "*silence* " + message,
            message + " *eyes gleam*",
            "*low growl* " + message,
            message + " *steps closer*"
        ];
        return pauses[Math.floor(Math.random() * pauses.length)];
    }

    /**
     * Calculate conversation score based on realism and believability
     */
    calculateConversationScore(conversation) {
        const scores = {
            naturalFlow: 0,
            characterConsistency: 0,
            responseLength: 0,
            realism: 0,
            engagement: 0
        };

        // Natural Flow (25 points) - Check for realistic conversation patterns
        let flowScore = 15; // Base score

        // Check for appropriate turn-taking
        let properTurns = 0;
        for (let i = 1; i < conversation.exchanges.length; i++) {
            if (conversation.exchanges[i].speaker !== conversation.exchanges[i-1].speaker) {
                properTurns++;
            }
        }
        flowScore += Math.min((properTurns / (conversation.exchanges.length - 1)) * 10, 10);
        scores.naturalFlow = Math.min(flowScore, 25);

        // Character Consistency (25 points) - AGGRESSIVE scoring for short responses
        let consistencyScore = 0;
        conversation.exchanges.forEach(exchange => {
            const message = exchange.message.toLowerCase();
            const wordCount = exchange.message.split(' ').length;

            if (exchange.speaker === 'orlok') {
                // Reward short, scary responses
                if (wordCount <= 5) {
                    consistencyScore += 5; // Big bonus for very short responses
                } else if (wordCount <= 10) {
                    consistencyScore += 3; // Good bonus for short responses
                } else if (wordCount <= 15) {
                    consistencyScore += 1; // Small bonus for acceptable length
                } else {
                    consistencyScore -= 5; // Heavy penalty for long responses
                }

                // Check for vampire characteristics
                if (message.includes('thou') || message.includes('thee') || message.includes('darkness') ||
                    message.includes('blood') || message.includes('death') || message.includes('hunger')) {
                    consistencyScore += 2;
                }

                // Bonus for scary/predatory words
                if (message.includes('prey') || message.includes('fear') || message.includes('fragile') ||
                    message.includes('hunt') || message.includes('kill')) {
                    consistencyScore += 3;
                }
            } else {
                // Reward natural human reactions
                if (wordCount <= 10) {
                    consistencyScore += 3; // Bonus for short, natural responses
                } else if (wordCount <= 20) {
                    consistencyScore += 1; // Small bonus for reasonable length
                } else {
                    consistencyScore -= 3; // Penalty for long responses
                }

                // Check for human reactions
                if (message.includes('what') || message.includes('how') || message.includes('why') ||
                    message.includes('that\'s') || message.includes('i...') || message.includes('wait')) {
                    consistencyScore += 2;
                }
            }
        });
        scores.characterConsistency = Math.min(Math.max(consistencyScore, 0), 25);

        // Response Length (20 points) - HEAVILY reward short responses
        let lengthScore = 0;
        conversation.exchanges.forEach(exchange => {
            const charCount = exchange.message.length;
            const wordCount = exchange.message.split(' ').length;

            if (exchange.speaker === 'orlok') {
                // Orlok scoring - very aggressive for short responses
                if (charCount <= 30) {
                    lengthScore += 3; // Excellent - very short
                } else if (charCount <= 50) {
                    lengthScore += 2; // Good - short
                } else if (charCount <= 80) {
                    lengthScore += 1; // Acceptable
                } else {
                    lengthScore -= 3; // Heavy penalty for long responses
                }
            } else {
                // Mina scoring - reward natural short responses
                if (charCount <= 50) {
                    lengthScore += 2; // Good - natural length
                } else if (charCount <= 100) {
                    lengthScore += 1; // Acceptable
                } else {
                    lengthScore -= 2; // Penalty for long responses
                }
            }
        });
        scores.responseLength = Math.min(Math.max(lengthScore, 0), 20);

        // Realism (20 points) - Natural speech patterns
        let realismScore = 10; // Base score
        conversation.exchanges.forEach(exchange => {
            const message = exchange.message;

            // Check for natural speech patterns
            if (message.includes('...') || message.includes('I...') || message.includes('Wait,') ||
                message.includes('*') || message.includes('silence')) {
                realismScore += 1;
            }

            // Penalty for overly formal language
            if (message.includes('forsooth') || message.includes('verily') || message.includes('prithee')) {
                realismScore -= 1;
            }
        });
        scores.realism = Math.min(Math.max(realismScore, 0), 20);

        // Engagement (10 points) - Conversation maintains interest
        let engagementScore = 5; // Base score
        if (conversation.exchanges.length >= 18) {
            engagementScore += 3; // Bonus for completing most exchanges
        }
        if (conversation.exchanges.length === 20) {
            engagementScore += 2; // Bonus for completing all exchanges
        }
        scores.engagement = Math.min(engagementScore, 10);

        // Calculate total and grade
        const total = Object.values(scores).reduce((sum, score) => sum + score, 0);

        let grade;
        if (total >= 90) grade = 'Exceptional - Masterful Realistic Conversation';
        else if (total >= 80) grade = 'Excellent - Highly Believable';
        else if (total >= 70) grade = 'Good - Convincing and Natural';
        else if (total >= 60) grade = 'Fair - Adequate Realism';
        else grade = 'Poor - Needs Improvement';

        return {
            ...scores,
            total,
            grade
        };
    }

    /**
     * Legacy scoring method (kept for compatibility)
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
