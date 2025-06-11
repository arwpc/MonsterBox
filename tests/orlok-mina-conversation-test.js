const { expect } = require('chai');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

describe('🎭 Orlok & Mina Conversation Believability Tests', function() {
    this.timeout(300000); // 5 minutes per test
    
    let browser;
    let page;
    const conversationTranscripts = [];
    const believabilityScores = [];
    
    // Conversation prompts for testing
    const conversationStarters = [
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

    before(async function() {
        console.log('🎭 Starting Orlok & Mina Conversation Tests on RPI4b');
        
        // Launch browser in headless mode for automated testing
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        
        // Navigate to the chat interface on RPI4b
        await page.goto('http://192.168.8.140:3000/chatterpi-ai-chat.html');
        await page.waitForSelector('#chatMessages', { timeout: 30000 });
        
        console.log('✅ Connected to MonsterBox chat interface on RPI4b');
    });

    // Generate 25 conversation tests
    for (let i = 0; i < 25; i++) {
        it(`should conduct believable conversation ${i + 1}/25`, async function() {
            const conversationId = i + 1;
            const prompt = conversationStarters[i];
            
            console.log(`\n🎭 Conversation ${conversationId}: Testing with prompt: "${prompt}"`);
            
            // Switch to Mina character first
            await page.evaluate(() => {
                if (window.chatManager && window.chatManager.changeCharacter) {
                    window.chatManager.changeCharacter('mina');
                }
            });
            
            await page.waitForTimeout(1000);
            
            // Send message as Mina
            await page.type('#chatInput', prompt);
            await page.click('#sendButton');
            
            // Wait for Orlok's response
            await page.waitForTimeout(5000);
            
            // Get conversation history
            const messages = await page.evaluate(() => {
                const messageElements = document.querySelectorAll('.message');
                return Array.from(messageElements).map(el => ({
                    type: el.classList.contains('user') ? 'user' : 'bot',
                    content: el.querySelector('.message-content').textContent.trim(),
                    timestamp: new Date().toISOString()
                }));
            });
            
            // Extract the latest exchange
            const latestMessages = messages.slice(-2);
            const minaMessage = latestMessages.find(m => m.type === 'user');
            const orlokResponse = latestMessages.find(m => m.type === 'bot');
            
            if (minaMessage && orlokResponse) {
                const conversation = {
                    id: conversationId,
                    mina: minaMessage.content,
                    orlok: orlokResponse.content,
                    timestamp: new Date().toISOString()
                };
                
                conversationTranscripts.push(conversation);
                
                // Calculate believability score
                const believabilityScore = calculateBelievabilityScore(conversation);
                believabilityScores.push(believabilityScore);
                
                console.log(`📝 Mina: ${conversation.mina}`);
                console.log(`🧛 Orlok: ${conversation.orlok}`);
                console.log(`📊 Believability Score: ${believabilityScore.total}/100`);
                
                // Validate conversation quality
                expect(orlokResponse.content).to.not.be.empty;
                expect(orlokResponse.content.length).to.be.greaterThan(10);
                expect(believabilityScore.total).to.be.greaterThan(50); // Minimum believability threshold
            }
            
            await page.waitForTimeout(2000); // Pause between conversations
        });
    }

    after(async function() {
        // Generate comprehensive report
        const report = generateBelievabilityReport(conversationTranscripts, believabilityScores);
        
        // Save transcripts and report
        const reportsDir = path.join(__dirname, '../reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(reportsDir, 'orlok-mina-conversations.json'),
            JSON.stringify(conversationTranscripts, null, 2)
        );
        
        fs.writeFileSync(
            path.join(reportsDir, 'believability-report.json'),
            JSON.stringify(report, null, 2)
        );
        
        console.log('\n🎭 CONVERSATION TEST SUMMARY');
        console.log('============================');
        console.log(`Total Conversations: ${conversationTranscripts.length}`);
        console.log(`Average Believability: ${report.averageScore.toFixed(1)}/100`);
        console.log(`Highest Score: ${report.highestScore}/100`);
        console.log(`Lowest Score: ${report.lowestScore}/100`);
        console.log(`Conversations Above 80: ${report.highQualityCount}`);
        console.log(`Conversations Above 60: ${report.mediumQualityCount}`);
        console.log(`Overall Grade: ${report.overallGrade}`);
        
        if (browser) {
            await browser.close();
        }
        
        console.log('✅ All conversation tests completed and reports generated');
    });
});

function calculateBelievabilityScore(conversation) {
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
    if (orlokResponse.includes('castle') || orlokResponse.includes('night') || orlokResponse.includes('ancient')) {
        scores.characterConsistency += 10;
    }
    
    // Response Relevance (20 points)
    const relevantKeywords = ['darkness', 'shadow', 'blood', 'immortal', 'vampire', 'supernatural', 'death', 'eternal'];
    const relevantMatches = relevantKeywords.filter(keyword => 
        orlokResponse.includes(keyword) || minaPrompt.includes(keyword)
    ).length;
    scores.responseRelevance = Math.min(20, relevantMatches * 3);
    
    // Emotional Depth (20 points)
    const emotionalWords = ['loneliness', 'sorrow', 'desire', 'fear', 'fascination', 'mystery', 'haunting', 'yearning'];
    const emotionalMatches = emotionalWords.filter(word => orlokResponse.includes(word)).length;
    scores.emotionalDepth = Math.min(20, emotionalMatches * 5);
    
    // Language Style (20 points)
    if (orlokResponse.length > 50) scores.languageStyle += 10; // Adequate length
    if (orlokResponse.includes('.') && orlokResponse.includes(',')) scores.languageStyle += 10; // Proper punctuation
    
    // Narrative Flow (20 points)
    if (orlokResponse.includes('...') || orlokResponse.includes('—')) scores.narrativeFlow += 10; // Dramatic pauses
    if (!orlokResponse.includes('i am') && !orlokResponse.includes('my name is')) scores.narrativeFlow += 10; // Avoids basic introductions
    
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    
    return {
        ...scores,
        total,
        grade: getGrade(total)
    };
}

function getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}

function generateBelievabilityReport(transcripts, scores) {
    const totalScores = scores.map(s => s.total);
    const averageScore = totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;
    const highestScore = Math.max(...totalScores);
    const lowestScore = Math.min(...totalScores);
    
    const highQualityCount = totalScores.filter(score => score >= 80).length;
    const mediumQualityCount = totalScores.filter(score => score >= 60).length;
    
    let overallGrade;
    if (averageScore >= 80) overallGrade = 'Excellent';
    else if (averageScore >= 70) overallGrade = 'Good';
    else if (averageScore >= 60) overallGrade = 'Satisfactory';
    else if (averageScore >= 50) overallGrade = 'Needs Improvement';
    else overallGrade = 'Poor';
    
    return {
        totalConversations: transcripts.length,
        averageScore,
        highestScore,
        lowestScore,
        highQualityCount,
        mediumQualityCount,
        overallGrade,
        detailedScores: scores,
        recommendations: generateRecommendations(scores)
    };
}

function generateRecommendations(scores) {
    const recommendations = [];
    
    const avgCharacterConsistency = scores.reduce((sum, s) => sum + s.characterConsistency, 0) / scores.length;
    const avgResponseRelevance = scores.reduce((sum, s) => sum + s.responseRelevance, 0) / scores.length;
    const avgEmotionalDepth = scores.reduce((sum, s) => sum + s.emotionalDepth, 0) / scores.length;
    
    if (avgCharacterConsistency < 15) {
        recommendations.push('Improve character consistency by using more archaic language and vampire-specific terminology');
    }
    
    if (avgResponseRelevance < 15) {
        recommendations.push('Enhance response relevance by better addressing the themes and topics raised by Mina');
    }
    
    if (avgEmotionalDepth < 15) {
        recommendations.push('Increase emotional depth by exploring the psychological aspects of immortality and supernatural existence');
    }
    
    return recommendations;
}
