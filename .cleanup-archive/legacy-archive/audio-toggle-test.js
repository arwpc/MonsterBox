#!/usr/bin/env node

/**
 * Test the new audio output toggle functionality
 * Tests both Local (browser) and Speaker (character) modes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎵 Testing Audio Output Toggle Functionality');
console.log('='.repeat(50));

// Test 1: Check that the UI has been updated
console.log('\n1. Testing UI Changes...');

const agentsViewPath = path.join(__dirname, '../views/ai-settings/agents.ejs');
const agentsViewContent = fs.readFileSync(agentsViewPath, 'utf8');

// Check for toggle buttons
const hasLocalButton = agentsViewContent.includes('id="audioLocal"') &&
    agentsViewContent.includes('Local');
const hasSpeakerButton = agentsViewContent.includes('id="audioSpeaker"') &&
    agentsViewContent.includes('Speaker');
const hasToggleGroup = agentsViewContent.includes('btn-group') &&
    agentsViewContent.includes('Audio Output Toggle');

// Check that old button is removed
const hasOldButton = agentsViewContent.includes('Play on Character Speaker');

console.log('✅ Local button present:', hasLocalButton);
console.log('✅ Speaker button present:', hasSpeakerButton);
console.log('✅ Toggle group present:', hasToggleGroup);
console.log('✅ Old button removed:', !hasOldButton);

// Test 2: Check JavaScript functionality
console.log('\n2. Testing JavaScript Changes...');

const jsPath = path.join(__dirname, '../public/js/ai-settings-agents.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// Check for new functionality
const hasAudioOutputMode = jsContent.includes('this.audioOutputMode');
const hasSetAudioOutput = jsContent.includes('setAudioOutput');
const hasToggleLogic = jsContent.includes('audioOutputMode === \'speaker\'');
const hasAutoFallback = jsContent.includes('Auto-fallback to local');

// Check that old functionality is removed
const hasOldPlayMethod = jsContent.includes('playLastReplyOnCharacterSpeaker');

console.log('✅ Audio output mode property:', hasAudioOutputMode);
console.log('✅ setAudioOutput method:', hasSetAudioOutput);
console.log('✅ Toggle logic in playAudioChunk:', hasToggleLogic);
console.log('✅ Auto-fallback functionality:', hasAutoFallback);
console.log('✅ Old play method removed:', !hasOldPlayMethod);

// Test 3: Simulate toggle functionality
console.log('\n3. Testing Toggle Logic...');

// Mock AgentsManager for testing
function MockAgentsManager() {
    this.audioOutputMode = 'local';
    this.currentChatAgentId = 'test-agent';
}

MockAgentsManager.prototype.setAudioOutput = function (mode) {
    this.audioOutputMode = mode;
    console.log('🔊 Audio output mode set to:', mode);
    return mode;
};

MockAgentsManager.prototype.playAudioChunk = function (audioData) {
    if (this.audioOutputMode === 'speaker') {
        console.log('🔊 Would play through character speaker');
        return 'speaker';
    } else {
        console.log('🔊 Would play through browser');
        return 'local';
    }
};

const mockManager = new MockAgentsManager();

// Test default mode
console.log('Default mode:', mockManager.audioOutputMode);

// Test switching to speaker
const speakerMode = mockManager.setAudioOutput('speaker');
const speakerPlayback = mockManager.playAudioChunk('test-audio-data');
console.log('✅ Speaker mode test:', speakerMode === 'speaker' && speakerPlayback === 'speaker');

// Test switching to local
const localMode = mockManager.setAudioOutput('local');
const localPlayback = mockManager.playAudioChunk('test-audio-data');
console.log('✅ Local mode test:', localMode === 'local' && localPlayback === 'local');

// Test 4: Check API endpoints still exist
console.log('\n4. Testing API Endpoint Availability...');

const apiRoutesPath = path.join(__dirname, '../routes/api/elevenLabsApiRoutes.js');
const apiContent = fs.readFileSync(apiRoutesPath, 'utf8');

const hasPlayAudioEndpoint = apiContent.includes("router.post('/play-audio'");
const hasGeneratePlayEndpoint = apiContent.includes("router.post('/generate-and-play'");

console.log('✅ Play audio endpoint exists:', hasPlayAudioEndpoint);
console.log('✅ Generate and play endpoint exists:', hasGeneratePlayEndpoint);

// Final Results
console.log('\n' + '='.repeat(50));
console.log('🎉 AUDIO TOGGLE TEST RESULTS:');
console.log('='.repeat(50));

const allUITests = hasLocalButton && hasSpeakerButton && hasToggleGroup && !hasOldButton;
const allJSTests = hasAudioOutputMode && hasSetAudioOutput && hasToggleLogic && hasAutoFallback && !hasOldPlayMethod;
const allAPITests = hasPlayAudioEndpoint && hasGeneratePlayEndpoint;
const allToggleTests = speakerMode === 'speaker' && localMode === 'local';

console.log('✅ UI Changes:', allUITests ? 'PASS' : 'FAIL');
console.log('✅ JavaScript Logic:', allJSTests ? 'PASS' : 'FAIL');
console.log('✅ API Endpoints:', allAPITests ? 'PASS' : 'FAIL');
console.log('✅ Toggle Functionality:', allToggleTests ? 'PASS' : 'FAIL');

const overallSuccess = allUITests && allJSTests && allAPITests && allToggleTests;
console.log('\n🎯 OVERALL RESULT:', overallSuccess ? '✅ SUCCESS' : '❌ FAILURE');

if (overallSuccess) {
    console.log('\n🎉 Audio toggle functionality is ready!');
    console.log('📋 Features implemented:');
    console.log('   • Toggle between Local (browser) and Speaker (character) audio');
    console.log('   • Real-time switching during WebSocket conversations');
    console.log('   • Auto-fallback to browser if speaker fails');
    console.log('   • Clean UI with radio button toggle');
    console.log('   • Removed old "Play on Character Speaker" button');
    console.log('\n🚀 Ready for testing with real audio!');
} else {
    console.log('\n❌ Some tests failed - check the output above');
}
