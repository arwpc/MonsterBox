#!/usr/bin/env node

/**
 * Audio Debug Test - Check if audio data is flowing through the system
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Audio Debug Test - Checking Audio Flow');
console.log('='.repeat(50));

// Check WebSocket chat service for audio handling
console.log('\n1. Checking WebSocket Audio Handling...');

const wsServicePath = path.join(__dirname, '../services/elevenLabsChatWebSocketService.js');
const wsContent = fs.readFileSync(wsServicePath, 'utf8');

const hasAudioChunkHandler = wsContent.includes('audio_chunk');
const hasAudioProcessing = wsContent.includes('audioChunk');
const hasBase64Handling = wsContent.includes('base64');

console.log('✅ Audio chunk handler:', hasAudioChunkHandler);
console.log('✅ Audio processing:', hasAudioProcessing);
console.log('✅ Base64 handling:', hasBase64Handling);

// Check if audio chunks are being sent to client
const hasClientSend = wsContent.includes('sendToClient') && wsContent.includes('audio');
console.log('✅ Audio sent to client:', hasClientSend);

// Check JavaScript audio handling
console.log('\n2. Checking Client-Side Audio Processing...');

const jsPath = path.join(__dirname, '../public/js/ai-settings-agents.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

const hasAudioChunkMethod = jsContent.includes('playAudioChunk');
const hasPCMConversion = jsContent.includes('pcmToWav');
const hasAudioPlayback = jsContent.includes('audio.play()');
const hasToggleLogic = jsContent.includes('audioOutputMode');

console.log('✅ playAudioChunk method:', hasAudioChunkMethod);
console.log('✅ PCM to WAV conversion:', hasPCMConversion);
console.log('✅ Audio playback:', hasAudioPlayback);
console.log('✅ Toggle logic:', hasToggleLogic);

// Check speaker configuration
console.log('\n3. Checking Speaker Configuration...');

const partsPath = path.join(__dirname, '../data/parts.json');
const partsContent = fs.readFileSync(partsPath, 'utf8');
const partsData = JSON.parse(partsContent);

const speakers = partsData.filter(part => part.type === 'speaker');
console.log('✅ Configured speakers:', speakers.length);

speakers.forEach((speaker, index) => {
    console.log(`   Speaker ${index + 1}: ${speaker.name} (ID: ${speaker.id})`);
    console.log(`   Device: ${speaker.config?.device || 'Not configured'}`);
});

// Check character configuration
console.log('\n4. Checking Character Configuration...');

const charactersPath = path.join(__dirname, '../data/characters.json');
if (fs.existsSync(charactersPath)) {
    const charactersContent = fs.readFileSync(charactersPath, 'utf8');
    const charactersData = JSON.parse(charactersContent);
    
    const charactersWithSpeakers = charactersData.filter(char => char.speakerId);
    console.log('✅ Characters with speakers:', charactersWithSpeakers.length);
    
    charactersWithSpeakers.forEach((char, index) => {
        console.log(`   Character ${index + 1}: ${char.name} -> Speaker ID: ${char.speakerId}`);
    });
} else {
    console.log('⚠️  No characters.json file found');
}

// Check API endpoints
console.log('\n5. Checking Audio API Endpoints...');

const apiPath = path.join(__dirname, '../routes/api/elevenLabsApiRoutes.js');
const apiContent = fs.readFileSync(apiPath, 'utf8');

const hasPlayAudioEndpoint = apiContent.includes("router.post('/play-audio'");
const hasAudioProcessingLogic = apiContent.includes('audioData') && apiContent.includes('characterId');

console.log('✅ Play audio endpoint:', hasPlayAudioEndpoint);
console.log('✅ Audio processing logic:', hasAudioProcessingLogic);

// Generate diagnostic summary
console.log('\n' + '='.repeat(50));
console.log('🔍 AUDIO DEBUG SUMMARY:');
console.log('='.repeat(50));

const wsAudioOK = hasAudioChunkHandler && hasAudioProcessing && hasClientSend;
const clientAudioOK = hasAudioChunkMethod && hasPCMConversion && hasAudioPlayback;
const configOK = speakers.length > 0;
const apiOK = hasPlayAudioEndpoint && hasAudioProcessingLogic;

console.log('✅ WebSocket Audio Flow:', wsAudioOK ? 'OK' : 'ISSUE');
console.log('✅ Client Audio Processing:', clientAudioOK ? 'OK' : 'ISSUE');
console.log('✅ Speaker Configuration:', configOK ? 'OK' : 'ISSUE');
console.log('✅ API Endpoints:', apiOK ? 'OK' : 'ISSUE');

const overallOK = wsAudioOK && clientAudioOK && configOK && apiOK;
console.log('\n🎯 OVERALL AUDIO SYSTEM:', overallOK ? '✅ HEALTHY' : '❌ NEEDS ATTENTION');

if (overallOK) {
    console.log('\n🎉 Audio system looks good! If you\'re not hearing audio:');
    console.log('📋 Troubleshooting steps:');
    console.log('   1. Check browser console for audio chunk messages');
    console.log('   2. Verify toggle is set to correct mode (Local/Speaker)');
    console.log('   3. Test browser audio permissions');
    console.log('   4. Check character has assigned speaker');
    console.log('   5. Verify speaker device is working');
} else {
    console.log('\n❌ Found potential issues - check the results above');
}

console.log('\n🔧 Next steps:');
console.log('   • Open browser dev tools (F12) -> Console');
console.log('   • Send a message and look for audio-related logs');
console.log('   • Check if you see "🔊" messages in console');
console.log('   • Try toggling between Local and Speaker modes');
