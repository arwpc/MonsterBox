/**
 * Video Library Service
 * Handles video file management, storage, and metadata
 * Based on audioLibraryService but optimized for video files
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID as uuidv4 } from 'crypto';

class VideoLibraryService {
    constructor() {
        // Dynamic video directory - just index what's in /videos
        this.videosDir = path.resolve('./videos');
        this.videoDir = path.resolve('./data/video-library');
        this.filesDir = path.join(this.videoDir, 'files');
        this.libraryFile = path.join(this.videoDir, 'library.json');
        this.thumbnailsDir = path.join(this.videoDir, 'thumbnails');

        // Supported video formats
        this.supportedFormats = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
        this.supportedMimes = [
            'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo',
            'video/webm', 'video/x-flv', 'video/x-ms-wmv'
        ];

        // Cache for indexed videos (short-lived)
        this.videoCache = null;
        this.cacheTimestamp = null;
        this.CACHE_DURATION = 30000; // 30 seconds - quick re-index

        this.init();
    }

    async init() {
        try {
            // Create /videos directory if it doesn't exist
            await fs.mkdir(this.videosDir, { recursive: true });

            // Create data directories for uploaded videos and metadata
            await fs.mkdir(this.videoDir, { recursive: true });
            await fs.mkdir(this.filesDir, { recursive: true });
            await fs.mkdir(this.thumbnailsDir, { recursive: true });

            // Initialize library file if it doesn't exist
            try {
                await fs.access(this.libraryFile);
            } catch {
                await this.saveLibraryData({
                    videos: [],
                    categories: ['scenes', 'effects', 'backgrounds', 'other'],
                    version: '2.0.0',
                    lastUpdated: new Date().toISOString(),
                    note: 'Videos are dynamically indexed from /videos directory'
                });
            }

            console.log('✅ Video Library Service initialized (dynamic indexing from /videos)');
        } catch (error) {
            console.error('❌ Failed to initialize Video Library Service:', error);
            throw error;
        }
    }

    /**
     * Dynamically index videos from /videos directory
     * Returns cached results if cache is still valid
     */
    async indexVideosDirectory() {
        try {
            // Check cache first
            const now = Date.now();
            if (this.videoCache && this.cacheTimestamp && (now - this.cacheTimestamp < this.CACHE_DURATION)) {
                return this.videoCache;
            }

            const videos = [];

            // Check if /videos directory exists
            try {
                await fs.access(this.videosDir);
            } catch {
                // Directory doesn't exist or is empty
                this.videoCache = [];
                this.cacheTimestamp = now;
                return [];
            }

            // Read all files in /videos directory
            const files = await fs.readdir(this.videosDir);

            for (const file of files) {
                const ext = path.extname(file).toLowerCase();

                // Only process supported video formats
                if (!this.supportedFormats.includes(ext)) {
                    continue;
                }

                const filePath = path.join(this.videosDir, file);
                const stats = await fs.stat(filePath);

                // Skip if not a file
                if (!stats.isFile()) {
                    continue;
                }

                // Create video entry
                const video = {
                    id: file, // Use filename as ID for dynamic videos
                    fileName: file,
                    originalName: file,
                    title: path.basename(file, ext),
                    description: 'Dynamically indexed from /videos directory',
                    category: 'other',
                    format: ext.substring(1), // Remove the dot
                    mimeType: this.getMimeType(ext),
                    size: stats.size,
                    sizeFormatted: this.formatFileSize(stats.size),
                    duration: 0, // Unknown duration for dynamic videos
                    addedAt: stats.birthtime.toISOString(),
                    lastModified: stats.mtime.toISOString(),
                    tags: ['dynamic'],
                    favorite: false,
                    playCount: 0,
                    isDynamic: true // Flag to indicate this is from /videos directory
                };

                videos.push(video);
            }

            // Update cache
            this.videoCache = videos;
            this.cacheTimestamp = now;

            return videos;
        } catch (error) {
            console.error('Error indexing videos directory:', error);
            return [];
        }
    }

    async getLibrary(filters = {}) {
        try {
            // Get uploaded videos from library
            const libraryData = await this.loadLibraryData();
            let uploadedVideos = libraryData.videos || [];

            // Get dynamically indexed videos from /videos directory
            const dynamicVideos = await this.indexVideosDirectory();

            // Combine both sources
            let videos = [...uploadedVideos, ...dynamicVideos];

            // Apply filters
            if (filters.search) {
                const search = filters.search.toLowerCase();
                videos = videos.filter(video => 
                    video.title.toLowerCase().includes(search) ||
                    video.description?.toLowerCase().includes(search) ||
                    video.tags.some(tag => tag.toLowerCase().includes(search))
                );
            }

            if (filters.category && filters.category !== 'all') {
                videos = videos.filter(video => video.category === filters.category);
            }

            if (filters.format) {
                videos = videos.filter(video => 
                    video.format.toLowerCase() === filters.format.toLowerCase()
                );
            }

            if (filters.favorite === 'true') {
                videos = videos.filter(video => video.favorite === true);
            }

            if (filters.minDuration) {
                videos = videos.filter(video => video.duration >= filters.minDuration);
            }

            if (filters.maxDuration) {
                videos = videos.filter(video => video.duration <= filters.maxDuration);
            }

            // Apply sorting
            const sortBy = filters.sortBy || 'uploadedAt';
            videos.sort((a, b) => {
                switch (sortBy) {
                    case 'title':
                        return a.title.localeCompare(b.title);
                    case 'duration':
                        return (b.duration || 0) - (a.duration || 0);
                    case 'fileSize':
                        return (b.fileSize || 0) - (a.fileSize || 0);
                    case 'playCount':
                        return (b.playCount || 0) - (a.playCount || 0);
                    case 'uploadedAt':
                    default:
                        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
                }
            });

            // Calculate statistics
            const totalSize = videos.reduce((sum, video) => sum + (video.fileSize || 0), 0);

            return {
                success: true,
                videos,
                categories: libraryData.categories || [],
                totalFiles: videos.length,
                totalSize,
                lastUpdated: libraryData.lastUpdated
            };
        } catch (error) {
            console.error('Error getting video library:', error);
            return { success: false, error: error.message };
        }
    }

    async addVideo(fileBuffer, metadata) {
        try {
            const id = uuidv4();
            const originalName = metadata.originalname || 'unknown.mp4';
            const ext = path.extname(originalName);
            const fileName = `${id}${ext}`;
            const filePath = path.join(this.filesDir, fileName);

            // Save video file
            await fs.writeFile(filePath, fileBuffer);

            // Get video metadata using ffprobe
            const videoInfo = await this.extractVideoMetadata(filePath);

            // Generate thumbnail
            const thumbnailPath = await this.generateThumbnail(filePath, id);

            // Create video record
            const video = {
                id,
                title: metadata.title || path.basename(originalName, ext),
                description: metadata.description || '',
                category: metadata.category || 'other',
                tags: Array.isArray(metadata.tags) ? metadata.tags : 
                      (metadata.tags ? metadata.tags.split(',').map(tag => tag.trim()) : []),
                originalName,
                fileName,
                format: ext.substring(1).toLowerCase(),
                fileSize: fileBuffer.length,
                duration: videoInfo.duration || 0,
                resolution: videoInfo.resolution || 'unknown',
                fps: videoInfo.fps || 0,
                bitrate: videoInfo.bitrate || 0,
                uploadedAt: new Date().toISOString(),
                favorite: false,
                playCount: 0,
                thumbnailPath: thumbnailPath ? path.basename(thumbnailPath) : null
            };

            // Add to library
            const libraryData = await this.loadLibraryData();
            libraryData.videos.push(video);
            libraryData.lastUpdated = new Date().toISOString();
            await this.saveLibraryData(libraryData);

            console.log(`✅ Added video: ${video.title}`);
            return { success: true, video };
        } catch (error) {
            console.error('Error adding video:', error);
            return { success: false, error: error.message };
        }
    }

    async extractVideoMetadata(filePath) {
        try {
            const ffprobe = await import('ffprobe').then(m => m.default || m).catch(() => null);
            const ffprobeStatic = await import('ffprobe-static').then(m => m.default || m).catch(() => null);
            if (!ffprobe || !ffprobeStatic) {
                // In test/CI environments without ffprobe deps, return minimal metadata
                return { duration: 0, resolution: 'unknown', fps: 0, bitrate: 0 };
            }
            const data = await ffprobe(filePath, { path: ffprobeStatic.path });
            const videoStream = data.streams.find(stream => stream.codec_type === 'video');

            if (!videoStream) {
                return { duration: 0, resolution: 'unknown', fps: 0, bitrate: 0 };
            }

            return {
                duration: parseFloat(data.format.duration) || 0,
                resolution: `${videoStream.width}x${videoStream.height}`,
                fps: eval(videoStream.r_frame_rate) || 0,
                bitrate: parseInt(data.format.bit_rate) || 0
            };
        } catch (error) {
            console.warn('ffprobe unavailable or failed; using placeholder metadata:', error && error.message ? error.message : String(error));
            return { duration: 0, resolution: 'unknown', fps: 0, bitrate: 0 };
        }
    }

    async generateThumbnail(videoPath, videoId) {
        try {
            const { spawn } = await import('child_process');
            const thumbnailPath = path.join(this.thumbnailsDir, `${videoId}.jpg`);

            return new Promise((resolve, reject) => {
                // Use ffmpeg to extract frame at 1 second
                const ffmpeg = spawn('ffmpeg', [
                    '-i', videoPath,
                    '-ss', '00:00:01.000',
                    '-vframes', '1',
                    '-q:v', '2',
                    '-vf', 'scale=320:240',
                    '-y',
                    thumbnailPath
                ], { stdio: 'pipe' });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        resolve(thumbnailPath);
                    } else {
                        console.warn(`Thumbnail generation failed for ${videoId}`);
                        resolve(null);
                    }
                });

                ffmpeg.on('error', (error) => {
                    console.warn(`Thumbnail generation error for ${videoId}:`, error.message);
                    resolve(null);
                });
            });
        } catch (error) {
            console.warn('Thumbnail generation not available:', error.message);
            return null;
        }
    }

    async getVideo(videoId) {
        try {
            const libraryData = await this.loadLibraryData();
            const video = libraryData.videos.find(v => v.id === videoId);

            if (!video) {
                return { success: false, error: 'Video not found' };
            }

            return { success: true, video };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateVideo(videoId, updates) {
        try {
            const libraryData = await this.loadLibraryData();
            const videoIndex = libraryData.videos.findIndex(v => v.id === videoId);

            if (videoIndex === -1) {
                return { success: false, error: 'Video not found' };
            }

            // Update video record
            const video = libraryData.videos[videoIndex];
            Object.assign(video, {
                ...updates,
                updatedAt: new Date().toISOString()
            });

            libraryData.lastUpdated = new Date().toISOString();
            await this.saveLibraryData(libraryData);

            return { success: true, video };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteVideo(videoId) {
        try {
            const libraryData = await this.loadLibraryData();
            const videoIndex = libraryData.videos.findIndex(v => v.id === videoId);

            if (videoIndex === -1) {
                return { success: false, error: 'Video not found' };
            }

            const video = libraryData.videos[videoIndex];

            // Delete video file
            const filePath = path.join(this.filesDir, video.fileName);
            try {
                await fs.unlink(filePath);
            } catch (error) {
                console.warn(`Could not delete video file: ${filePath}`, error.message);
            }

            // Delete thumbnail
            if (video.thumbnailPath) {
                const thumbnailPath = path.join(this.thumbnailsDir, video.thumbnailPath);
                try {
                    await fs.unlink(thumbnailPath);
                } catch (error) {
                    console.warn(`Could not delete thumbnail: ${thumbnailPath}`, error.message);
                }
            }

            // Remove from library
            libraryData.videos.splice(videoIndex, 1);
            libraryData.lastUpdated = new Date().toISOString();
            await this.saveLibraryData(libraryData);

            return { success: true, message: 'Video deleted successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getVideoStream(videoId) {
        try {
            // First check if it's a dynamic video from /videos directory
            const dynamicVideos = await this.indexVideosDirectory();
            const dynamicVideo = dynamicVideos.find(v => v.id === videoId);

            if (dynamicVideo) {
                const filePath = path.join(this.videosDir, dynamicVideo.fileName);

                // Check if file exists
                try {
                    await fs.access(filePath);
                    return { success: true, filePath, video: dynamicVideo };
                } catch {
                    return { success: false, error: 'Dynamic video file not found on disk' };
                }
            }

            // Otherwise check uploaded videos
            const libraryData = await this.loadLibraryData();
            const video = libraryData.videos.find(v => v.id === videoId);

            if (!video) {
                return { success: false, error: 'Video not found' };
            }

            const filePath = path.join(this.filesDir, video.fileName);

            // Check if file exists
            try {
                await fs.access(filePath);
                return { success: true, filePath, video };
            } catch {
                return { success: false, error: 'Video file not found on disk' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getThumbnail(videoId) {
        try {
            const libraryData = await this.loadLibraryData();
            const video = libraryData.videos.find(v => v.id === videoId);

            if (!video || !video.thumbnailPath) {
                return { success: false, error: 'Thumbnail not found' };
            }

            const thumbnailPath = path.join(this.thumbnailsDir, video.thumbnailPath);
            
            try {
                await fs.access(thumbnailPath);
                return { success: true, thumbnailPath };
            } catch {
                return { success: false, error: 'Thumbnail file not found' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deployVideoToGoblin(videoId, goblinId) {
        try {
            const video = await this.getVideo(videoId);
            if (!video.success) {
                return video;
            }

            const videoStream = await this.getVideoStream(videoId);
            if (!videoStream.success) {
                return videoStream;
            }

            // Get Goblin info
            const goblin = await this.getGoblin(goblinId);
            if (!goblin) {
                return { success: false, error: 'Goblin not found or offline' };
            }

            // Read video file
            const videoBuffer = await fs.readFile(videoStream.filePath);

            // Deploy to Goblin
            const response = await fetch(`${goblin.endpoint}/deploy-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: video.video.fileName,
                    title: video.video.title,
                    data: videoBuffer.toString('base64')
                })
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error deploying video to Goblin:', error);
            return { success: false, error: error.message };
        }
    }

    async getGoblin(goblinId) {
        // This will be implemented when we create the Goblin management system
        // For now, return a placeholder
        return null;
    }

    isValidVideoFormat(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.supportedFormats.includes(ext);
    }

    isValidVideoMime(mimetype) {
        return this.supportedMimes.includes(mimetype);
    }

    async loadLibraryData() {
        try {
            const data = await fs.readFile(this.libraryFile, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading library data:', error);
            return {
                videos: [],
                categories: ['scenes', 'effects', 'backgrounds', 'other'],
                version: '1.0.0',
                lastUpdated: new Date().toISOString()
            };
        }
    }

    async saveLibraryData(data) {
        try {
            await fs.writeFile(this.libraryFile, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('Error saving library data:', error);
            return false;
        }
    }

    async getStorageStats() {
        try {
            const libraryData = await this.loadLibraryData();
            const dynamicVideos = await this.indexVideosDirectory();

            const allVideos = [...libraryData.videos, ...dynamicVideos];
            const totalSize = allVideos.reduce((sum, video) => sum + (video.size || video.fileSize || 0), 0);
            const totalDuration = allVideos.reduce((sum, video) => sum + (video.duration || 0), 0);

            return {
                success: true,
                stats: {
                    totalFiles: allVideos.length,
                    uploadedFiles: libraryData.videos.length,
                    dynamicFiles: dynamicVideos.length,
                    totalSize,
                    totalDuration,
                    categories: libraryData.categories.length,
                    avgFileSize: allVideos.length > 0 ? totalSize / allVideos.length : 0,
                    avgDuration: allVideos.length > 0 ? totalDuration / allVideos.length : 0
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get MIME type from file extension
     */
    getMimeType(ext) {
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
            '.m4v': 'video/mp4'
        };
        return mimeTypes[ext.toLowerCase()] || 'video/mp4';
    }

    /**
     * Format file size to human-readable string
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
}

export default new VideoLibraryService();