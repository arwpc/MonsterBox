#!/usr/bin/env node

/**
 * MonsterBox PlaywrightBot Parts Cleanup Script
 * 
 * This script removes all test parts created by PlaywrightBot tests
 * that are cluttering the system.
 */

const fs = require('fs').promises;
const path = require('path');

const PARTS_FILE = path.join(__dirname, '..', 'data', 'parts.json');
const BACKUP_FILE = path.join(__dirname, '..', 'data', 'parts.json.backup');

async function cleanupPlaywrightParts() {
    console.log('🧹 MonsterBox PlaywrightBot Parts Cleanup');
    console.log('==========================================');

    try {
        // Read current parts
        const partsData = await fs.readFile(PARTS_FILE, 'utf8');
        const parts = JSON.parse(partsData);
        
        console.log(`📊 Total parts before cleanup: ${parts.length}`);

        // Create backup
        await fs.writeFile(BACKUP_FILE, partsData);
        console.log('💾 Backup created: parts.json.backup');

        // Find PlaywrightBot parts (characterId 5 and names containing "PlaywrightBot")
        const playwrightParts = parts.filter(part => {
            const isCharacter5 = part.characterId === 5;
            const hasPlaywrightName = part.name && part.name.includes('PlaywrightBot');
            const hasPlaywrightDesc = part.description && part.description.includes('PlaywrightBot');

            console.log(`Checking part ${part.id}: characterId=${part.characterId}, name="${part.name}", isMatch=${isCharacter5 || hasPlaywrightName || hasPlaywrightDesc}`);

            return isCharacter5 || hasPlaywrightName || hasPlaywrightDesc;
        });

        console.log(`🎯 Found ${playwrightParts.length} PlaywrightBot parts to remove:`);

        // Log what we're removing
        playwrightParts.forEach(part => {
            console.log(`  - ID ${part.id}: ${part.name} (${part.type}) - characterId: ${part.characterId}`);
        });

        // Remove PlaywrightBot parts
        const cleanParts = parts.filter(part => {
            const isCharacter5 = part.characterId === 5;
            const hasPlaywrightName = part.name && part.name.includes('PlaywrightBot');
            const hasPlaywrightDesc = part.description && part.description.includes('PlaywrightBot');

            return !(isCharacter5 || hasPlaywrightName || hasPlaywrightDesc);
        });

        console.log(`📊 Total parts after cleanup: ${cleanParts.length}`);
        console.log(`🗑️  Removed ${parts.length - cleanParts.length} PlaywrightBot parts`);

        // Write cleaned parts back to file
        await fs.writeFile(PARTS_FILE, JSON.stringify(cleanParts, null, 2));
        console.log('✅ Parts file updated successfully');

        // Summary
        console.log('\n🎉 Cleanup Summary:');
        console.log(`   Before: ${parts.length} parts`);
        console.log(`   After:  ${cleanParts.length} parts`);
        console.log(`   Removed: ${parts.length - cleanParts.length} PlaywrightBot parts`);
        console.log('\n💡 Backup saved as: data/parts.json.backup');

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

// Run cleanup if called directly
if (require.main === module) {
    cleanupPlaywrightParts()
        .then(() => {
            console.log('\n🎭 PlaywrightBot parts cleanup completed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Cleanup failed:', error);
            process.exit(1);
        });
}

module.exports = { cleanupPlaywrightParts };
