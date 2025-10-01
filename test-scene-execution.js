#!/usr/bin/env node

/**
 * Test Scene Execution Script
 * Direct test of sceneExecutor.js with Goblin video steps
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');

// Import the scene executor 
import sceneExecutor from './services/scenes/sceneExecutor.js';

async function testSceneExecution() {
    try {
        console.log('🎬 Testing Scene execution with Goblin video steps...');
        
        // Load the test scene
        const sceneData = JSON.parse(fs.readFileSync('./test-scene-goblin-video.json', 'utf8'));
        const scene = sceneData.scenes[0];
        
        console.log(`🎭 Executing scene: ${scene.name}`);
        console.log(`📝 Steps: ${scene.steps.length}`);
        console.log(`⚡ Mode: ${scene.executionMode}`);
        
        // Execute the scene
        const result = await sceneExecutor.executeScene(scene);
        
        if (result.success) {
            console.log('✅ Scene executed successfully!');
            console.log('📊 Results:', JSON.stringify(result, null, 2));
        } else {
            console.error('❌ Scene execution failed:', result.error);
            if (result.stepResults) {
                console.log('📊 Step results:', JSON.stringify(result.stepResults, null, 2));
            }
        }
        
    } catch (error) {
        console.error('❌ Test execution error:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testSceneExecution();