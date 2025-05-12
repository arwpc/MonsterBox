// Simple script to clean up unused sound files
const fs = require('fs').promises;
const path = require('path');

async function cleanupSounds() {
  try {
    // Step 1: Get all files in the sounds directory
    const soundsDir = path.join(__dirname, 'public', 'sounds');
    const allFiles = await fs.readdir(soundsDir);
    console.log(`Found ${allFiles.length} files in sounds directory`);
    
    // Step 2: Get the list of sound files referenced in sounds.json
    const soundsDataPath = path.join(__dirname, 'data', 'sounds.json');
    const soundsData = await fs.readFile(soundsDataPath, 'utf8');
    const sounds = JSON.parse(soundsData);
    
    // Step 3: Create a set of all filenames used in sounds.json
    const usedFilenames = new Set();
    for (const sound of sounds) {
      if (sound && sound.filename) {
        usedFilenames.add(sound.filename);
      }
    }
    console.log(`Found ${usedFilenames.size} filenames referenced in sounds.json`);
    
    // Step 4: Find files that are not referenced in sounds.json
    const unusedFiles = allFiles.filter(file => !usedFilenames.has(file));
    console.log(`Found ${unusedFiles.length} unused files`);
    
    if (unusedFiles.length === 0) {
      console.log('No unused sound files to delete.');
      return;
    }
    
    // Step 5: Delete unused files
    let deletedCount = 0;
    for (const file of unusedFiles) {
      const filePath = path.join(soundsDir, file);
      await fs.unlink(filePath);
      deletedCount++;
      console.log(`Deleted: ${file}`);
    }
    
    console.log(`Successfully deleted ${deletedCount} unused sound files.`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run the cleanup
cleanupSounds();
