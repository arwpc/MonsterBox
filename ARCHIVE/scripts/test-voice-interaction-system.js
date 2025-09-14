#!/usr/bin/env node

/**
 * Voice Interaction System Test Runner
 * 
 * Comprehensive test runner for the voice interaction system that properly
 * demonstrates the naming conventions and integration between:
 * - OpenAI Whisper for Speech-to-Text (STT)
 * - TopMediai for Text-to-Speech (TTS)
 * - ChatterPi audio streaming integration
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

class VoiceInteractionTestRunner {
    constructor() {
        this.testResults = {
            openaiWhisperSTT: null,
            topmediaiTTS: null,
            voiceInteractionSystem: null,
            voiceChatRoutes: null,
            integration: null
        };
        
        this.config = {
            timeout: 30000,
            reporter: './tests/cleanReporter.js',
            environment: 'test'
        };
    }

    async runAllTests() {
        console.log('🧪 Voice Interaction System Test Suite');
        console.log('=====================================\n');
        
        console.log('Testing the complete voice interaction pipeline:');
        console.log('📢 OpenAI Whisper (STT) → 🤖 AI Chat → 🔊 TopMediai (TTS) → 🎭 Jaw Animation\n');

        try {
            // Run individual component tests
            await this.runOpenAIWhisperTests();
            await this.runTopMediaiTTSTests();
            await this.runVoiceInteractionSystemTests();
            await this.runVoiceChatRouteTests();
            
            // Run integration tests
            await this.runIntegrationTests();
            
            // Display summary
            this.displayTestSummary();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
            process.exit(1);
        }
    }

    async runOpenAIWhisperTests() {
        console.log('1️⃣ Testing OpenAI Whisper STT Integration...');
        
        try {
            const result = await this.runMochaTest('tests/openai-whisper-stt.test.js');
            this.testResults.openaiWhisperSTT = result;
            
            if (result.success) {
                console.log('   ✅ OpenAI Whisper STT tests passed');
            } else {
                console.log('   ❌ OpenAI Whisper STT tests failed');
            }
        } catch (error) {
            console.log('   ❌ OpenAI Whisper STT tests error:', error.message);
            this.testResults.openaiWhisperSTT = { success: false, error: error.message };
        }
        
        console.log('');
    }

    async runTopMediaiTTSTests() {
        console.log('2️⃣ Testing TopMediai TTS Integration...');
        
        try {
            const result = await this.runMochaTest('tests/topmediai-tts-integration.test.js');
            this.testResults.topmediaiTTS = result;
            
            if (result.success) {
                console.log('   ✅ TopMediai TTS tests passed');
            } else {
                console.log('   ❌ TopMediai TTS tests failed');
            }
        } catch (error) {
            console.log('   ❌ TopMediai TTS tests error:', error.message);
            this.testResults.topmediaiTTS = { success: false, error: error.message };
        }
        
        console.log('');
    }

    async runVoiceInteractionSystemTests() {
        console.log('3️⃣ Testing Voice Interaction System Integration...');
        
        try {
            const result = await this.runMochaTest('tests/voice-interaction-system.test.js');
            this.testResults.voiceInteractionSystem = result;
            
            if (result.success) {
                console.log('   ✅ Voice Interaction System tests passed');
            } else {
                console.log('   ❌ Voice Interaction System tests failed');
            }
        } catch (error) {
            console.log('   ❌ Voice Interaction System tests error:', error.message);
            this.testResults.voiceInteractionSystem = { success: false, error: error.message };
        }
        
        console.log('');
    }

    async runVoiceChatRouteTests() {
        console.log('4️⃣ Testing Voice Chat API Routes...');
        
        try {
            const result = await this.runMochaTest('tests/voice-chat-routes.test.js');
            this.testResults.voiceChatRoutes = result;
            
            if (result.success) {
                console.log('   ✅ Voice Chat Routes tests passed');
            } else {
                console.log('   ❌ Voice Chat Routes tests failed');
            }
        } catch (error) {
            console.log('   ❌ Voice Chat Routes tests error:', error.message);
            this.testResults.voiceChatRoutes = { success: false, error: error.message };
        }
        
        console.log('');
    }

    async runIntegrationTests() {
        console.log('5️⃣ Running Integration Tests...');
        
        try {
            // Test the actual integration scripts
            const integrationTests = [
                this.testOpenAISTTIntegrationScript(),
                this.testVoicePipelineAnalyzer(),
                this.testVoiceInteractionPipeline()
            ];
            
            const results = await Promise.allSettled(integrationTests);
            const allPassed = results.every(result => 
                result.status === 'fulfilled' && result.value.success
            );
            
            this.testResults.integration = { 
                success: allPassed,
                details: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
            };
            
            if (allPassed) {
                console.log('   ✅ Integration tests passed');
            } else {
                console.log('   ❌ Some integration tests failed');
            }
        } catch (error) {
            console.log('   ❌ Integration tests error:', error.message);
            this.testResults.integration = { success: false, error: error.message };
        }
        
        console.log('');
    }

    async testOpenAISTTIntegrationScript() {
        console.log('   🔍 Testing OpenAI STT Integration Script...');
        
        try {
            // Check if the script exists and is properly named
            const scriptPath = path.join(__dirname, 'chatterpi', 'openai_stt_integration.js');
            const fs = require('fs').promises;
            
            await fs.access(scriptPath);
            
            // Basic syntax check
            require(scriptPath);
            
            console.log('     ✅ OpenAI STT Integration script is valid');
            return { success: true, component: 'OpenAI STT Integration Script' };
            
        } catch (error) {
            console.log('     ❌ OpenAI STT Integration script error:', error.message);
            return { success: false, component: 'OpenAI STT Integration Script', error: error.message };
        }
    }

    async testVoicePipelineAnalyzer() {
        console.log('   🔍 Testing Voice Pipeline Analyzer...');
        
        try {
            const analyzerPath = path.join(__dirname, 'chatterpi', 'voice_pipeline_analyzer.js');
            const fs = require('fs').promises;
            
            await fs.access(analyzerPath);
            
            // Basic syntax check
            const { VoicePipelineOptimizer } = require(analyzerPath);
            const optimizer = new VoicePipelineOptimizer();
            
            console.log('     ✅ Voice Pipeline Analyzer is valid');
            return { success: true, component: 'Voice Pipeline Analyzer' };
            
        } catch (error) {
            console.log('     ❌ Voice Pipeline Analyzer error:', error.message);
            return { success: false, component: 'Voice Pipeline Analyzer', error: error.message };
        }
    }

    async testVoiceInteractionPipeline() {
        console.log('   🔍 Testing Voice Interaction Pipeline...');
        
        try {
            const pipelinePath = path.join(__dirname, 'chatterpi', 'test_voice_interaction_pipeline.js');
            const fs = require('fs').promises;
            
            await fs.access(pipelinePath);
            
            // Basic syntax check
            const { VoiceInteractionTester } = require(pipelinePath);
            
            console.log('     ✅ Voice Interaction Pipeline test is valid');
            return { success: true, component: 'Voice Interaction Pipeline' };
            
        } catch (error) {
            console.log('     ❌ Voice Interaction Pipeline error:', error.message);
            return { success: false, component: 'Voice Interaction Pipeline', error: error.message };
        }
    }

    async runMochaTest(testFile) {
        return new Promise((resolve, reject) => {
            const mocha = spawn('npx', [
                'mocha',
                '--reporter', this.config.reporter,
                '--timeout', this.config.timeout.toString(),
                testFile
            ], {
                env: { ...process.env, NODE_ENV: this.config.environment },
                stdio: 'pipe'
            });

            let output = '';
            let errorOutput = '';

            mocha.stdout.on('data', (data) => {
                output += data.toString();
            });

            mocha.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            mocha.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output, testFile });
                } else {
                    resolve({ success: false, output, errorOutput, code, testFile });
                }
            });

            mocha.on('error', (error) => {
                reject(error);
            });
        });
    }

    displayTestSummary() {
        console.log('📊 Test Summary');
        console.log('===============\n');
        
        const components = [
            { name: 'OpenAI Whisper STT', result: this.testResults.openaiWhisperSTT },
            { name: 'TopMediai TTS', result: this.testResults.topmediaiTTS },
            { name: 'Voice Interaction System', result: this.testResults.voiceInteractionSystem },
            { name: 'Voice Chat Routes', result: this.testResults.voiceChatRoutes },
            { name: 'Integration Tests', result: this.testResults.integration }
        ];
        
        let totalPassed = 0;
        let totalTests = components.length;
        
        components.forEach(component => {
            const status = component.result?.success ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${component.name}`);
            
            if (component.result?.success) {
                totalPassed++;
            } else if (component.result?.error) {
                console.log(`     Error: ${component.result.error}`);
            }
        });
        
        console.log('\n' + '='.repeat(50));
        console.log(`🎯 Overall Result: ${totalPassed}/${totalTests} components passed`);
        
        if (totalPassed === totalTests) {
            console.log('🎉 All voice interaction tests passed!');
            console.log('\n✨ The voice interaction system is ready:');
            console.log('   📢 OpenAI Whisper for Speech-to-Text');
            console.log('   🔊 TopMediai for Text-to-Speech');
            console.log('   🎭 ChatterPi for jaw animation');
            console.log('   🤖 Complete voice interaction pipeline');
        } else {
            console.log('⚠️ Some tests failed. Please review the errors above.');
            process.exit(1);
        }
    }

    displayNamingConventions() {
        console.log('\n📝 Naming Conventions Used:');
        console.log('==========================');
        console.log('✅ openai_stt_integration.js - OpenAI Whisper STT (not TopMediai)');
        console.log('✅ topMediaiAPI.js - TopMediai TTS API integration');
        console.log('✅ voice_pipeline_analyzer.js - Voice pipeline optimization');
        console.log('✅ test_voice_interaction_pipeline.js - Complete pipeline test');
        console.log('✅ test_openai_whisper_stt.js - OpenAI STT specific test');
        console.log('\n🎯 Each file name accurately reflects its actual functionality!');
    }
}

// Run the tests if this script is executed directly
if (require.main === module) {
    const runner = new VoiceInteractionTestRunner();
    
    console.log('🚀 Starting Voice Interaction System Tests...\n');
    
    runner.displayNamingConventions();
    
    runner.runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = { VoiceInteractionTestRunner };
