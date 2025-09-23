#!/usr/bin/env node

/**
 * Audio Cleanup Script
 * Moves migrated audio files to an archive directory to clean up the MonsterBox directory
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🧹 Starting Audio File Cleanup...\n');

// Create archive directory
const archiveDir = path.join(rootDir, 'ARCHIVE', 'migrated-audio-files');
await fs.mkdir(archiveDir, { recursive: true });

// Define files to move (excluding the one we already uploaded manually)
const filesToMove = [
    'public/sounds/Help__Is_someone_out_there__Pl.mp3',
    'public/sounds/I_m_stuck_in_this_coffin__plea.mp3',
    'public/sounds/My_Head_Is_Spinning.mp3',
    'public/sounds/Roar.mp3',
    'public/sounds/The Coffin.mp3',
    'public/sounds/monster-snarl-5-69062.mp3',
    'public/sounds/random-monster-sounds-29328.mp3',
    'public/sounds/satanas-lucifer.mp3',
    'data/character-1/testtalking.mp3',
    'data/character-4/testtalking.mp3'
];

let movedCount = 0;
let errorCount = 0;

for (const filePath of filesToMove) {
    const fullPath = path.join(rootDir, filePath);
    const fileName = path.basename(filePath);
    const archivePath = path.join(archiveDir, fileName);
    
    try {
        // Check if file exists
        await fs.access(fullPath);
        
        // Create unique filename if it already exists in archive
        let finalArchivePath = archivePath;
        let counter = 1;
        while (true) {
            try {
                await fs.access(finalArchivePath);
                const ext = path.extname(fileName);
                const baseName = path.basename(fileName, ext);
                finalArchivePath = path.join(archiveDir, `${baseName}_${counter}${ext}`);
                counter++;
            } catch {
                break;
            }
        }
        
        // Move file
        await fs.rename(fullPath, finalArchivePath);
        console.log(`✅ Moved: ${filePath} → ARCHIVE/migrated-audio-files/${path.basename(finalArchivePath)}`);
        movedCount++;
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`⚠️  Skipped: ${filePath} (file not found)`);
        } else {
            console.error(`❌ Error moving ${filePath}:`, error.message);
            errorCount++;
        }
    }
}

console.log('\n🎉 Cleanup Complete!');
console.log(`📊 Summary:`);
console.log(`   ✅ Moved: ${movedCount} files`);
console.log(`   ❌ Errors: ${errorCount} files`);
console.log(`   📁 Archive location: ARCHIVE/migrated-audio-files/`);

if (movedCount > 0) {
    console.log('\n📝 Note: Original audio files have been moved to the archive.');
    console.log('   All audio files are now centrally managed in the Audio Library.');
    console.log('   Visit http://localhost:3000/audio-library to access your files.');
}

console.log('\n🎭 Audio cleanup complete!');
