#!/usr/bin/env node

/**
 * Simple MonsterBox startup for testing
 * Bypasses problematic proxy services and focuses on core functionality
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

console.log('🎭 Starting Simple MonsterBox for Testing');
console.log('=========================================');

const app = express();
const PORT = 3003;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Load character data
let characters = [];
try {
  const charactersData = fs.readFileSync(path.join(__dirname, '..', 'data', 'characters.json'), 'utf8');
  characters = JSON.parse(charactersData);
  console.log(`✅ Loaded ${characters.length} characters`);
} catch (error) {
  console.error('❌ Failed to load characters:', error.message);
}

// Load parts data
let parts = [];
try {
  const partsData = fs.readFileSync(path.join(__dirname, '..', 'data', 'parts.json'), 'utf8');
  parts = JSON.parse(partsData);
  console.log(`✅ Loaded ${parts.length} parts`);
} catch (error) {
  console.error('❌ Failed to load parts:', error.message);
}

// Load character audio config
let characterAudioConfig = {};
try {
  const audioConfigData = fs.readFileSync(path.join(__dirname, '..', 'data', 'character-audio-config.json'), 'utf8');
  characterAudioConfig = JSON.parse(audioConfigData);
  console.log(`✅ Loaded character audio config`);
} catch (error) {
  console.error('❌ Failed to load character audio config:', error.message);
}

// Basic routes
app.get('/', (req, res) => {
  res.render('index', { 
    title: 'MonsterBox - Simple Test Mode',
    characters: characters,
    currentCharacter: characters.find(c => c.id === 4) || characters[0]
  });
});

app.get('/enhanced-test-chat', (req, res) => {
  const characterId = parseInt(req.query.characterId) || 4;
  const character = characters.find(c => c.id === characterId);
  
  res.render('enhanced-test-chat', {
    title: 'Enhanced Test Chat - Simple Mode',
    character: character,
    characters: characters
  });
});

app.get('/parts', (req, res) => {
  const characterId = parseInt(req.query.characterId) || 4;
  const character = characters.find(c => c.id === characterId);
  const characterParts = parts.filter(p => p.characterId === characterId);
  
  res.render('parts', {
    title: 'Hardware Parts',
    character: character,
    parts: characterParts,
    allParts: parts
  });
});

app.get('/system-config/servo-calibration', (req, res) => {
  const servoId = parseInt(req.query.servoId) || 69;
  const servo = parts.find(p => p.id === servoId && p.type === 'servo');
  
  res.render('system-config/servo-calibration', {
    title: 'Servo Calibration',
    servo: servo,
    parts: parts
  });
});

// API endpoints for testing
app.get('/api/character-audio-config/:characterId/speaker', (req, res) => {
  const characterId = parseInt(req.params.characterId);
  const config = characterAudioConfig.characters?.[characterId];
  
  if (config && config.speaker) {
    const speakerPart = parts.find(p => p.id === config.speaker.defaultSpeakerId);
    
    res.json({
      success: true,
      data: {
        speakerConfig: config.speaker,
        audioDevice: speakerPart ? {
          speakerName: speakerPart.name,
          device: config.speaker.outputDevice,
          volume: config.speaker.volume
        } : null
      }
    });
  } else {
    res.json({
      success: false,
      error: 'Speaker configuration not found'
    });
  }
});

app.get('/api/character-audio-config/:characterId/microphone-parts', (req, res) => {
  const characterId = parseInt(req.params.characterId);
  const microphoneParts = parts.filter(p => p.characterId === characterId && p.type === 'microphone');
  
  res.json({
    success: true,
    data: microphoneParts
  });
});

app.get('/api/servo-calibration/status/:servoId', (req, res) => {
  const servoId = parseInt(req.params.servoId);
  const servo = parts.find(p => p.id === servoId && p.type === 'servo');
  
  if (servo) {
    res.json({
      success: true,
      data: {
        servo: servo,
        calibration: {
          min: 500,
          max: 2400,
          center: 1500
        }
      }
    });
  } else {
    res.json({
      success: false,
      error: 'Servo not found'
    });
  }
});

// Audio playback endpoint (mock for testing)
app.post('/voice/play-audio', (req, res) => {
  const { audioData, characterId, format } = req.body;
  
  if (!audioData || !characterId) {
    return res.status(400).json({
      success: false,
      error: 'audioData and characterId are required'
    });
  }
  
  // Mock successful audio playback
  const character = characters.find(c => c.id === characterId);
  const speakerPart = parts.find(p => p.characterId === characterId && p.type === 'speaker');
  
  console.log(`🔊 Mock audio playback for character ${characterId} (${character?.char_name})`);
  console.log(`📊 Audio data length: ${audioData.length} bytes`);
  console.log(`🔊 Speaker: ${speakerPart?.name || 'Default'}`);
  
  res.json({
    success: true,
    played: true,
    device: speakerPart?.name || 'Default Speaker',
    message: `Audio played on character ${characterId} speaker`
  });
});

// Character parts redirect
app.get('/characters/:id/parts', (req, res) => {
  const characterId = req.params.id;
  res.redirect(`/parts?characterId=${characterId}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Simple MonsterBox running at http://localhost:${PORT}`);
  console.log(`🎭 Character: Skulltalker (ID: 4)`);
  console.log(`🔊 Speaker Part: ${parts.find(p => p.id === 66)?.name || 'Not found'}`);
  console.log(`🦷 Servo Part: ${parts.find(p => p.id === 69)?.name || 'Not found'}`);
  console.log('🚀 Ready for validation testing!');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Simple MonsterBox...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Simple MonsterBox...');
  process.exit(0);
});
