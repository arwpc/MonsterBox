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
    getScenePlayer: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const characterId = req.query.characterId;
            logger.info(`Getting scene player for scene ${sceneId}, character ${characterId}`);
            const scene = await sceneService.getSceneById(sceneId);
            if (scene) {
                if (scene.character_id.toString() !== characterId) {
                    logger.warn(`Scene ${sceneId} does not belong to character ${characterId}`);
                    return res.status(403).json({ error: 'Scene does not belong to this character' });
                }
                logger.info(`Rendering scene player for scene ${sceneId}`);
                logger.debug(`Scene data: ${JSON.stringify(scene)}`);
                res.json({ scene, characterId });
            } else {
                logger.warn(`Scene ${sceneId} not found`);
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error getting scene by ID:', error);
            res.status(500).json({ error: 'Failed to retrieve scene', details: error.message });
        }
    },

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

    stopScene: async (req, res) => {
        logger.info('Stopping all steps and terminating processes');
        isExecuting = false;
        try {
            await soundController.stopAllSounds();
            await stopAllParts();
            res.json({ message: 'All steps stopped and processes terminated' });
        } catch (error) {
            logger.error('Error stopping all steps:', error);
            res.status(500).json({ error: 'Failed to stop all steps', details: error.message });
        }
    },

    stopAllScenes: async (req, res) => {
        logger.info('Stopping all scenes and terminating processes');
        isExecuting = false;
        try {
            await soundController.stopAllSounds();
            await stopAllParts();
            res.json({ message: 'All scenes stopped and processes terminated' });
        } catch (error) {
            logger.error('Error stopping all scenes:', error);
            res.status(500).json({ error: 'Failed to stop all scenes', details: error.message });
        }
    }
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

async function executeStep(sceneId, step) {
    logger.debug(`Executing step: ${JSON.stringify(step)}`);
    switch (step.type) {
        case 'sound':
            return await executeSound(step);
        case 'motor':
            return await executeMotor(step);
        case 'linear-actuator':
            return await executeLinearActuator(step);
        case 'servo':
            return await executeServo(step);
        case 'led':
        case 'light':
            return await executeLight(step);
        case 'sensor':
            return await executeSensor(step);
        case 'pause':
            return await executePause(step);
        default:
            logger.warn(`Unknown step type: ${step.type}`);
            throw new Error(`Unknown step type: ${step.type}`);
    }
}

// ... (keep all the other step execution functions unchanged)

module.exports = scenePlayerController;