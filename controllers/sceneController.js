// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    // ... (keep all existing methods)

    executeScene: async (req, res) => {
        console.log('Executing scene with ID:', req.params.id);
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                console.log('Scene not found:', sceneId);
                res.write(`data: ${JSON.stringify({ error: 'Scene not found' })}\n\n`);
                res.end();
                return;
            }

            console.log('Scene details:', JSON.stringify(scene, null, 2));
            res.write(`data: ${JSON.stringify({ message: 'Scene execution started' })}\n\n`);

            const executeSteps = async () => {
                const results = [];
                let concurrentPromises = [];

                for (let i = 0; i < scene.steps.length; i++) {
                    const step = scene.steps[i];
                    console.log(`Executing step ${i + 1}:`, JSON.stringify(step, null, 2));
                    res.write(`data: ${JSON.stringify({ message: `Executing step ${i + 1}`, step })}\n\n`);

                    if (step.concurrent) {
                        console.log(`Step ${i + 1} is concurrent, adding to concurrent promises`);
                        concurrentPromises.push(sceneController._executeStep(step));
                    } else {
                        if (concurrentPromises.length > 0) {
                            console.log(`Executing ${concurrentPromises.length} concurrent steps`);
                            const concurrentResults = await Promise.all(concurrentPromises);
                            results.push(concurrentResults);
                            res.write(`data: ${JSON.stringify({ message: 'Concurrent steps completed', results: concurrentResults })}\n\n`);
                            concurrentPromises = [];
                        }
                        console.log(`Executing step ${i + 1} sequentially`);
                        const result = await sceneController._executeStep(step);
                        results.push(result);
                        console.log(`Step ${i + 1} result:`, JSON.stringify(result, null, 2));
                        res.write(`data: ${JSON.stringify({ message: `Step ${i + 1} completed`, result })}\n\n`);

                        if (step.type === 'sensor' && !result.motionDetected) {
                            console.log('No motion detected, ending scene execution');
                            res.write(`data: ${JSON.stringify({ message: 'No motion detected, ending scene execution' })}\n\n`);
                            break; // End scene if no motion detected
                        }
                    }
                }

                if (concurrentPromises.length > 0) {
                    console.log(`Executing remaining ${concurrentPromises.length} concurrent steps`);
                    const finalConcurrentResults = await Promise.all(concurrentPromises);
                    results.push(finalConcurrentResults);
                    res.write(`data: ${JSON.stringify({ message: 'Final concurrent steps completed', results: finalConcurrentResults })}\n\n`);
                }

                return results;
            };

            const results = await executeSteps();
            console.log('Scene execution completed. Results:', JSON.stringify(results, null, 2));
            res.write(`data: ${JSON.stringify({ message: 'Scene execution completed', results })}\n\n`);
            res.end();

        } catch (error) {
            console.error('Error executing scene:', error);
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    },

    _executeStep: async (step) => {
        // ... (keep the existing _executeStep method)
    },
};

module.exports = sceneController;
