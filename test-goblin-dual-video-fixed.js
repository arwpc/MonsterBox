#!/usr/bin/env node

/**
 * Test script for playing 2 videos on Goblin's HDMI1 display
 * Usage: node test-goblin-dual-video-fixed.js
 */

const GOBLIN_URL = 'http://192.168.8.160:3001';

async function playVideo(filename, delay = 0) {
  if (delay > 0) {
    console.log(`⏳ Waiting ${delay}ms before playing ${filename}...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  console.log(`🎬 Playing video: ${filename}`);
  
  const response = await fetch(`${GOBLIN_URL}/play-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, loop: false })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log(`✅ ${result.message}`);
  } else {
    console.error(`❌ Error: ${result.error}`);
  }
  
  return result;
}

async function main() {
  console.log('🎃 MonsterBox Goblin Dual Video Test');
  console.log('=====================================\n');
  
  try {
    // Check media availability
    console.log('📋 Checking available media...');
    const mediaResponse = await fetch(`${GOBLIN_URL}/media`);
    const mediaData = await mediaResponse.json();
    
    if (mediaData.success && mediaData.media.video.length > 0) {
      console.log(`✅ Found ${mediaData.media.video.length} video(s):`);
      mediaData.media.video.forEach(v => {
        console.log(`   - ${v.filename} (${(v.size / 1024 / 1024).toFixed(2)}MB)`);
      });
      console.log('');
    } else {
      console.log('⚠️  No videos found on Goblin\n');
      process.exit(1);
    }

    // Play first video
    await playVideo('poltergeist_scare.mp4');
    
    // Wait and play second video (adjust delay based on video length)
    await playVideo('wraith_scare.mp4', 5000);
    
    console.log('\n✅ Test complete! Both videos should be playing on HDMI1');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

main();
