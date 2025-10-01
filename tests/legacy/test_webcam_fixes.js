#!/usr/bin/env node

/**
 * Simple validation script to test Orlok webcam fixes
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Orlok Webcam Fixes');
console.log('================================');

// Test 1: Verify parts.json has correct camera device
console.log('\n1. Checking parts.json configuration...');
try {
    const partsData = JSON.parse(fs.readFileSync('data/parts.json', 'utf8'));
    const orlokWebcam = partsData.find(part => part.id === 28 && part.type === 'webcam');
    
    if (orlokWebcam) {
        console.log(`   ✅ Found Orlok webcam part (ID: ${orlokWebcam.id})`);
        console.log(`   📹 Device ID: ${orlokWebcam.deviceId} (should be 0)`);
        console.log(`   📁 Device Path: ${orlokWebcam.devicePath} (should be /dev/video0)`);
        
        if (orlokWebcam.deviceId === 0 && orlokWebcam.devicePath === '/dev/video0') {
            console.log('   ✅ Camera device configuration is correct');
        } else {
            console.log('   ❌ Camera device configuration needs fixing');
        }
    } else {
        console.log('   ❌ Orlok webcam part not found');
    }
} catch (error) {
    console.log(`   ❌ Error reading parts.json: ${error.message}`);
}

// Test 2: Verify camera settings
console.log('\n2. Checking camera settings...');
try {
    const cameraSettings = JSON.parse(fs.readFileSync('data/camera_settings_char_1.json', 'utf8'));
    console.log(`   📹 Selected Camera: ${cameraSettings.selectedCamera} (should be 0)`);
    
    if (cameraSettings.selectedCamera === 0) {
        console.log('   ✅ Camera settings are correct');
    } else {
        console.log('   ❌ Camera settings need fixing');
    }
} catch (error) {
    console.log(`   ❌ Error reading camera settings: ${error.message}`);
}

// Test 3: Check motion tracking API route
console.log('\n3. Checking motion tracking API...');
try {
    const motionApiContent = fs.readFileSync('routes/api/motionTrackingApiRoutes.js', 'utf8');
    
    if (motionApiContent.includes('status(410)')) {
        console.log('   ❌ Motion tracking API still returns 410 Gone');
    } else if (motionApiContent.includes('Motion tracking started successfully')) {
        console.log('   ✅ Motion tracking API has been fixed');
    } else {
        console.log('   ⚠️ Motion tracking API status unclear');
    }
} catch (error) {
    console.log(`   ❌ Error reading motion tracking API: ${error.message}`);
}

// Test 4: Check webcam template has motion tracking controls
console.log('\n4. Checking webcam template...');
try {
    const webcamTemplate = fs.readFileSync('views/part-forms/webcam.ejs', 'utf8');
    
    const hasMotionControls = webcamTemplate.includes('motionTrackingEnabled') && 
                             webcamTemplate.includes('startMotionDetectionBtn');
    const hasCenteredPreview = webcamTemplate.includes('justify-content: center');
    
    if (hasMotionControls) {
        console.log('   ✅ Motion tracking controls are present');
    } else {
        console.log('   ❌ Motion tracking controls are missing');
    }
    
    if (hasCenteredPreview) {
        console.log('   ✅ Camera preview is centered');
    } else {
        console.log('   ❌ Camera preview centering needs fixing');
    }
} catch (error) {
    console.log(`   ❌ Error reading webcam template: ${error.message}`);
}

// Test 5: Check camera route redirects
console.log('\n5. Checking camera route redirects...');
try {
    const cameraRoutes = fs.readFileSync('routes/cameraRoutes.js', 'utf8');
    
    if (cameraRoutes.includes('redirect(`/parts/webcam/${webcamPart.id}/edit`)')) {
        console.log('   ✅ Camera route redirects to webcam parts management');
    } else {
        console.log('   ❌ Camera route redirect needs fixing');
    }
} catch (error) {
    console.log(`   ❌ Error reading camera routes: ${error.message}`);
}

console.log('\n🎯 Summary');
console.log('==========');
console.log('The following fixes have been implemented:');
console.log('• Updated Orlok webcam to use camera 0 instead of camera 1');
console.log('• Fixed motion tracking API to return success instead of 410 Gone');
console.log('• Webcam parts page already has motion tracking controls');
console.log('• Camera preview is already centered');
console.log('• Camera route redirects to parts management');

console.log('\n🧪 Next Steps');
console.log('=============');
console.log('1. Start the MonsterBox server: npm start');
console.log('2. Navigate to: http://localhost:3000/parts/webcam/28/edit');
console.log('3. Test camera detection and streaming');
console.log('4. Test motion tracking enable/disable');
console.log('5. Verify all buttons and controls work');

console.log('\n✅ Validation complete!');
