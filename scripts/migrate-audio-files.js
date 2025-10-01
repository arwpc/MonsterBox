#!/usr/bin/env node

/**
 * Audio Library Migration Script
 * Migrates existing audio files from various locations into the centralized audio library
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Import the audio library service
import('../services/audioLibraryService.js').then(async ({ default: audioLibraryService }) => {
    console.log('🎵 Starting Audio Library Migration...\n');

    // Define source directories and their categories
    const migrationSources = [
        {
            path: 'public/sounds',
            category: 'halloween',
            description: 'Halloween sound effects from public sounds directory'
        },
        {
            path: 'data/character-1',
            category: 'voice',
            description: 'Character 1 audio files',
            pattern: /testtalking\.mp3$/
        },
        {
            path: 'data/character-4',
            category: 'voice', 
            description: 'Character 4 audio files',
            pattern: /testtalking\.mp3$/
        },
        {
            path: 'data/archived-original-files/test-audio',
            prefix: 'test-audio',
            description: 'Test audio files from archived data'
        }
    ];

    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const source of migrationSources) {
        console.log(`📁 Processing: ${source.path}`);
        
        const sourcePath = path.join(rootDir, source.path);
        
        try {
            // Check if source directory exists
            const stats = await fs.stat(sourcePath);
            if (!stats.isDirectory()) {
                console.log(`   ⚠️  Skipping ${source.path} - not a directory`);
                continue;
            }

            // Read directory contents
            const files = await fs.readdir(sourcePath);
            const audioFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                const isAudio = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext);
                
                // Apply pattern filter if specified
                if (source.pattern) {
                    return isAudio && source.pattern.test(file);
                }
                
                return isAudio;
            });

            console.log(`   Found ${audioFiles.length} audio file(s)`);

            for (const audioFile of audioFiles) {
                const filePath = path.join(sourcePath, audioFile);
                
                try {
                    // Read file buffer
                    const fileBuffer = await fs.readFile(filePath);
                    
                    // Generate metadata based on filename and source
                    const metadata = generateMetadata(audioFile, source);
                    
                    console.log(`   📤 Migrating: ${audioFile}`);
                    
                    // Add to audio library
                    const result = await audioLibraryService.addAudioFile(
                        fileBuffer,
                        audioFile,
                        metadata
                    );
                    
                    console.log(`   ✅ Added: ${result.title} (ID: ${result.id})`);
                    totalMigrated++;
                    
                } catch (error) {
                    console.error(`   ❌ Error migrating ${audioFile}:`, error.message);
                    totalErrors++;
                }
            }
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log(`   ⚠️  Skipping ${source.path} - directory not found`);
                totalSkipped++;
            } else {
                console.error(`   ❌ Error processing ${source.path}:`, error.message);
                totalErrors++;
            }
        }
        
        console.log(''); // Empty line for readability
    }

    // Migration summary
    console.log('🎉 Migration Complete!');
    console.log(`📊 Summary:`);
    console.log(`   ✅ Migrated: ${totalMigrated} files`);
    console.log(`   ⚠️  Skipped: ${totalSkipped} directories`);
    console.log(`   ❌ Errors: ${totalErrors} files`);
    
    if (totalMigrated > 0) {
        console.log('\n🎵 Audio Library now contains:');
        try {
            const library = await audioLibraryService.getAudioFiles();
            console.log(`   📁 Total files: ${library.totalFiles}`);
            console.log(`   💾 Total size: ${formatFileSize(library.totalSize)}`);
            
            // Show categories
            const categoryCounts = {};
            library.audio.forEach(audio => {
                categoryCounts[audio.category] = (categoryCounts[audio.category] || 0) + 1;
            });
            
            console.log('   📂 Categories:');
            Object.entries(categoryCounts).forEach(([category, count]) => {
                console.log(`      ${category}: ${count} file(s)`);
            });
            
        } catch (error) {
            console.error('Error getting library summary:', error.message);
        }
    }
    
    console.log('\n🎭 Migration complete! Visit http://localhost:3000/audio-library to see your files.');
    process.exit(0);
});

/**
 * Generate metadata for a file based on filename and source
 */
function generateMetadata(filename, source) {
    const baseName = path.basename(filename, path.extname(filename));
    
    // Clean up filename for title
    let title = baseName
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Capitalize first letter of each word
    title = title.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
    
    // Generate description
    let description = source.description;
    if (source.pattern) {
        description += ` - ${title}`;
    }
    
    // Generate tags based on filename and category
    const tags = [];
    
    // Add category as tag
    tags.push(source.category);
    
    // Add filename-based tags
    const lowerName = baseName.toLowerCase();
    if (lowerName.includes('monster')) tags.push('monster');
    if (lowerName.includes('howl')) tags.push('howl');
    if (lowerName.includes('roar')) tags.push('roar');
    if (lowerName.includes('snarl')) tags.push('snarl');
    if (lowerName.includes('coffin')) tags.push('coffin');
    if (lowerName.includes('scary') || lowerName.includes('horror')) tags.push('scary');
    if (lowerName.includes('halloween')) tags.push('halloween');
    if (lowerName.includes('voice') || lowerName.includes('talking')) tags.push('voice');
    if (lowerName.includes('help')) tags.push('help');
    if (lowerName.includes('spinning')) tags.push('spinning');
    if (lowerName.includes('stuck')) tags.push('stuck');
    if (lowerName.includes('lucifer') || lowerName.includes('satan')) tags.push('demonic');
    
    return {
        title,
        description,
        category: source.category,
        tags: [...new Set(tags)] // Remove duplicates
    };
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
