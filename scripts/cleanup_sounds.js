// Script to safely delete unused sound files
const fs = require('fs').promises;
const path = require('path');

async function cleanupSounds() {
    try {
        console.log('Starting sound file cleanup...');
        
        // Paths
        const soundsJsonPath = path.join(__dirname, '../data/sounds.json');
        const soundsDirPath = path.join(__dirname, '../public/sounds');
        
        // Get all files in the sounds directory
        const files = await fs.readdir(soundsDirPath);
        console.log(`Found ${files.length} files in sounds directory`);
        
        // Read and parse sounds.json
        const soundsData = await fs.readFile(soundsJsonPath, 'utf8');
        const sounds = JSON.parse(soundsData);
        console.log(`Found ${sounds.length} sound entries in sounds.json`);
        
        // Collect all filenames used in sounds.json
        const usedFilenames = new Set();
        sounds.forEach(sound => {
            if (sound && sound.filename) usedFilenames.add(sound.filename);
            if (sound && sound.file) usedFilenames.add(sound.file);
        });
        console.log(`${usedFilenames.size} unique filenames referenced in sounds.json`);
        
        // Find unused files
        const unusedFiles = files.filter(file => !usedFilenames.has(file));
        console.log(`Found ${unusedFiles.length} unused files to delete`);
        
        // Delete unused files
        let deletedCount = 0;
        const failures = [];
        
        for (const file of unusedFiles) {
            try {
                await fs.unlink(path.join(soundsDirPath, file));
                deletedCount++;
                console.log(`Deleted: ${file}`);
            } catch (error) {
                console.error(`Failed to delete ${file}: ${error.message}`);
                failures.push({ file, error: error.message });
            }
        }
        
        console.log(`
Cleanup completed:
- Total files: ${files.length}
- Referenced files: ${usedFilenames.size}
- Unused files found: ${unusedFiles.length}
- Successfully deleted: ${deletedCount}
- Failed deletions: ${failures.length}
        `);
        
        return {
            success: true,
            totalFiles: files.length,
            referencedFiles: usedFilenames.size,
            unusedFilesFound: unusedFiles.length,
            deletedCount,
            failures
        };
    } catch (error) {
        console.error('Error during cleanup:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run if executed directly
if (require.main === module) {
    cleanupSounds().then(result => {
        if (result.success) {
            console.log('Cleanup script completed successfully');
            process.exit(0);
        } else {
            console.error('Cleanup script failed:', result.error);
            process.exit(1);
        }
    });
} else {
    // Export for use as a module
    module.exports = cleanupSounds;
}
