const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

// AI Instances data file
const AI_INSTANCES_FILE = path.join(__dirname, '..', 'data', 'ai-instances.json');

// Initialize AI instances file if it doesn't exist
async function initializeAIInstancesFile() {
    try {
        await fs.access(AI_INSTANCES_FILE);
    } catch (error) {
        // File doesn't exist, create it with default AI instances
        const defaultInstances = [
            {
                id: 'orlok',
                name: 'Count Orlok',
                type: 'character',
                description: 'Vampire character with gothic personality',
                config: {
                    model: 'gpt-4',
                    temperature: 0.8,
                    max_tokens: 150,
                    personality: 'gothic vampire nobleman',
                    voice_settings: {
                        rate: 0.8,
                        pitch: 0.7,
                        volume: 0.7
                    }
                },
                enabled: true,
                created_at: new Date().toISOString()
            },
            {
                id: 'robochat',
                name: 'RoboChat',
                type: 'assistant',
                description: 'Robotic assistant with technical knowledge',
                config: {
                    model: 'gpt-4',
                    temperature: 0.6,
                    max_tokens: 200,
                    personality: 'helpful robotic assistant',
                    voice_settings: {
                        rate: 1.1,
                        pitch: 1.2,
                        volume: 0.8
                    }
                },
                enabled: true,
                created_at: new Date().toISOString()
            },
            {
                id: 'blackbeard',
                name: 'Blackbeard',
                type: 'character',
                description: 'Pirate character with seafaring personality',
                config: {
                    model: 'gpt-4',
                    temperature: 0.9,
                    max_tokens: 180,
                    personality: 'gruff pirate captain',
                    voice_settings: {
                        rate: 0.9,
                        pitch: 0.8,
                        volume: 0.9
                    }
                },
                enabled: true,
                created_at: new Date().toISOString()
            }
        ];
        
        await fs.writeFile(AI_INSTANCES_FILE, JSON.stringify(defaultInstances, null, 2));
        logger.info('✅ Created default AI instances file');
    }
}

// Load AI instances
async function loadAIInstances() {
    try {
        await initializeAIInstancesFile();
        const data = await fs.readFile(AI_INSTANCES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error loading AI instances:', error);
        return [];
    }
}

// Save AI instances
async function saveAIInstances(instances) {
    try {
        await fs.writeFile(AI_INSTANCES_FILE, JSON.stringify(instances, null, 2));
        return true;
    } catch (error) {
        logger.error('Error saving AI instances:', error);
        return false;
    }
}

// GET /ai-instances - List all AI instances
router.get('/', async (req, res) => {
    try {
        const instances = await loadAIInstances();
        res.render('ai-instances', {
            title: 'AI Instances',
            instances: instances
        });
    } catch (error) {
        logger.error('Error loading AI instances page:', error);
        res.status(500).render('error', { 
            title: 'Error',
            message: 'Failed to load AI instances',
            error: error
        });
    }
});

// GET /ai-instances/new - Create new AI instance form
router.get('/new', (req, res) => {
    res.render('ai-instance-form', {
        title: 'Create AI Instance',
        instance: null,
        isEdit: false
    });
});

// GET /ai-instances/:id/edit - Edit AI instance form
router.get('/:id/edit', async (req, res) => {
    try {
        const instances = await loadAIInstances();
        const instance = instances.find(i => i.id === req.params.id);
        
        if (!instance) {
            return res.status(404).render('error', {
                title: 'Error',
                message: 'AI instance not found'
            });
        }
        
        res.render('ai-instance-form', {
            title: 'Edit AI Instance',
            instance: instance,
            isEdit: true
        });
    } catch (error) {
        logger.error('Error loading AI instance for edit:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load AI instance',
            error: error
        });
    }
});

// POST /ai-instances - Create new AI instance
router.post('/', async (req, res) => {
    try {
        const instances = await loadAIInstances();
        const newInstance = {
            id: req.body.id,
            name: req.body.name,
            type: req.body.type,
            description: req.body.description,
            config: {
                model: req.body.model || 'gpt-4',
                temperature: parseFloat(req.body.temperature) || 0.8,
                max_tokens: parseInt(req.body.max_tokens) || 150,
                personality: req.body.personality,
                voice_settings: {
                    rate: parseFloat(req.body.voice_rate) || 1.0,
                    pitch: parseFloat(req.body.voice_pitch) || 1.0,
                    volume: parseFloat(req.body.voice_volume) || 0.8
                }
            },
            enabled: req.body.enabled === 'on',
            created_at: new Date().toISOString()
        };
        
        // Check if ID already exists
        if (instances.find(i => i.id === newInstance.id)) {
            return res.status(400).render('ai-instance-form', {
                title: 'Create AI Instance',
                instance: newInstance,
                isEdit: false,
                error: 'AI instance ID already exists'
            });
        }
        
        instances.push(newInstance);
        
        if (await saveAIInstances(instances)) {
            logger.info(`✅ Created AI instance: ${newInstance.id}`);
            res.redirect('/ai-instances');
        } else {
            throw new Error('Failed to save AI instance');
        }
    } catch (error) {
        logger.error('Error creating AI instance:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to create AI instance',
            error: error
        });
    }
});

// POST /ai-instances/:id/update - Update AI instance
router.post('/:id/update', async (req, res) => {
    try {
        const instances = await loadAIInstances();
        const instanceIndex = instances.findIndex(i => i.id === req.params.id);
        
        if (instanceIndex === -1) {
            return res.status(404).render('error', {
                title: 'Error',
                message: 'AI instance not found'
            });
        }
        
        // Update instance
        instances[instanceIndex] = {
            ...instances[instanceIndex],
            name: req.body.name,
            type: req.body.type,
            description: req.body.description,
            config: {
                model: req.body.model || 'gpt-4',
                temperature: parseFloat(req.body.temperature) || 0.8,
                max_tokens: parseInt(req.body.max_tokens) || 150,
                personality: req.body.personality,
                voice_settings: {
                    rate: parseFloat(req.body.voice_rate) || 1.0,
                    pitch: parseFloat(req.body.voice_pitch) || 1.0,
                    volume: parseFloat(req.body.voice_volume) || 0.8
                }
            },
            enabled: req.body.enabled === 'on',
            updated_at: new Date().toISOString()
        };
        
        if (await saveAIInstances(instances)) {
            logger.info(`✅ Updated AI instance: ${req.params.id}`);
            res.redirect('/ai-instances');
        } else {
            throw new Error('Failed to save AI instance');
        }
    } catch (error) {
        logger.error('Error updating AI instance:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to update AI instance',
            error: error
        });
    }
});

// POST /ai-instances/:id/delete - Delete AI instance
router.post('/:id/delete', async (req, res) => {
    try {
        const instances = await loadAIInstances();
        const filteredInstances = instances.filter(i => i.id !== req.params.id);
        
        if (filteredInstances.length === instances.length) {
            return res.status(404).json({ success: false, error: 'AI instance not found' });
        }
        
        if (await saveAIInstances(filteredInstances)) {
            logger.info(`✅ Deleted AI instance: ${req.params.id}`);
            res.json({ success: true });
        } else {
            throw new Error('Failed to save AI instances');
        }
    } catch (error) {
        logger.error('Error deleting AI instance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /ai-instances/:id/test - Test AI instance
router.post('/:id/test', async (req, res) => {
    try {
        const instances = await loadAIInstances();
        const instance = instances.find(i => i.id === req.params.id);
        
        if (!instance) {
            return res.status(404).json({ success: false, error: 'AI instance not found' });
        }
        
        // TODO: Implement actual AI testing logic
        // For now, return a mock response
        const testResult = {
            success: true,
            instance_id: instance.id,
            response_time: Math.floor(Math.random() * 1000) + 500,
            test_message: `Hello from ${instance.name}! I am a ${instance.type} AI instance.`,
            config_valid: true,
            voice_synthesis_available: true
        };
        
        logger.info(`🧪 Tested AI instance: ${instance.id}`);
        res.json(testResult);
    } catch (error) {
        logger.error('Error testing AI instance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
