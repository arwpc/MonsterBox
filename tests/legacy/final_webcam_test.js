#!/usr/bin/env node

/**
 * Final Orlok Webcam System Test
 * Comprehensive test to verify all fixes are working
 */

const fs = require('fs');
const { spawn } = require('child_process');

console.log('🎯 FINAL ORLOK WEBCAM SYSTEM TEST');
console.log('==================================');

async function runTest() {
    let testsPassed = 0;
    let totalTests = 0;

    function test(name, condition, details = '') {
        totalTests++;
        if (condition) {
            console.log(`✅ ${name}`);
            if (details) console.log(`   ${details}`);
            testsPassed++;
        } else {
            console.log(`❌ ${name}`);
            if (details) console.log(`   ${details}`);
        }
    }

    // Test 1: Hardware Configuration
    console.log('\n📋 1. HARDWARE CONFIGURATION');
    console.log('----------------------------');
    
    try {
        const partsData = JSON.parse(fs.readFileSync('data/parts.json', 'utf8'));
        const orlokWebcam = partsData.find(part => part.id === 28 && part.type === 'webcam');
        
        test('Orlok webcam part exists', !!orlokWebcam);
        test('Camera device is 0', orlokWebcam?.deviceId === 0, `Device ID: ${orlokWebcam?.deviceId}`);
        test('Device path is /dev/video0', orlokWebcam?.devicePath === '/dev/video0', `Path: ${orlokWebcam?.devicePath}`);
        
        const cameraSettings = JSON.parse(fs.readFileSync('data/camera_settings_char_1.json', 'utf8'));
        test('Camera settings use device 0', cameraSettings.selectedCamera === 0, `Selected: ${cameraSettings.selectedCamera}`);
    } catch (error) {
        test('Hardware configuration readable', false, error.message);
    }

    // Test 2: Character Configuration
    console.log('\n🤖 2. CHARACTER CONFIGURATION');
    console.log('-----------------------------');
    
    try {
        const charactersData = JSON.parse(fs.readFileSync('data/characters.json', 'utf8'));
        const orlok = charactersData.find(char => char.id === 1);
        
        test('Orlok character exists', !!orlok);
        test('Animatronic enabled', orlok?.animatronic?.enabled === true);
        test('Motion tracking enabled', orlok?.animatronic?.motion_tracking?.enabled === true);
        test('RPI config present', !!orlok?.animatronic?.rpi_config?.host);
    } catch (error) {
        test('Character configuration readable', false, error.message);
    }

    // Test 3: API Code
    console.log('\n🔌 3. API IMPLEMENTATION');
    console.log('------------------------');
    
    try {
        const motionApiContent = fs.readFileSync('routes/api/motionTrackingApiRoutes.js', 'utf8');
        
        test('Motion API file exists', true);
        test('No 410 Gone responses', !motionApiContent.includes('status(410)'));
        test('Success response implemented', motionApiContent.includes('Motion tracking started successfully'));
        test('Proper error handling', motionApiContent.includes('catch (error)'));
    } catch (error) {
        test('API code readable', false, error.message);
    }

    // Test 4: UI Template
    console.log('\n🎨 4. USER INTERFACE');
    console.log('-------------------');
    
    try {
        const webcamTemplate = fs.readFileSync('views/part-forms/webcam.ejs', 'utf8');
        
        test('Webcam template exists', true);
        test('Motion tracking controls present', webcamTemplate.includes('motionTrackingEnabled'));
        test('Camera preview centered', webcamTemplate.includes('justify-content: center'));
        test('Cache-busting implemented', webcamTemplate.includes('Cache-Control'));
        test('Error handling for 410 responses', webcamTemplate.includes('response.status === 410'));
    } catch (error) {
        test('UI template readable', false, error.message);
    }

    // Test 5: Camera Hardware (Remote)
    console.log('\n📹 5. CAMERA HARDWARE TEST');
    console.log('-------------------------');
    
    try {
        console.log('   Testing camera on Orlok system (192.168.8.120)...');
        
        const testCamera = spawn('sshpass', [
            '-p', 'klrklr89!',
            'ssh', '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'LogLevel=ERROR',
            'remote@192.168.8.120',
            'python3 -c "import cv2; cap = cv2.VideoCapture(0, cv2.CAP_V4L2); print(\'SUCCESS\' if cap.isOpened() else \'FAILED\'); cap.release()"'
        ]);

        let output = '';
        testCamera.stdout.on('data', (data) => {
            output += data.toString();
        });

        await new Promise((resolve) => {
            testCamera.on('close', (code) => {
                test('Camera 0 accessible', output.includes('SUCCESS'), `Output: ${output.trim()}`);
                resolve();
            });
        });
    } catch (error) {
        test('Camera hardware test', false, error.message);
    }

    // Test 6: Motion Tracking API (if server available)
    console.log('\n🔍 6. MOTION TRACKING API');
    console.log('-------------------------');
    
    try {
        // Try to test the API if server is running
        const testServer = spawn('node', ['test_motion_tracking_api.js']);
        
        let apiOutput = '';
        testServer.stdout.on('data', (data) => {
            apiOutput += data.toString();
        });

        await new Promise((resolve) => {
            testServer.on('close', (code) => {
                test('Motion tracking API test runs', code === 0);
                test('API returns success', apiOutput.includes('Motion tracking API is working correctly'));
                resolve();
            });
        });
    } catch (error) {
        test('Motion tracking API test', false, 'Could not run API test - server may not be available');
    }

    // Summary
    console.log('\n📊 TEST SUMMARY');
    console.log('===============');
    console.log(`Tests Passed: ${testsPassed}/${totalTests}`);
    console.log(`Success Rate: ${Math.round((testsPassed/totalTests) * 100)}%`);
    
    if (testsPassed === totalTests) {
        console.log('🎉 ALL TESTS PASSED! Orlok webcam system is ready.');
        console.log('\n🚀 Next Steps:');
        console.log('1. Start server: npm start');
        console.log('2. Navigate to: http://localhost:3000/parts/webcam/28/edit');
        console.log('3. Clear browser cache (Ctrl+F5)');
        console.log('4. Test camera streaming and motion tracking');
    } else {
        console.log('⚠️  Some tests failed. Check the issues above.');
        console.log('\n🔧 Troubleshooting:');
        console.log('- Ensure all files are saved and server is restarted');
        console.log('- Check camera hardware on Orlok system');
        console.log('- Clear browser cache completely');
    }
}

runTest().catch(console.error);
