// Script to safely delete unused sound files and directories
const fs = require('fs').promises;
const path = require('path');

async function deleteRecursively(dirPath) {
    try {
        const items = await fs.readdir(dirPath);

        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                await deleteRecursively(itemPath);
            } else {
                await fs.unlink(itemPath);
                console.log(`  Deleted file: ${item}`);
            }
        }

        await fs.rmdir(dirPath);
        console.log(`  Deleted directory: ${path.basename(dirPath)}`);
    } catch (error) {
        throw new Error(`Failed to delete directory ${dirPath}: ${error.message}`);
    }
}

async function cleanupSounds() {
    try {
        console.log('Starting sound file cleanup...');

        // Paths
        const soundsJsonPath = path.join(__dirname, '../data/sounds.json');
        const soundsDirPath = path.join(__dirname, '../public/sounds');

        // Get all items in the sounds directory
        const items = await fs.readdir(soundsDirPath);
        console.log(`Found ${items.length} items in sounds directory`);

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

        // Find unused items (files and directories)
        const unusedItems = items.filter(item => !usedFilenames.has(item));
        console.log(`Found ${unusedItems.length} unused items to delete`);

        // Delete unused items
        let deletedCount = 0;
        const failures = [];

        for (const item of unusedItems) {
            try {
                const itemPath = path.join(soundsDirPath, item);
                const stat = await fs.stat(itemPath);

                if (stat.isDirectory()) {
                    console.log(`Deleting directory: ${item}`);
                    await deleteRecursively(itemPath);
                    deletedCount++;
                } else {
                    await fs.unlink(itemPath);
                    deletedCount++;
                    console.log(`Deleted file: ${item}`);
                }
            } catch (error) {
                console.error(`Failed to delete ${item}: ${error.message}`);
                failures.push({ item, error: error.message });
            }
        }
        
        console.log(`
Cleanup completed:
- Total items: ${items.length}
- Referenced files: ${usedFilenames.size}
- Unused items found: ${unusedItems.length}
- Successfully deleted: ${deletedCount}
- Failed deletions: ${failures.length}
        `);

        return {
            success: true,
            totalItems: items.length,
            referencedFiles: usedFilenames.size,
            unusedItemsFound: unusedItems.length,
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
