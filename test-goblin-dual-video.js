#!/usr/bin/env node

/**
 * Test script to play 2 videos on Goblin HDMI1 display
 * Tests the video playback functionality on remote Goblin
 */

const GOBLIN_ENDPOINT = 'http://192.168.8.160:3001';

async function testGoblinVideoPlayback() {
    console.log('🎬 Testing Goblin Dual Video Playback on HDMI1');
    console.log('=' .repeat(50));
    
    try {
        // Test 1: Health check
        console.log('\n🔍 Step 1: Checking Goblin health...');
        const healthResponse = await fetch(`${GOBLIN_ENDPOINT}/health`);
        const health = await healthResponse.json();
        console.log(`✅ Goblin ${health.goblinId} is ${health.status}`);
        console.log(`   Uptime: ${Math.floor(health.uptime / 60)} minutes`);
        
        // Test 2: Get Goblin info
        console.log('\n🔍 Step 2: Getting Goblin capabilities...');
        const infoResponse = await fetch(`${GOBLIN_ENDPOINT}/info`);
        const info = await infoResponse.json();
        console.log(`✅ Video formats: ${info.capabilities.video.join(', ')}`);
        console.log(`   Audio formats: ${info.capabilities.audio.join(', ')}`);
        console.log(`   Max resolution: ${info.capabilities.maxResolution}`);
        
        // Test 3: Check media files
        console.log('\n🔍 Step 3: Checking available media files...');
        const mediaResponse = await fetch(`${GOBLIN_ENDPOINT}/media`);
        const mediaData = await mediaResponse.json();
        const videoFiles = mediaData.media.video || [];
        console.log(`✅ Found ${videoFiles.length} video files:`);
        videoFiles.forEach(file => {
            console.log(`   - ${file}`);
        });
        
        if (videoFiles.length < 2) {
            throw new Error('Need at least 2 video files for this test');
        }
        
        // Test 4: Play first video
        console.log('\n🎬 Step 4: Playing first video (poltergeist_scare.mp4)...');
        const video1Response = await fetch(`${GOBLIN_ENDPOINT}/play-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: 'poltergeist_scare.mp4',
                loop: false
            })
        });
        const video1Result = await video1Response.json();
        
        if (video1Result.success) {
            console.log(`✅ ${video1Result.message}`);
            console.log('   ⏰ Waiting for video to finish (15 seconds)...');
            await sleep(15000);
        } else {
            console.error(`❌ Failed to play first video: ${video1Result.error}`);
        }
        
        // Test 5: Play second video
        console.log('\n🎬 Step 5: Playing second video (wraith_scare.mp4)...');
        const video2Response = await fetch(`${GOBLIN_ENDPOINT}/play-video`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: 'wraith_scare.mp4',
                loop: false
            })
        });
        const video2Result = await video2Response.json();
        
        if (video2Result.success) {
            console.log(`✅ ${video2Result.message}`);
            console.log('   ⏰ Waiting for video to finish (14 seconds)...');
            await sleep(14000);
        } else {
            console.error(`❌ Failed to play second video: ${video2Result.error}`);
        }
        
        // Test 6: Final status check
        console.log('\n🔍 Step 6: Checking final playback status...');
        const statusResponse = await fetch(`${GOBLIN_ENDPOINT}/status`);
        const status = await statusResponse.json();
        console.log(`✅ Video playing: ${status.playback.video.playing}`);
        console.log(`   Current file: ${status.playback.video.file || 'none'}`);
        console.log(`   Audio streams: ${status.playback.audio.count}`);
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Dual video playback test completed successfully!');
        console.log('🎃 Both videos should have displayed on HDMI1');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
testGoblinVideoPlayback();
