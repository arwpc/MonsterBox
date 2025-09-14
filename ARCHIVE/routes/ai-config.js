/**
 * AI Configuration Routes
 * 
 * Handles all AI configuration and management endpoints
 * including provider management, character AI assignment, and monitoring
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getInstance: getAIIntegration } = require('../ai/integrations');

// Initialize AI integration
let aiIntegration = null;

async function initializeAI() {
    if (!aiIntegration) {
        try {
            aiIntegration = getAIIntegration({
                enableMonitoring: true,
                enableKeyManagement: true
            });
            await aiIntegration.initialize();
        } catch (error) {
            console.error('Failed to initialize AI integration:', error.message);
        }
    }
    return aiIntegration;
}

// Middleware to ensure AI is initialized
async function ensureAIInitialized(req, res, next) {
    try {
        await initializeAI();
        if (!aiIntegration) {
            return res.status(500).json({ error: 'AI integration not available' });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Failed to initialize AI integration' });
    }
}

// AI Configuration Dashboard
router.get('/', async (req, res) => {
    try {
        await initializeAI();
        
        const status = aiIntegration ? await aiIntegration.getStatus() : null;
        const health = aiIntegration ? await aiIntegration.healthCheck() : null;
        const metrics = aiIntegration ? aiIntegration.getPerformanceMetrics(24) : null;
        
        res.render('ai-config/dashboard', {
            title: 'AI Configuration Dashboard',
            status,
            health,
            metrics,
            aiAvailable: !!aiIntegration
        });
    } catch (error) {
        console.error('AI Config Dashboard error:', error);
        res.render('ai-config/dashboard', {
            title: 'AI Configuration Dashboard',
            status: null,
            health: null,
            metrics: null,
            aiAvailable: false,
            error: error.message
        });
    }
});

// API Provider Management
router.get('/providers', ensureAIInitialized, async (req, res) => {
    try {
        const status = await aiIntegration.getStatus();
        const keyValidation = await aiIntegration.validateAPIKeys();
        const availableModels = await aiIntegration.getAvailableModels();
        
        res.render('ai-config/providers', {
            title: 'AI Provider Management',
            providers: status.clientManager.providers,
            healthStatus: status.clientManager.healthStatus,
            keyValidation,
            availableModels,
            metrics: status.performanceMonitor
        });
    } catch (error) {
        console.error('Provider management error:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load provider information',
            error: error.message 
        });
    }
});

// Character AI Configuration
router.get('/characters', async (req, res) => {
    try {
        // Load characters data
        const charactersPath = path.join(__dirname, '../data/characters.json');
        const charactersData = await fs.readFile(charactersPath, 'utf8');
        const characters = JSON.parse(charactersData);
        
        await initializeAI();
        const availableModels = aiIntegration ? await aiIntegration.getAvailableModels() : {};
        
        res.render('ai-config/characters', {
            title: 'Character AI Configuration',
            characters,
            availableModels,
            aiAvailable: !!aiIntegration
        });
    } catch (error) {
        console.error('Character AI config error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load character AI configuration',
            error: error.message
        });
    }
});

// Character AI Configuration Form
router.get('/characters/:id', async (req, res) => {
    try {
        const characterId = req.params.id;
        
        // Load characters data
        const charactersPath = path.join(__dirname, '../data/characters.json');
        const charactersData = await fs.readFile(charactersPath, 'utf8');
        const characters = JSON.parse(charactersData);
        
        const character = characters.find(c => c.id === characterId);
        if (!character) {
            return res.status(404).render('error', {
                title: 'Character Not Found',
                message: `Character with ID ${characterId} not found`
            });
        }
        
        await initializeAI();
        const availableModels = aiIntegration ? await aiIntegration.getAvailableModels() : {};
        
        res.render('ai-config/character-form', {
            title: `AI Configuration - ${character.char_name}`,
            character,
            availableModels,
            aiAvailable: !!aiIntegration
        });
    } catch (error) {
        console.error('Character AI form error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load character AI configuration form',
            error: error.message
        });
    }
});

// Performance Monitoring Dashboard
router.get('/monitor', ensureAIInitialized, async (req, res) => {
    try {
        const metrics = aiIntegration.getPerformanceMetrics(24);
        const status = await aiIntegration.getStatus();
        
        res.render('ai-config/monitor', {
            title: 'AI Performance Monitor',
            metrics,
            status,
            realTimeData: true
        });
    } catch (error) {
        console.error('AI monitor error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load AI performance monitor',
            error: error.message
        });
    }
});

// API Endpoints

// Test AI Integration
router.post('/api/test', ensureAIInitialized, async (req, res) => {
    try {
        const { provider, prompt } = req.body;
        const testResult = await aiIntegration.testIntegration(provider);
        
        res.json({
            success: testResult.success,
            provider: testResult.provider,
            responseTime: testResult.responseTime,
            response: testResult.response,
            fallbackUsed: testResult.fallbackUsed,
            error: testResult.error
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Validate API Keys
router.post('/api/validate-keys', ensureAIInitialized, async (req, res) => {
    try {
        const validation = await aiIntegration.validateAPIKeys();
        res.json(validation);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Real-time Metrics
router.get('/api/metrics', ensureAIInitialized, async (req, res) => {
    try {
        const hours = parseInt(req.query.hours) || 24;
        const metrics = aiIntegration.getPerformanceMetrics(hours);
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get System Status
router.get('/api/status', ensureAIInitialized, async (req, res) => {
    try {
        const status = await aiIntegration.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health Check
router.get('/api/health', ensureAIInitialized, async (req, res) => {
    try {
        const health = await aiIntegration.healthCheck();
        res.json(health);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Character AI Configuration
router.post('/api/characters/:id/ai-config', async (req, res) => {
    try {
        const characterId = req.params.id;
        const aiConfig = req.body;
        
        // Load current characters data
        const charactersPath = path.join(__dirname, '../data/characters.json');
        const charactersData = await fs.readFile(charactersPath, 'utf8');
        const characters = JSON.parse(charactersData);
        
        // Find and update character
        const characterIndex = characters.findIndex(c => c.id === characterId);
        if (characterIndex === -1) {
            return res.status(404).json({ error: 'Character not found' });
        }
        
        // Update AI configuration
        if (!characters[characterIndex].ai_config) {
            characters[characterIndex].ai_config = {};
        }
        
        characters[characterIndex].ai_config = {
            ...characters[characterIndex].ai_config,
            ...aiConfig,
            lastUpdated: new Date().toISOString()
        };
        
        // Save updated characters data
        await fs.writeFile(charactersPath, JSON.stringify(characters, null, 2));
        
        res.json({
            success: true,
            message: 'Character AI configuration updated successfully',
            character: characters[characterIndex]
        });
    } catch (error) {
        console.error('Update character AI config error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate AI Response (for testing)
router.post('/api/generate', ensureAIInitialized, async (req, res) => {
    try {
        const { prompt, options = {} } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        const response = await aiIntegration.generateResponse(prompt, options);
        
        res.json({
            success: true,
            response: response.text,
            metadata: response.metadata
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
