#!/usr/bin/env node

/**
 * Simple AI Endpoint for ChatterPi
 * 
 * Creates a standalone AI service that can be called via HTTP
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ChatterPiAI = require('./scripts/chatterpi/ai_integration');

const app = express();
const PORT = 8766;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize AI
let ai;
try {
    ai = new ChatterPiAI({ characterId: 'orlok' });
    console.log('✅ ChatterPi AI initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize AI:', error.message);
    process.exit(1);
}

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, character } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        console.log(`💬 Received message: "${message}"`);
        
        // Update character if specified
        if (character && ai.characters[character]) {
            ai.config.characterId = character;
        }
        
        // Process conversation
        const result = await ai.processConversation(message, {
            generateSpeech: false // Disable TTS for now
        });
        
        console.log(`🎭 AI Response: "${result.aiResponse.text}"`);
        
        res.json({
            success: true,
            userMessage: result.userMessage,
            aiResponse: result.aiResponse.text,
            character: result.aiResponse.character,
            metadata: result.aiResponse.metadata
        });
        
    } catch (error) {
        console.error('❌ Chat error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            fallback: ai.getFallbackResponse()
        });
    }
});

// Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'running',
        character: ai.config.characterId,
        availableCharacters: Object.keys(ai.characters),
        stats: ai.getStats()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 ChatterPi AI Service Started
===============================
🌐 HTTP API: http://192.168.8.130:${PORT}
🎭 Character: ${ai.config.characterId}
📡 Endpoints:
   POST /api/chat - Send messages to AI
   GET  /api/status - Get AI status
   GET  /health - Health check

Ready to receive chat messages!
`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down AI service...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down AI service...');
    process.exit(0);
});
