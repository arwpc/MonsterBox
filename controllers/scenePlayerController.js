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

        logger.info('Setting SSE headers');
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const sendEvent = (data) => {
            const eventString = `data: ${JSON.stringify(data)}\n\n`;
            logger.debug(`Sending SSE event: ${eventString}`);
            res.write(eventString);
        };

        try {
            logger.info(`Starting sound player for scene ${sceneId}`);
            await soundController.startSoundPlayer();
            isExecuting = true;

            const executeSteps = async (steps, startIndex) => {
                const concurrentPromises = [];
                for (let i = startIndex; i < steps.length && isExecuting; i++) {
                    const step = steps[i];
                    logger.info(`Executing step ${i + 1}/${steps.length} for scene ${sceneId}: ${step.name} (${step.type})`);
                    sendEvent({ message: `Executing step ${i + 1}: ${step.name}`, currentStep: i });
                    
                    const stepExecution = executeStep(sceneId, step, sendEvent);
                    
                    if (step.concurrent) {
                        concurrentPromises.push(stepExecution);
                    } else {
                        await Promise.all(concurrentPromises);
                        concurrentPromises.length = 0;
                        await stepExecution;
                    }

                    if (step.type === 'sound' && !step.concurrent) {
                        // Wait for non-concurrent sound to finish before moving to the next step
                        await new Promise(resolve => setTimeout(resolve, step.duration));
                    }
                }
                
                // Wait for any remaining concurrent steps to complete
                await Promise.all(concurrentPromises);
            };

            logger.info(`Starting execution of scene ${sceneId} steps`);
            await executeSteps(scene.steps, startStep);

            logger.info(`Scene ${sceneId} execution completed`);
            sendEvent({ message: 'Scene execution completed' });
        } catch (error) {
            logger.error(`Error during scene ${sceneId} execution:`, error);
            sendEvent({ error: `Scene execution failed: ${error.message}` });
        } finally {
            isExecuting = false;
            logger.info('Stopping all parts and sounds');
            await stopAllParts();
            await soundController.stopAllSounds();
            logger.info(`Scene ${sceneId} cleanup completed`);
            sendEvent({ message: 'Scene cleanup completed' });
            sendEvent({ event: 'scene_end' });
            logger.info('Ending SSE connection');
            res.end();
        }
    },

    // ... other methods and functions remain unchanged
};

module.exports = scenePlayerController;