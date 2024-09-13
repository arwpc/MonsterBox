// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    // ... (keep all other methods unchanged)

    executeScene: async (req, res) => {
        console.log('executeScene called with scene ID:', req.params.id);
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                console.log('Scene not found:', sceneId);
                return res.status(404).json({ error: 'Scene not found' });
            }

            console.log('Scene details:', JSON.stringify(scene, null, 2));

            const executeSteps = async () => {
                const results = [];
                let concurrentPromises = [];

                for (let i = 0; i < scene.steps.length; i++) {
                    const step = scene.steps[i];
                    console.log(`Executing step ${i + 1}:`, JSON.stringify(step, null, 2));

                    if (step.concurrent) {
                        console.log(`Step ${i + 1} is concurrent, adding to concurrent promises`);
                        concurrentPromises.push(sceneController._executeStep(step));
                    } else {
                        if (concurrentPromises.length > 0) {
                            console.log(`Executing ${concurrentPromises.length} concurrent steps`);
                            results.push(await Promise.all(concurrentPromises));
                            concurrentPromises = [];
                        }
                        console.log(`Executing step ${i + 1} sequentially`);
                        const result = await sceneController._executeStep(step);
                        results.push(result);
                        console.log(`Step ${i + 1} result:`, JSON.stringify(result, null, 2));

                        if (step.type === 'sensor' && !result.motionDetected) {
                            console.log('No motion detected, ending scene execution');
                            break; // End scene if no motion detected
                        }
                    }
                }

                if (concurrentPromises.length > 0) {
                    console.log(`Executing remaining ${concurrentPromises.length} concurrent steps`);
                    results.push(await Promise.all(concurrentPromises));
                }

                return results;
            };

            const results = await executeSteps();
            console.log('Scene execution completed. Results:', JSON.stringify(results, null, 2));
            res.json({ success: true, message: 'Scene execution completed', results });

        } catch (error) {
            console.error('Error executing scene:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    // ... (keep all other methods unchanged)
};

module.exports = sceneController;
