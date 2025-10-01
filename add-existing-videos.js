#!/usr/bin/env node

/**
 * Script to add existing video files to the video library
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID as uuidv4 } from 'crypto';

const videoDir = path.resolve('./data/video-library');
const filesDir = path.join(videoDir, 'files');
const libraryFile = path.join(videoDir, 'library.json');

async function loadLibraryData() {
    try {
        const data = await fs.readFile(libraryFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading library data:', error);
        return { videos: [], categories: ['scenes', 'effects', 'backgrounds', 'other'] };
    }
}

async function saveLibraryData(data) {
    try {
        await fs.writeFile(libraryFile, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving library data:', error);
        return false;
    }
}

async function addExistingVideo(fileName, metadata) {
    try {
        const filePath = path.join(filesDir, fileName);
        
        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            console.log(`❌ File not found: ${fileName}`);
            return false;
        }

        // Get file stats
        const stats = await fs.stat(filePath);
        const ext = path.extname(fileName);
        
        // Generate new ID for library
        const id = uuidv4();
        
        // Create video record
        const video = {
            id,
            title: metadata.title || path.basename(fileName, ext),
            description: metadata.description || '',
            category: metadata.category || 'effects',
            tags: metadata.tags || [],
            originalName: fileName,
            fileName: fileName, // Keep original filename
            format: ext.substring(1).toLowerCase(),
            fileSize: stats.size,
            duration: 0, // Would need ffprobe for real duration
            resolution: 'unknown',
            fps: 0,
            bitrate: 0,
            uploadedAt: new Date().toISOString(),
            favorite: false,
            playCount: 0,
            thumbnailPath: null
        };

        // Load library and check if already exists
        const libraryData = await loadLibraryData();
        const existingVideo = libraryData.videos.find(v => v.fileName === fileName);
        
        if (existingVideo) {
            console.log(`⚠️  Video already exists in library: ${fileName}`);
            return false;
        }

        // Add to library
        libraryData.videos.push(video);
        libraryData.lastUpdated = new Date().toISOString();
        
        if (await saveLibraryData(libraryData)) {
            console.log(`✅ Added video to library: ${video.title} (${fileName})`);
            return true;
        } else {
            console.log(`❌ Failed to save library data for: ${fileName}`);
            return false;
        }
    } catch (error) {
        console.error(`Error adding video ${fileName}:`, error);
        return false;
    }
}

// Add the videos
async function main() {
    console.log('🎬 Adding existing videos to library...');
    
    const videosToAdd = [
        {
            fileName: '487_JB_HD.mov',
            metadata: {
                title: 'Electric Effect 487',
                description: 'Electric visual effect - high definition',
                category: 'effects',
                tags: ['electric', 'effects', 'visual', 'hd']
            }
        },
        {
            fileName: '541_JB_HD.mov',
            metadata: {
                title: 'Fire Effect 541',
                description: 'Fire visual effect - high definition',
                category: 'effects',
                tags: ['fire', 'effects', 'visual', 'hd']
            }
        },
        {
            fileName: 'PHA_Poltergeist_StartleScare_Win_H.mp4',
            metadata: {
                title: 'Poltergeist Startle Scare',
                description: 'Poltergeist startle scare effect',
                category: 'effects',
                tags: ['poltergeist', 'scare', 'startle', 'ghost']
            }
        }
    ];

    let added = 0;
    for (const video of videosToAdd) {
        if (await addExistingVideo(video.fileName, video.metadata)) {
            added++;
        }
    }
    
    console.log(`\n🎉 Added ${added} videos to the library!`);
}

main().catch(console.error);
