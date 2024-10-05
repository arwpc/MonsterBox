// File: controllers/scenePlayerController.js

const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');

let isExecuting = false;

const stopAllParts = async () => {
    logger.info('Stopping all parts');
    // Implement logic to stop all parts
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
                    return res.status(403).render('error', { title: 'Forbidden', message: 'Scene does not belong to this character' });
                }
                logger.info(`Rendering scene player for scene ${sceneId}`);
                logger.debug(`Scene data: ${JSON.stringify(scene)}`);
                res.render('scene-player', { title: 'Scene Player', scene, characterId });
            } else {
                logger.warn(`Scene ${sceneId} not found`);
                res.status(404).render('error', { title: 'Not Found', message: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error getting scene by ID:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to retrieve scene', error });
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

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
            logger.info(`Starting sound player for scene ${sceneId}`);
            await soundController.startSoundPlayer();
            isExecuting = true;

            for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
                const step = scene.steps[i];
                logger.info(`Executing step ${i + 1}/${scene.steps.length} for scene ${sceneId}: ${step.name} (${step.type})`);
                sendEvent({ message: `Executing step ${i + 1}: ${step.name}`, currentStep: i });
                
                try {
                    await executeStep(sceneId, step, sendEvent);
                    logger.info(`Completed step ${i + 1}/${scene.steps.length} for scene ${sceneId}: ${step.name}`);
                } catch (error) {
                    logger.error(`Error executing step ${i + 1}/${scene.steps.length} for scene ${sceneId}: ${step.name}`, error);
                    sendEvent({ error: `Failed to execute step ${i + 1}: ${step.name} - ${error.message}` });
                    // Continue to the next step instead of breaking
                }
            }

            logger.info(`Scene ${sceneId} execution completed`);
            sendEvent({ message: 'Scene execution completed' });
        } catch (error) {
            logger.error(`Error during scene ${sceneId} execution:`, error);
            sendEvent({ error: `Scene execution failed: ${error.message}` });
        } finally {
            isExecuting = false;
            res.end();
        }
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

async function executeStep(sceneId, step, sendEvent) {
    logger.debug(`Executing step: ${JSON.stringify(step)}`);
    switch (step.type) {
        case 'sound':
            return await executeSound(step, sendEvent);
        case 'motor':
        case 'linear-actuator':
        case 'servo':
        case 'led':
        case 'light':
            return await executePart(step, sendEvent);
        case 'sensor':
            return await executeSensor(step, sendEvent);
        case 'pause':
            return await executePause(step, sendEvent);
        default:
            logger.warn(`Unknown step type: ${step.type}`);
            throw new Error(`Unknown step type: ${step.type}`);
    }
}

async function executeSound(step, sendEvent) {
    logger.info(`Executing sound step: ${step.name}`);
    try {
        const sound = await soundService.getSoundById(step.sound_id);
        if (!sound) {
            throw new Error(`Sound not found for ID: ${step.sound_id}`);
        }
        await soundController.playSound(sound, sendEvent);
    } catch (error) {
        logger.error(`Error executing sound step: ${error.message}`);
        throw error;
    }
}

async function executePart(step, sendEvent) {
    logger.info(`Executing part step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        // Here you would add logic to control the specific part type
        // This is a placeholder and should be replaced with actual part control logic
        sendEvent({ message: `Simulating ${part.type} control: ${step.name}` });
        await new Promise(resolve => setTimeout(resolve, parseInt(step.duration) || 1000));
    } catch (error) {
        logger.error(`Error executing part step: ${error.message}`);
        throw error;
    }
}

async function executeSensor(step, sendEvent) {
    logger.info(`Executing sensor step: ${step.name}`);
    try {
        const sensor = await partService.getPartById(step.part_id);
        if (!sensor) {
            throw new Error(`Sensor not found for ID: ${step.part_id}`);
        }
        // Here you would add logic to read from the sensor
        // This is a placeholder and should be replaced with actual sensor reading logic
        sendEvent({ message: `Simulating sensor read: ${step.name}` });
        await new Promise(resolve => setTimeout(resolve, parseInt(step.duration) || 1000));
    } catch (error) {
        logger.error(`Error executing sensor step: ${error.message}`);
        throw error;
    }
}

async function executePause(step, sendEvent) {
    logger.info(`Executing pause step: ${step.name}`);
    sendEvent({ message: `Pausing for ${step.duration}ms` });
    await new Promise(resolve => setTimeout(resolve, parseInt(step.duration)));
}

module.exports = scenePlayerController;