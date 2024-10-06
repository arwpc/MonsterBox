// File: controllers/scenePlayerController.js

const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');

let isExecuting = false;
let currentSceneState = {};

const stopAllParts = async () => {
    logger.info('Stopping all parts');
    // Implement logic to stop all parts
    // This could involve calling a Python script that stops all motors, actuators, etc.
};

const scenePlayerController = {
    // ... other methods remain unchanged

    playScene: async (req, res) => {
        const sceneId = req.params.id;
        const characterId = req.query.characterId;
        const startStep = parseInt(req.query.startStep) || 0;
        logger.info(`Attempting to play scene with ID: ${sceneId} for character ${characterId} from step ${startStep}`);
        
        let scene;
        try {
            scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                logger.warn(`Scene ${sceneId} not found`);
                return res.status(404).json({ error: 'Scene not found' });
            }
            if (scene.character_id.toString() !== characterId) {
                logger.warn(`Scene ${sceneId} does not belong to character ${characterId}`);
                return res.status(403).json({ error: 'Scene does not belong to this character' });
            }
        } catch (error) {
            logger.error(`Error fetching scene ${sceneId}:`, error);
            return res.status(500).json({ error: 'Failed to fetch scene', details: error.message });
        }

        // Initialize scene state
        currentSceneState = {
            sceneId,
            currentStep: startStep,
            isCompleted: false,
            messages: [],
            error: null
        };

        // Start scene execution in the background
        executeScene(scene, startStep);

        // Respond to the initial request
        res.json({ message: 'Scene execution started', sceneId });
    },

    getSceneStatus: (req, res) => {
        res.json(currentSceneState);
    },

    // ... other methods remain unchanged
};

async function executeScene(scene, startStep) {
    logger.info(`Starting execution of scene ${scene.id} from step ${startStep}`);
    isExecuting = true;

    try {
        await soundController.startSoundPlayer();

        for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
            const step = scene.steps[i];
            currentSceneState.currentStep = i;
            currentSceneState.messages.push(`Executing step ${i + 1}: ${step.name}`);

            await executeStep(scene.id, step);

            if (step.type === 'sound' && !step.concurrent) {
                await new Promise(resolve => setTimeout(resolve, step.duration));
            }
        }

        currentSceneState.isCompleted = true;
        currentSceneState.messages.push('Scene execution completed');
    } catch (error) {
        logger.error(`Error during scene ${scene.id} execution:`, error);
        currentSceneState.error = `Scene execution failed: ${error.message}`;
    } finally {
        isExecuting = false;
        await stopAllParts();
        await soundController.stopAllSounds();
        logger.info(`Scene ${scene.id} cleanup completed`);
        currentSceneState.messages.push('Scene cleanup completed');
    }
}

// ... rest of the file remains unchanged

module.exports = scenePlayerController;