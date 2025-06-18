#!/usr/bin/env node

/**
 * Voice Processing Pipeline Optimizer
 * Analyzes and optimizes the complete voice interaction pipeline
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

class VoicePipelineOptimizer {
    constructor() {
        this.config = {
            // STT Optimization
            stt: {
                optimalSampleRate: 16000,
                optimalChunkSize: 1600, // 100ms at 16kHz
                confidenceThreshold: 0.7,
                silenceTimeout: 1500,
                maxConcurrentRequests: 2
            },
            
            // TTS Optimization
            tts: {
                optimalFormat: 'mp3',
                optimalBitRate: 128,
                cacheEnabled: true,
                maxCacheSize: 50
            },
            
            // Audio Processing
            audio: {
                enableVAD: true,
                enableNoiseReduction: true,
                enableEchoCancellation: true,
                smoothingAttack: 0.05,
                smoothingRelease: 0.02,
                volumeThreshold: 0.003
            },
            
            // Jaw Animation
            jawAnimation: {
                updateRate: 50, // Hz
                servoStepThreshold: 0.5,
                closedAngle: 50.0,
                openAngle: 30.0
            },
            
            // Performance
            performance: {
                maxResponseTime: 3000, // ms
                targetLatency: 500, // ms
                enableProfiling: true
            }
        };
        
        this.metrics = {
            sttLatency: [],
            aiLatency: [],
            ttsLatency: [],
            totalLatency: [],
            sttAccuracy: [],
            errorRates: {
                stt: 0,
                ai: 0,
                tts: 0,
                jaw: 0
            }
        };
    }

    async analyzeCurrentSystem() {
        console.log('🔍 Analyzing Current Voice Processing Pipeline...\n');

        const analysis = {
            sttIntegration: await this.analyzeTTSIntegration(),
            audioStreaming: await this.analyzeAudioStreaming(),
            aiIntegration: await this.analyzeAIIntegration(),
            jawAnimation: await this.analyzeJawAnimation(),
            performance: await this.analyzePerformance()
        };

        return analysis;
    }

    async analyzeTTSIntegration() {
        console.log('📊 Analyzing STT Integration...');
        
        try {
            // Check if TopMediai API is configured
            const apiKeyConfigured = !!process.env.TOPMEDIAI_API_KEY;
            
            // Check STT integration file
            const sttIntegrationPath = path.join(__dirname, 'topmediai_stt_integration.js');
            const sttExists = await this.fileExists(sttIntegrationPath);
            
            // Check audio bridge integration
            const audioBridgePath = path.join(__dirname, 'chatterpi_audio_bridge.py');
            const bridgeExists = await this.fileExists(audioBridgePath);
            
            const analysis = {
                apiConfigured: apiKeyConfigured,
                integrationExists: sttExists,
                audioBridgeIntegrated: bridgeExists,
                recommendations: []
            };
            
            if (!apiKeyConfigured) {
                analysis.recommendations.push('Configure TOPMEDIAI_API_KEY environment variable');
            }
            
            if (!sttExists) {
                analysis.recommendations.push('STT integration module missing');
            }
            
            console.log(`   API Configured: ${apiKeyConfigured ? '✅' : '❌'}`);
            console.log(`   Integration Exists: ${sttExists ? '✅' : '❌'}`);
            console.log(`   Audio Bridge: ${bridgeExists ? '✅' : '❌'}`);
            
            return analysis;
            
        } catch (error) {
            console.log(`   ❌ Analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    async analyzeAudioStreaming() {
        console.log('📊 Analyzing Audio Streaming...');
        
        try {
            // Check audio source adapters
            const adaptersPath = path.join(__dirname, 'audio_source_adapters.py');
            const adaptersExist = await this.fileExists(adaptersPath);
            
            // Check generic audio stream handler
            const handlerPath = path.join(__dirname, 'generic_audio_stream_handler.py');
            const handlerExists = await this.fileExists(handlerPath);
            
            const analysis = {
                adaptersExist,
                handlerExists,
                recommendations: []
            };
            
            if (!adaptersExist) {
                analysis.recommendations.push('Audio source adapters missing');
            }
            
            if (!handlerExists) {
                analysis.recommendations.push('Generic audio stream handler missing');
            }
            
            console.log(`   Audio Adapters: ${adaptersExist ? '✅' : '❌'}`);
            console.log(`   Stream Handler: ${handlerExists ? '✅' : '❌'}`);
            
            return analysis;
            
        } catch (error) {
            console.log(`   ❌ Analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    async analyzeAIIntegration() {
        console.log('📊 Analyzing AI Integration...');
        
        try {
            // Check OpenAI configuration
            const openaiConfigured = !!process.env.OPENAI_API_KEY;
            
            // Check AI integration files
            const aiIntegrationPath = path.join(__dirname, 'ai_integration.js');
            const aiExists = await this.fileExists(aiIntegrationPath);
            
            // Check routes
            const routesPath = path.join(__dirname, '../../routes/chatterpiRoutes.js');
            const routesExist = await this.fileExists(routesPath);
            
            const analysis = {
                openaiConfigured,
                integrationExists: aiExists,
                routesExist,
                recommendations: []
            };
            
            if (!openaiConfigured) {
                analysis.recommendations.push('Configure OPENAI_API_KEY environment variable');
            }
            
            console.log(`   OpenAI Configured: ${openaiConfigured ? '✅' : '❌'}`);
            console.log(`   AI Integration: ${aiExists ? '✅' : '❌'}`);
            console.log(`   Routes Configured: ${routesExist ? '✅' : '❌'}`);
            
            return analysis;
            
        } catch (error) {
            console.log(`   ❌ Analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    async analyzeJawAnimation() {
        console.log('📊 Analyzing Jaw Animation...');
        
        try {
            // Check animation system
            const animationPath = path.join(__dirname, 'chatterpi_animation_system.py');
            const animationExists = await this.fileExists(animationPath);
            
            // Check enhanced audio jaw animator
            const enhancedPath = path.join(__dirname, 'enhanced_audio_jaw_animator.py');
            const enhancedExists = await this.fileExists(enhancedPath);
            
            const analysis = {
                animationSystemExists: animationExists,
                enhancedAnimatorExists: enhancedExists,
                recommendations: []
            };
            
            if (!animationExists) {
                analysis.recommendations.push('ChatterPi animation system missing');
            }
            
            if (!enhancedExists) {
                analysis.recommendations.push('Enhanced audio jaw animator missing');
            }
            
            console.log(`   Animation System: ${animationExists ? '✅' : '❌'}`);
            console.log(`   Enhanced Animator: ${enhancedExists ? '✅' : '❌'}`);
            
            return analysis;
            
        } catch (error) {
            console.log(`   ❌ Analysis failed: ${error.message}`);
            return { error: error.message };
        }
    }

    async analyzePerformance() {
        console.log('📊 Analyzing Performance...');
        
        // This would typically involve running performance tests
        // For now, we'll provide theoretical analysis
        
        const analysis = {
            estimatedLatency: {
                stt: '500-2000ms',
                ai: '1000-3000ms',
                tts: '1000-3000ms',
                total: '2500-8000ms'
            },
            bottlenecks: [
                'Network latency to TopMediai API',
                'OpenAI API response time',
                'Audio processing overhead',
                'WebSocket communication delays'
            ],
            recommendations: [
                'Implement audio chunking for real-time STT',
                'Use streaming responses where possible',
                'Optimize audio buffer sizes',
                'Implement caching for common responses',
                'Use WebRTC for lower-latency audio'
            ]
        };
        
        console.log(`   Estimated Total Latency: ${analysis.estimatedLatency.total}`);
        console.log(`   Bottlenecks Identified: ${analysis.bottlenecks.length}`);
        
        return analysis;
    }

    generateOptimizationReport(analysis) {
        console.log('\n📋 Voice Processing Pipeline Optimization Report');
        console.log('=' .repeat(60));
        
        // Overall Status
        const components = [
            analysis.sttIntegration?.apiConfigured,
            analysis.sttIntegration?.integrationExists,
            analysis.audioStreaming?.adaptersExist,
            analysis.aiIntegration?.openaiConfigured,
            analysis.jawAnimation?.animationSystemExists
        ];
        
        const healthyComponents = components.filter(Boolean).length;
        const totalComponents = components.length;
        const healthPercentage = (healthyComponents / totalComponents * 100).toFixed(0);
        
        console.log(`\n🎯 System Health: ${healthPercentage}% (${healthyComponents}/${totalComponents} components ready)`);
        
        // Priority Recommendations
        console.log('\n🔧 Priority Optimizations:');
        
        const allRecommendations = [
            ...(analysis.sttIntegration?.recommendations || []),
            ...(analysis.audioStreaming?.recommendations || []),
            ...(analysis.aiIntegration?.recommendations || []),
            ...(analysis.jawAnimation?.recommendations || []),
            ...(analysis.performance?.recommendations || [])
        ];
        
        allRecommendations.forEach((rec, index) => {
            console.log(`   ${index + 1}. ${rec}`);
        });
        
        // Performance Optimizations
        console.log('\n⚡ Performance Optimizations:');
        console.log('   1. Implement audio streaming with 100ms chunks');
        console.log('   2. Use WebRTC VAD for better voice detection');
        console.log('   3. Cache TTS responses for common phrases');
        console.log('   4. Optimize servo update rates (50Hz recommended)');
        console.log('   5. Implement request queuing and rate limiting');
        
        // Configuration Recommendations
        console.log('\n⚙️ Recommended Configuration:');
        console.log(`   STT Sample Rate: ${this.config.stt.optimalSampleRate}Hz`);
        console.log(`   STT Chunk Size: ${this.config.stt.optimalChunkSize} samples`);
        console.log(`   Confidence Threshold: ${this.config.stt.confidenceThreshold}`);
        console.log(`   Jaw Update Rate: ${this.config.jawAnimation.updateRate}Hz`);
        console.log(`   Max Response Time: ${this.config.performance.maxResponseTime}ms`);
        
        return {
            healthPercentage,
            recommendations: allRecommendations,
            config: this.config
        };
    }

    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async saveOptimizedConfig(config) {
        const configPath = path.join(__dirname, 'optimized_voice_config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(`\n💾 Optimized configuration saved to: ${configPath}`);
    }
}

async function main() {
    const optimizer = new VoicePipelineOptimizer();
    
    try {
        const analysis = await optimizer.analyzeCurrentSystem();
        const report = optimizer.generateOptimizationReport(analysis);
        
        await optimizer.saveOptimizedConfig(report.config);
        
        console.log('\n✅ Voice Processing Pipeline Analysis Complete');
        console.log(`📊 System Health: ${report.healthPercentage}%`);
        console.log(`🔧 Recommendations: ${report.recommendations.length} items`);
        
    } catch (error) {
        console.error('❌ Optimization analysis failed:', error.message);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { VoicePipelineOptimizer };
