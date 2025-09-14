#!/usr/bin/env node

/**
 * Test Motion Tracking API Directly
 * This script tests the motion tracking API without starting the full server
 */

const express = require('express');
const motionTrackingRoutes = require('./routes/api/motionTrackingApiRoutes');
const characterService = require('./services/characterService');

const app = express();
app.use(express.json());

// Mount the motion tracking routes
app.use('/api/motion-tracking', motionTrackingRoutes);

const PORT = 3001; // Use different port to avoid conflicts

async function testMotionTrackingAPI() {
    console.log('🧪 Testing Motion Tracking API');
    console.log('==============================');

    // Start test server
    const server = app.listen(PORT, () => {
        console.log(`✅ Test server running on port ${PORT}`);
    });

    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Test 1: Check if Orlok character exists and has motion tracking enabled
        console.log('\n1. Checking Orlok character configuration...');
        const character = await characterService.getCharacterById(1);
        
        if (character) {
            console.log(`   ✅ Found character: ${character.char_name}`);
            console.log(`   🤖 Animatronic enabled: ${character.animatronic?.enabled || false}`);
            console.log(`   🔍 Motion tracking enabled: ${character.animatronic?.motion_tracking?.enabled || false}`);
            
            if (character.animatronic?.motion_tracking?.enabled) {
                console.log('   ✅ Motion tracking is properly configured');
            } else {
                console.log('   ❌ Motion tracking is not enabled - this will cause API to fail');
            }
        } else {
            console.log('   ❌ Orlok character not found');
        }

        // Test 2: Test the API endpoint directly
        console.log('\n2. Testing motion tracking start API...');
        
        const fetch = require('node-fetch');
        const response = await fetch(`http://localhost:${PORT}/api/motion-tracking/start/1`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sensitivity: 75,
                minArea: 600
            })
        });

        const result = await response.json();
        
        console.log(`   📡 Response Status: ${response.status}`);
        console.log(`   📋 Response Body:`, JSON.stringify(result, null, 2));

        if (response.status === 200 && result.success) {
            console.log('   ✅ Motion tracking API is working correctly!');
        } else if (response.status === 410) {
            console.log('   ❌ API still returns 410 Gone - old code is still running');
        } else if (response.status === 400 && result.message?.includes('not enabled')) {
            console.log('   ⚠️ Motion tracking not enabled for character - need to enable it first');
        } else {
            console.log(`   ❌ Unexpected response: ${response.status} - ${result.message}`);
        }

        // Test 3: Test status endpoint
        console.log('\n3. Testing motion tracking status API...');
        
        const statusResponse = await fetch(`http://localhost:${PORT}/api/motion-tracking/status/1`);
        const statusResult = await statusResponse.json();
        
        console.log(`   📡 Status Response: ${statusResponse.status}`);
        console.log(`   📋 Status Body:`, JSON.stringify(statusResult, null, 2));

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Close server
        server.close();
        console.log('\n🏁 Test completed');
    }
}

// Handle node-fetch import
async function loadFetch() {
    try {
        const fetch = await import('node-fetch');
        global.fetch = fetch.default;
        return fetch.default;
    } catch (error) {
        console.log('Installing node-fetch...');
        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            const install = spawn('npm', ['install', 'node-fetch@2'], { stdio: 'inherit' });
            install.on('close', async (code) => {
                if (code === 0) {
                    const fetch = require('node-fetch');
                    resolve(fetch);
                } else {
                    reject(new Error('Failed to install node-fetch'));
                }
            });
        });
    }
}

// Run the test
loadFetch().then(() => {
    testMotionTrackingAPI().catch(console.error);
}).catch(console.error);
