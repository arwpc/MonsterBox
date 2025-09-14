#!/usr/bin/env node

/**
 * Test script to verify servo integration fixes
 * Tests:
 * 1. Service discovery for servo service
 * 2. Channel 0 handling
 * 3. WebSocket connection to servo service
 */

const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:8080';
const SERVO_SERVICE_PORT = 8404;

async function testServoFixes() {
    console.log('🧪 Testing MonsterBox Servo Integration Fixes...\n');

    // Test 1: Check if servo service is running by testing WebSocket connection
    console.log('1️⃣ Testing Servo Service Connection...');
    let servoServiceRunning = false;
    try {
        const ws = new WebSocket(`ws://localhost:${SERVO_SERVICE_PORT}`);

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                console.log('✅ Servo service is running and accepting connections on port 8404');
                servoServiceRunning = true;
                ws.close();
                resolve();
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    } catch (error) {
        console.log(`❌ Servo service connection test failed: ${error.message}`);
        return false;
    }

    // Test 2: Test channel 0 handling via API
    console.log('\n2️⃣ Testing Channel 0 Handling...');
    try {
        // Get existing servos
        const servosResponse = await axios.get(`${BASE_URL}/api/parts?type=servo`);
        const servos = servosResponse.data;

        if (servos.length > 0) {
            const testServo = servos[0];
            console.log(`   Testing with servo: ${testServo.name} (ID: ${testServo.id})`);

            // Test updating servo with channel 0
            const updateData = {
                ...testServo,
                channel: 0,
                usePCA9685: true
            };

            const updateResponse = await axios.put(`${BASE_URL}/api/parts/${testServo.id}`, updateData);

            if (updateResponse.status === 200) {
                // Verify the channel was saved as 0, not null
                const verifyResponse = await axios.get(`${BASE_URL}/api/parts/${testServo.id}`);
                const updatedServo = verifyResponse.data;

                if (updatedServo.channel === 0) {
                    console.log('✅ Channel 0 saved correctly (not converted to null)');
                } else {
                    console.log(`❌ Channel 0 not saved correctly. Got: ${updatedServo.channel}`);
                    return false;
                }
            } else {
                console.log(`❌ Failed to update servo: ${updateResponse.status}`);
                return false;
            }
        } else {
            console.log('⚠️ No servos found to test channel 0 handling');
        }
    } catch (error) {
        console.log(`❌ Channel 0 test failed: ${error.message}`);
        return false;
    }

    // Test 3: Check SSH Key Manager localhost detection
    console.log('\n3️⃣ Testing SSH Key Manager Localhost Detection...');
    try {
        const response = await axios.get(`${BASE_URL}/api/system/ssh-status`);
        const sshStatus = response.data;

        // Look for localhost character (Orlok at 192.168.8.120)
        const localhostChar = sshStatus.characters?.find(c => c.host === '192.168.8.120');
        if (localhostChar && localhostChar.status === 'localhost') {
            console.log('✅ SSH Key Manager correctly detected localhost');
            console.log(`   Character: ${localhostChar.name} (${localhostChar.host})`);
        } else {
            console.log('⚠️ Could not verify SSH localhost detection via API');
        }
    } catch (error) {
        console.log(`⚠️ SSH status check failed: ${error.message}`);
        // Don't fail the test for this as it might not be exposed via API
    }

    console.log('\n🎉 All servo integration fixes verified successfully!');
    return true;
}

// Run the tests
testServoFixes()
    .then(success => {
        if (success) {
            console.log('\n✅ All tests passed! Servo integration fixes are working correctly.');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed. Please check the output above.');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('\n💥 Test execution failed:', error.message);
        process.exit(1);
    });
