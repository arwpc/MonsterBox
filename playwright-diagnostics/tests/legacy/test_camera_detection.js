#!/usr/bin/env node

/**
 * Test Camera Detection for Orlok
 * This script tests the camera detection functionality directly
 */

const webcamService = require('./services/webcamService');

async function testCameraDetection() {
    console.log('🧪 Testing Camera Detection for Orlok');
    console.log('====================================');

    const characterId = 1; // Orlok

    try {
        console.log('\n1. Testing remote camera detection...');
        const remoteResult = await webcamService.detectCameras(characterId, true);

        console.log('📡 Remote Detection Result:');
        console.log('  Success:', remoteResult.success);
        console.log('  Message:', remoteResult.message);
        console.log('  Cameras found:', remoteResult.cameras ? remoteResult.cameras.length : 0);

        if (remoteResult.cameras && remoteResult.cameras.length > 0) {
            console.log('\n📹 Camera Details:');
            remoteResult.cameras.forEach((cameraGroup, index) => {
                console.log(`  Group ${index + 1}: ${cameraGroup.name}`);
                if (cameraGroup.devices) {
                    cameraGroup.devices.forEach(device => {
                        console.log(`    - Device ${device.id}: ${device.name} (${device.path})`);
                        console.log(`      Available: ${device.available !== false ? 'Yes' : 'No'}`);
                        console.log(`      In Use: ${device.inUse ? 'Yes' : 'No'}`);
                    });
                }
            });
        }

        console.log('\n2. Testing local camera detection...');
        const localResult = await webcamService.detectCameras(characterId, false);

        console.log('🏠 Local Detection Result:');
        console.log('  Success:', localResult.success);
        console.log('  Message:', localResult.message);
        console.log('  Cameras found:', localResult.cameras ? localResult.cameras.length : 0);

        if (localResult.cameras && localResult.cameras.length > 0) {
            console.log('\n📹 Local Camera Details:');
            localResult.cameras.forEach((cameraGroup, index) => {
                console.log(`  Group ${index + 1}: ${cameraGroup.name}`);
                if (cameraGroup.devices) {
                    cameraGroup.devices.forEach(device => {
                        console.log(`    - Device ${device.id}: ${device.name} (${device.path})`);
                    });
                }
            });
        }

        console.log('\n3. Testing direct SSH camera detection...');

        // Test direct SSH command to Orlok system
        const { spawn } = require('child_process');

        const sshTest = spawn('sshpass', [
            '-p', 'klrklr89!',
            'ssh', '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'LogLevel=ERROR',
            'remote@192.168.8.120',
            'python3 /home/remote/MonsterBox/scripts/webcam_detect.py'
        ]);

        let sshOutput = '';
        sshTest.stdout.on('data', (data) => {
            sshOutput += data.toString();
        });

        sshTest.stderr.on('data', (data) => {
            console.log('SSH Error:', data.toString());
        });

        await new Promise((resolve) => {
            sshTest.on('close', (code) => {
                console.log('🔗 SSH Detection Result:');
                console.log('  Exit Code:', code);
                console.log('  Output:', sshOutput.trim());

                try {
                    const sshResult = JSON.parse(sshOutput);
                    console.log('  Parsed Result:');
                    console.log('    Success:', sshResult.success);
                    console.log('    Cameras:', sshResult.cameras ? sshResult.cameras.length : 0);

                    if (sshResult.cameras) {
                        sshResult.cameras.forEach((camera, index) => {
                            console.log(`    Camera ${index}: ${camera.name} (ID: ${camera.id}, Path: ${camera.path})`);
                        });
                    }
                } catch (parseError) {
                    console.log('  Could not parse JSON output');
                }

                resolve();
            });
        });

        console.log('\n🎯 Summary');
        console.log('==========');
        console.log('Remote detection should find the USB camera on Orlok system');
        console.log('Local detection will find cameras on this system (if any)');
        console.log('SSH detection tests the direct script execution');

        if (remoteResult.success && remoteResult.cameras && remoteResult.cameras.length > 0) {
            console.log('✅ Camera detection is working correctly!');
            console.log('The webcam dropdown should now show real USB cameras instead of virtual devices.');
        } else {
            console.log('❌ Camera detection needs troubleshooting');
            console.log('Check SSH connectivity and webcam_detect.py script on Orlok system');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

testCameraDetection().catch(console.error);
