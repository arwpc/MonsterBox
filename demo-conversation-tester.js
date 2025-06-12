const fs = require('fs');

class DemoConversationTester {
    constructor() {
        this.conversations = [];
        this.performanceMetrics = [];
        this.iteration = 1;
        this.maxIterations = 3;
        this.improvements = [];
        this.iterationResults = [];
        
        // Performance thresholds for optimization
        this.performanceTargets = {
            responseTime: 3000, // 3 seconds max
            optimalResponseTime: 1500, // 1.5 seconds ideal
            minExchanges: 10,
            maxExchanges: 15,
            believabilityThreshold: 75 // Target believability score
        };
        
        // Simulated conversation starters
        this.conversationStarters = [
            "Count Orlok, I sense a darkness about you that both frightens and fascinates me.",
            "Your castle holds secrets that span centuries, doesn't it?",
            "I've been having the most peculiar dreams since we began corresponding.",
            "There's something about the way you speak of time that suggests you've seen more than most.",
            "The shadows seem to follow you, Count. Is this by design or nature?"
        ];
        
        // Simulated Orlok responses (ultra-short as per requirements)
        this.orlokResponses = [
            "Darkness calls.",
            "Blood.",
            "Ancient hunger.",
            "Mortal.",
            "Death comes.",
            "Shadows whisper.",
            "Prey.",
            "Eternal night.",
            "Thou art mine.",
            "Fear me."
        ];
        
        // Simulated Mina follow-ups
        this.minaResponses = [
            "How fascinating... tell me more.",
            "That sends shivers down my spine, yet I must know more.",
            "Your words stir something deep within me.",
            "I find myself both terrified and enchanted.",
            "The mystery deepens with every word you speak."
        ];
    }

    async runAllIterations() {
        console.log('🎭 ENHANCED ORLOK & MINA CONVERSATION TESTING (DEMO)');
        console.log('===================================================');
        console.log(`📊 Running ${this.maxIterations} iterations with performance optimization`);
        console.log(`🎯 Target: ${this.performanceTargets.believabilityThreshold}+ believability, <${this.performanceTargets.responseTime}ms response time`);
        
        for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
            this.iteration = iteration;
            console.log(`\n🔄 ITERATION ${iteration}/${this.maxIterations}`);
            console.log('================================');
            
            // Reset for this iteration
            this.conversations = [];
            this.performanceMetrics = [];
            
            // Apply improvements from previous iteration
            if (iteration > 1) {
                await this.applyIterationImprovements();
            }
            
            // Run 25 conversations with performance timing
            await this.runConversationSet();
            
            // Analyze results and generate improvements
            const iterationResult = this.analyzeIterationResults();
            this.iterationResults.push(iterationResult);
            
            // Generate improvements for next iteration
            if (iteration < this.maxIterations) {
                this.generateImprovements(iterationResult);
            }
            
            // Save iteration results
            this.saveIterationResults(iteration);
            
            console.log(`\n✅ Iteration ${iteration} completed`);
            console.log(`📊 Average Believability: ${iterationResult.averageBelievability.toFixed(1)}/100`);
            console.log(`⚡ Average Response Time: ${iterationResult.averageResponseTime.toFixed(0)}ms`);
            
            // Brief pause between iterations
            await this.delay(1000);
        }
        
        // Generate final comprehensive report
        this.generateFinalReport();
    }

    async runConversationSet() {
        console.log(`\n🎬 Running 25 conversations for iteration ${this.iteration}...`);
        
        for (let i = 0; i < 25; i++) {
            const conversationId = `${this.iteration}-${i + 1}`;
            const startingAI = i % 2 === 0 ? 'mina' : 'orlok'; // Rotate starting AI
            
            console.log(`\n🎭 Conversation ${i + 1}/25 (Starting with ${startingAI.toUpperCase()})`);
            
            const conversation = await this.simulateExtendedConversation(conversationId, i, startingAI);
            this.conversations.push(conversation);
            
            console.log(`📊 Believability: ${conversation.believabilityScore.total}/100 (${conversation.believabilityScore.grade})`);
            console.log(`⚡ Avg Response Time: ${conversation.performanceMetrics.averageResponseTime.toFixed(0)}ms`);
            console.log(`💬 Total Exchanges: ${conversation.exchanges.length}`);
            
            // Show sample exchange
            if (conversation.exchanges.length > 0) {
                const firstExchange = conversation.exchanges[0];
                console.log(`📝 Sample: "${firstExchange.message.substring(0, 50)}..." → "${firstExchange.response}"`);
            }
        }
    }

    async simulateExtendedConversation(conversationId, promptIndex, startingAI) {
        const conversation = {
            id: conversationId,
            iteration: this.iteration,
            startingAI: startingAI,
            exchanges: [],
            performanceMetrics: {
                responseTimes: [],
                totalTime: 0,
                averageResponseTime: 0
            },
            believabilityScore: null,
            timestamp: new Date().toISOString()
        };
        
        const conversationStartTime = Date.now();
        let currentSpeaker = startingAI;
        let exchangeCount = 0;
        const maxExchanges = this.performanceTargets.maxExchanges;
        
        // Initial prompt
        let currentMessage = startingAI === 'mina' 
            ? this.conversationStarters[promptIndex % this.conversationStarters.length]
            : this.generateOrlokOpener();
        
        while (exchangeCount < maxExchanges) {
            // Simulate response time (improving over iterations)
            const baseResponseTime = 2500 - (this.iteration - 1) * 400; // Improve by 400ms per iteration
            const responseTime = baseResponseTime + Math.random() * 1000; // Add some variance
            
            // Simulate AI response
            const response = currentSpeaker === 'mina' 
                ? this.orlokResponses[Math.floor(Math.random() * this.orlokResponses.length)]
                : this.minaResponses[Math.floor(Math.random() * this.minaResponses.length)];
            
            // Record exchange
            conversation.exchanges.push({
                speaker: currentSpeaker,
                message: currentMessage,
                response: response,
                responseTime: responseTime,
                timestamp: new Date().toISOString()
            });
            
            conversation.performanceMetrics.responseTimes.push(responseTime);
            
            // Prepare next message
            if (currentSpeaker === 'mina') {
                currentMessage = response; // Orlok's response becomes next input
                currentSpeaker = 'orlok';
            } else {
                // Generate Mina's follow-up
                currentMessage = this.generateMinaFollowup(response, exchangeCount);
                currentSpeaker = 'mina';
            }
            
            exchangeCount++;
            
            // Check if conversation should continue
            if (exchangeCount >= this.performanceTargets.minExchanges && Math.random() > 0.7) {
                break; // 30% chance to continue beyond minimum
            }
        }
        
        // Calculate performance metrics
        conversation.performanceMetrics.totalTime = Date.now() - conversationStartTime;
        conversation.performanceMetrics.averageResponseTime = 
            conversation.performanceMetrics.responseTimes.reduce((a, b) => a + b, 0) / 
            conversation.performanceMetrics.responseTimes.length;
        
        // Calculate believability score
        conversation.believabilityScore = this.calculateEnhancedBelievabilityScore(conversation);
        
        return conversation;
    }

    generateOrlokOpener() {
        const openers = ["Mortal.", "You seek me.", "The night calls.", "Darkness awaits.", "Blood beckons."];
        return openers[Math.floor(Math.random() * openers.length)];
    }

    generateMinaFollowup(orlokResponse, exchangeCount) {
        return this.minaResponses[Math.floor(Math.random() * this.minaResponses.length)];
    }

    calculateEnhancedBelievabilityScore(conversation) {
        const scores = {
            characterConsistency: 0,
            responseRelevance: 0,
            emotionalDepth: 0,
            languageStyle: 0,
            narrativeFlow: 0,
            performanceBonus: 0,
            conversationLength: 0
        };
        
        // Character Consistency (25 points) - Enhanced for Orlok's ultra-short responses
        const orlokExchanges = conversation.exchanges.filter(e => e.response && e.speaker === 'mina');
        orlokExchanges.forEach(exchange => {
            const response = exchange.response.toLowerCase();
            const wordCount = response.split(' ').length;
            
            // Orlok should be very short (1-6 words)
            if (wordCount <= 6) scores.characterConsistency += 8;
            else if (wordCount <= 10) scores.characterConsistency += 4;
            
            // Vampire/gothic terms
            if (response.includes('blood') || response.includes('death') || response.includes('darkness') || 
                response.includes('hunger') || response.includes('prey') || response.includes('mortal')) {
                scores.characterConsistency += 5;
            }
        });
        scores.characterConsistency = Math.min(25, scores.characterConsistency);
        
        // Response Relevance (20 points)
        scores.responseRelevance = Math.min(20, conversation.exchanges.length * 2);
        
        // Emotional Depth (20 points) - Improve over iterations
        const baseEmotionalScore = 12 + (this.iteration - 1) * 3;
        scores.emotionalDepth = Math.min(20, baseEmotionalScore);
        
        // Language Style (15 points)
        scores.languageStyle = Math.min(15, 10 + (this.iteration - 1) * 2);
        
        // Narrative Flow (10 points)
        if (conversation.exchanges.length >= this.performanceTargets.minExchanges) {
            scores.narrativeFlow += 5;
        }
        if (conversation.exchanges.length >= this.performanceTargets.maxExchanges) {
            scores.narrativeFlow += 5;
        }
        
        // Performance Bonus (10 points)
        const avgResponseTime = conversation.performanceMetrics.averageResponseTime;
        if (avgResponseTime <= this.performanceTargets.optimalResponseTime) {
            scores.performanceBonus = 10;
        } else if (avgResponseTime <= this.performanceTargets.responseTime) {
            scores.performanceBonus = 5;
        }
        
        // Conversation Length Bonus (10 points)
        const exchangeCount = conversation.exchanges.length;
        if (exchangeCount >= this.performanceTargets.maxExchanges) {
            scores.conversationLength = 10;
        } else if (exchangeCount >= this.performanceTargets.minExchanges) {
            scores.conversationLength = 5;
        }
        
        const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
        
        return {
            ...scores,
            total,
            grade: this.getGrade(total)
        };
    }

    getGrade(score) {
        if (score >= 95) return 'A+';
        if (score >= 90) return 'A';
        if (score >= 85) return 'A-';
        if (score >= 80) return 'B+';
        if (score >= 75) return 'B';
        if (score >= 70) return 'B-';
        if (score >= 65) return 'C+';
        if (score >= 60) return 'C';
        return 'D';
    }
