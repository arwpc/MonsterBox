#!/usr/bin/env node

/**
 * Test script for TopMediai STT Integration
 * Tests the STT functionality with sample audio data
 */

require('dotenv').config();
const TopMediaiSTTIntegration = require('./topmediai_stt_integration');
const fs = require('fs').promises;
const path = require('path');

async function testSTTIntegration() {
    console.log('🧪 Testing TopMediai STT Integration...\n');

    try {
        // Initialize STT integration
        const sttIntegration = new TopMediaiSTTIntegration({
            language: 'en',
            confidenceThreshold: 0.5,
            chunkDuration: 3000,
            fallbackToSystem: true
        });

        // Set up event listeners
        sttIntegration.on('speech_recognized', (result) => {
            console.log('✅ Speech Recognized:');
            console.log(`   Text: "${result.text}"`);
            console.log(`   Confidence: ${result.confidence.toFixed(2)}`);
            console.log(`   Provider: ${result.provider}`);
            console.log(`   Response Time: ${result.responseTime}ms\n`);
        });

        sttIntegration.on('error', (error) => {
            console.error('❌ STT Error:', error.message);
        });

        sttIntegration.on('initialized', (result) => {
            if (result.success) {
                console.log('✅ STT Integration initialized successfully\n');
            } else {
                console.log('⚠️ STT Integration initialization failed:', result.error);
            }
        });

        // Initialize
        const initialized = await sttIntegration.initialize();
        if (!initialized) {
            console.log('❌ Failed to initialize STT integration');
            return;
        }

        // Test with sample audio data
        console.log('🎤 Testing with sample audio data...\n');

        // Create some dummy audio data for testing
        // In a real scenario, this would be actual audio data from microphone
        const sampleAudioData = Buffer.alloc(16000 * 2); // 2 seconds of 16kHz audio
        
        // Fill with some dummy audio pattern (sine wave)
        for (let i = 0; i < sampleAudioData.length; i += 2) {
            const sample = Math.sin(2 * Math.PI * 440 * i / (16000 * 2)) * 32767;
            sampleAudioData.writeInt16LE(sample, i);
        }

        // Process the audio data
        const result = await sttIntegration.processAudioData(sampleAudioData, {
            sample_rate: 16000,
            format: 'pcm',
            timestamp: Date.now()
        });

        if (result) {
            console.log('✅ Audio processing completed');
        } else {
            console.log('⚠️ Audio processing returned null (may be buffering)');
        }

        // Wait a bit for any async processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test with multiple chunks
        console.log('🎤 Testing with multiple audio chunks...\n');
        
        for (let i = 0; i < 3; i++) {
            const chunkData = Buffer.alloc(8000); // 0.5 seconds
            await sttIntegration.processAudioData(chunkData, {
                sample_rate: 16000,
                format: 'pcm',
                timestamp: Date.now(),
                chunk_index: i
            });
            
            console.log(`   Processed chunk ${i + 1}/3`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Get statistics
        const stats = sttIntegration.getStats();
        console.log('\n📊 STT Statistics:');
        console.log(`   Total Requests: ${stats.totalRequests}`);
        console.log(`   Successful Requests: ${stats.successfulRequests}`);
        console.log(`   Failed Requests: ${stats.failedRequests}`);
        console.log(`   Success Rate: ${stats.successRate.toFixed(1)}%`);
        console.log(`   Average Confidence: ${stats.averageConfidence.toFixed(2)}`);
        console.log(`   Average Response Time: ${stats.averageResponseTime.toFixed(0)}ms`);
        console.log(`   Active Requests: ${stats.activeRequests}`);
        console.log(`   Buffer Size: ${stats.bufferSize}`);

        // Test API connectivity
        console.log('\n🌐 Testing TopMediai API connectivity...');
        try {
            const TopMediaiAPI = require('../topMediaiAPI');
            const api = new TopMediaiAPI();
            
            // Test with a simple text (this will test the API key and connectivity)
            const testAudio = Buffer.from('test audio data');
            const apiResult = await api.speechToText(testAudio, {
                language: 'en',
                fallbackToSystem: true
            });
            
            console.log('✅ API connectivity test result:');
            console.log(`   Text: "${apiResult.text}"`);
            console.log(`   Provider: ${apiResult.provider}`);
            console.log(`   Confidence: ${apiResult.confidence}`);
            
        } catch (apiError) {
            console.log('⚠️ API connectivity test failed:', apiError.message);
        }

        // Clean up
        sttIntegration.stop();
        console.log('\n✅ STT Integration test completed');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
if (require.main === module) {
    testSTTIntegration().catch(console.error);
}

module.exports = { testSTTIntegration };
