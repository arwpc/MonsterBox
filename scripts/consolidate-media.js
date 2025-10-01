#!/usr/bin/env node

/**
 * Media Library Consolidation Script
 * Consolidates all audio and video files from various character directories 
 * and scattered locations into the centralized shared libraries
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MediaConsolidator {
    constructor() {
        this.audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        this.videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
        
        this.audioLibraryDir = path.resolve('./data/audio-library');
        this.videoLibraryDir = path.resolve('./data/video-library');
        
        this.excludePaths = [
            'node_modules',
            'test-results', 
            'playwright-',
            'uploads/audio_', // These are recorded webm files, not media library content
            '.git'
        ];
        
        this.foundFiles = {
            audio: [],
            video: []
        };
    }

    async init() {
        console.log('🎬 MonsterBox Media Library Consolidation Starting...\n');
        
        // Ensure audio library service is available
        const audioLibraryModule = await import('../services/audioLibraryService.js');
        const videoLibraryModule = await import('../services/videoLibraryService.js');
        
        this.audioLibraryService = audioLibraryModule.default;
        this.videoLibraryService = videoLibraryModule.default;
        
        await this.scanForMediaFiles();
        await this.consolidateAudioFiles();
        await this.consolidateVideoFiles();
        
        console.log('\n✅ Media library consolidation complete!');
        this.printSummary();
    }

    async scanForMediaFiles() {
        console.log('🔍 Scanning for media files...');
        
        const rootDir = process.cwd();
        await this.scanDirectory(rootDir);
        
        console.log(`📁 Found ${this.foundFiles.audio.length} audio files`);
        console.log(`🎥 Found ${this.foundFiles.video.length} video files\n`);
    }

    async scanDirectory(dirPath, relativePath = '') {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                const relativeEntryPath = path.join(relativePath, entry.name);
                
                // Skip excluded paths
                if (this.shouldExclude(relativeEntryPath)) {
                    continue;
                }
                
                if (entry.isDirectory()) {
                    await this.scanDirectory(fullPath, relativeEntryPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    
                    if (this.audioExtensions.includes(ext)) {
                        this.foundFiles.audio.push({
                            fullPath,
                            relativePath: relativeEntryPath,
                            filename: entry.name,
                            extension: ext
                        });
                    } else if (this.videoExtensions.includes(ext)) {
                        this.foundFiles.video.push({
                            fullPath,
                            relativePath: relativeEntryPath,
                            filename: entry.name,
                            extension: ext
                        });
                    }
                }
            }
        } catch (error) {
            // Skip directories we can't read
            if (error.code !== 'EACCES' && error.code !== 'EPERM') {
                console.warn(`Warning: Could not scan ${dirPath}:`, error.message);
            }
        }
    }

    shouldExclude(relativePath) {
        return this.excludePaths.some(excludePath => 
            relativePath.includes(excludePath)
        );
    }

    async consolidateAudioFiles() {
        if (this.foundFiles.audio.length === 0) {
            console.log('📱 No additional audio files found to consolidate');
            return;
        }

        console.log('🎵 Consolidating audio files...');
        
        // Load current audio library
        const currentLibrary = await this.audioLibraryService.loadLibrary();
        const existingFiles = new Set(currentLibrary.audio.map(item => item.originalFilename));
        
        let added = 0;
        let skipped = 0;
        
        for (const audioFile of this.foundFiles.audio) {
            try {
                // Skip if already in library
                if (existingFiles.has(audioFile.filename)) {
                    console.log(`   ⏭️  Skipping ${audioFile.filename} (already in library)`);
                    skipped++;
                    continue;
                }
                
                // Skip if it's already in the audio library files directory
                if (audioFile.relativePath.includes('data/audio-library/files/')) {
                    console.log(`   ⏭️  Skipping ${audioFile.filename} (already consolidated)`);
                    skipped++;
                    continue;
                }
                
                console.log(`   📥 Adding ${audioFile.filename}...`);
                
                // Read the file
                const fileBuffer = await fs.readFile(audioFile.fullPath);
                
                // Determine category based on path and filename
                const category = this.categorizeAudio(audioFile);
                const tags = this.extractTags(audioFile);
                
                // Add to audio library
                const result = await this.audioLibraryService.addAudioFile(
                    fileBuffer,
                    audioFile.filename,
                    {
                        title: path.basename(audioFile.filename, path.extname(audioFile.filename)),
                        category,
                        tags,
                        description: `Consolidated from ${audioFile.relativePath}`
                    }
                );
                
                if (result && result.id) {
                    console.log(`   ✅ Added ${audioFile.filename} as ${result.title}`);
                    added++;
                } else {
                    console.log(`   ❌ Failed to add ${audioFile.filename}: No result returned`);
                }
                
            } catch (error) {
                console.log(`   ❌ Failed to add ${audioFile.filename}: ${error.message}`);
            }
        }
        
        console.log(`🎵 Audio consolidation complete: ${added} added, ${skipped} skipped\n`);
    }

    async consolidateVideoFiles() {
        if (this.foundFiles.video.length === 0) {
            console.log('📱 No additional video files found to consolidate');
            return;
        }

        console.log('🎥 Consolidating video files...');
        
        // Load current video library
        const currentLibrary = await this.videoLibraryService.getLibrary();
        const existingFiles = new Set(currentLibrary.videos.map(item => item.originalFilename));
        
        let added = 0;
        let skipped = 0;
        
        for (const videoFile of this.foundFiles.video) {
            try {
                // Skip if already in library
                if (existingFiles.has(videoFile.filename)) {
                    console.log(`   ⏭️  Skipping ${videoFile.filename} (already in library)`);
                    skipped++;
                    continue;
                }
                
                // Skip if it's already in the video library files directory
                if (videoFile.relativePath.includes('data/video-library/files/')) {
                    console.log(`   ⏭️  Skipping ${videoFile.filename} (already consolidated)`);
                    skipped++;
                    continue;
                }
                
                // Check file size (skip if too large - over 500MB)
                const stats = await fs.stat(videoFile.fullPath);
                if (stats.size > 500 * 1024 * 1024) {
                    console.log(`   ⏭️  Skipping ${videoFile.filename} (too large: ${Math.round(stats.size / 1024 / 1024)}MB)`);
                    skipped++;
                    continue;
                }
                
                console.log(`   📥 Adding ${videoFile.filename}...`);
                
                // Read the file
                const fileBuffer = await fs.readFile(videoFile.fullPath);
                
                // Determine category and tags
                const category = this.categorizeVideo(videoFile);
                const tags = this.extractTags(videoFile);
                
                // Add to video library
                const result = await this.videoLibraryService.addVideo(
                    fileBuffer,
                    {
                        originalname: videoFile.filename,
                        title: path.basename(videoFile.filename, videoFile.extension),
                        category,
                        tags: tags.join(', '),
                        description: `Consolidated from ${videoFile.relativePath}`
                    }
                );
                
                if (result.success) {
                    console.log(`   ✅ Added ${videoFile.filename} as ${result.video.title}`);
                    added++;
                } else {
                    console.log(`   ❌ Failed to add ${videoFile.filename}: ${result.error}`);
                }
                
            } catch (error) {
                console.error(`   ❌ Error processing ${videoFile.filename}:`, error.message);
            }
        }
        
        console.log(`🎥 Video consolidation complete: ${added} added, ${skipped} skipped\n`);
    }

    categorizeAudio(audioFile) {
        const pathLower = audioFile.relativePath.toLowerCase();
        const nameLower = audioFile.filename.toLowerCase();
        
        if (pathLower.includes('character-') || nameLower.includes('character')) return 'character-sounds';
        if (nameLower.includes('monster') || nameLower.includes('roar') || nameLower.includes('growl')) return 'monster-sounds';
        if (nameLower.includes('halloween') || nameLower.includes('spooky') || nameLower.includes('scary')) return 'halloween';
        if (nameLower.includes('coffin') || nameLower.includes('grave') || nameLower.includes('tomb')) return 'halloween';
        if (nameLower.includes('voice') || nameLower.includes('talking') || nameLower.includes('speak')) return 'voice';
        if (nameLower.includes('music') || nameLower.includes('song')) return 'music';
        if (nameLower.includes('ambient') || nameLower.includes('atmosphere')) return 'ambient';
        if (nameLower.includes('effect') || nameLower.includes('sfx')) return 'effects';
        if (nameLower.includes('mechanical') || nameLower.includes('servo') || nameLower.includes('motor')) return 'mechanical';
        
        return 'other';
    }

    categorizeVideo(videoFile) {
        const pathLower = videoFile.relativePath.toLowerCase();
        const nameLower = videoFile.filename.toLowerCase();
        
        if (pathLower.includes('character-') || nameLower.includes('character')) return 'character-animations';
        if (nameLower.includes('test') || nameLower.includes('demo')) return 'test-videos';
        if (nameLower.includes('fire') || nameLower.includes('flame')) return 'effects';
        if (nameLower.includes('water') || nameLower.includes('liquid')) return 'effects';
        if (nameLower.includes('halloween') || nameLower.includes('spooky')) return 'halloween';
        if (nameLower.includes('background') || nameLower.includes('scene')) return 'backgrounds';
        if (nameLower.includes('animation') || nameLower.includes('motion')) return 'animations';
        
        return 'general';
    }

    extractTags(mediaFile) {
        const tags = [];
        const pathLower = mediaFile.relativePath.toLowerCase();
        const nameLower = mediaFile.filename.toLowerCase();
        
        // Extract character number
        const characterMatch = pathLower.match(/character-(\d+)/);
        if (characterMatch) {
            tags.push(`character-${characterMatch[1]}`);
        }
        
        // Common tags
        if (nameLower.includes('test')) tags.push('test');
        if (nameLower.includes('demo')) tags.push('demo');
        if (nameLower.includes('halloween')) tags.push('halloween');
        if (nameLower.includes('monster')) tags.push('monster');
        if (nameLower.includes('spooky')) tags.push('spooky');
        if (nameLower.includes('scary')) tags.push('scary');
        if (nameLower.includes('fire')) tags.push('fire');
        if (nameLower.includes('water')) tags.push('water');
        if (nameLower.includes('roar')) tags.push('roar');
        if (nameLower.includes('voice')) tags.push('voice');
        
        // Add consolidation tag
        tags.push('consolidated');
        
        return tags;
    }

    getMimeType(extension) {
        const mimeMap = {
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
            '.m4v': 'video/x-m4v'
        };
        
        return mimeMap[extension.toLowerCase()] || 'video/mp4';
    }

    printSummary() {
        console.log('\n📊 CONSOLIDATION SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`🎵 Audio files scanned: ${this.foundFiles.audio.length}`);
        console.log(`🎥 Video files scanned: ${this.foundFiles.video.length}`);
        console.log('');
        console.log('📂 Files are now consolidated in:');
        console.log(`   🎵 ${this.audioLibraryDir}`);
        console.log(`   🎥 ${this.videoLibraryDir}`);
        console.log('');
        console.log('🌐 Access via MonsterBox interface:');
        console.log('   🎵 http://localhost:3000/audio-library');
        console.log('   🎥 http://localhost:3000/video-library');
        console.log('');
        console.log('✨ All characters now share the same media libraries!');
    }
}

// Run the consolidator
const consolidator = new MediaConsolidator();
consolidator.init().catch(console.error);