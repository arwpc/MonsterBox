/**
 * File Manager Service
 * Handles media file storage, upload, and management
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

class FileManager {
  constructor(goblinServer) {
    this.goblin = goblinServer;

    // Use absolute path to media directory (not relative to src/)
    // This ensures we use /home/remote/goblin/media, not /home/remote/goblin/src/media
    const goblinRoot = path.resolve(__dirname, '..');
    this.mediaPaths = {
      video: path.join(goblinRoot, 'media', 'video'),
      audio: path.join(goblinRoot, 'media', 'audio')
    };
    this.supportedFormats = {
      video: ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.flv'],
      audio: ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a']
    };

    // Thumbnail directory
    this.thumbnailPath = path.join(goblinRoot, 'media', 'thumbnails');

    console.log(`📁 File manager initialized for Goblin ${this.goblin.goblinId}`);
    console.log(`📁 Video path: ${this.mediaPaths.video}`);
    console.log(`📁 Audio path: ${this.mediaPaths.audio}`);
    console.log(`📁 Thumbnail path: ${this.thumbnailPath}`);
  }

  /**
   * Initialize file manager
   */
  async initialize() {
    try {
      // Ensure media directories exist
      await this.ensureDirectories();
      
      // Scan existing media files
      const mediaList = await this.scanMediaFiles();
      console.log(`📁 Found ${mediaList.video.length} video files, ${mediaList.audio.length} audio files`);
      
      console.log('📁 File manager ready');
      
    } catch (error) {
      console.error('❌ File manager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure media directories exist
   */
  async ensureDirectories() {
    for (const [type, dirPath] of Object.entries(this.mediaPaths)) {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`📁 Ensured directory: ${dirPath}`);
      } catch (error) {
        console.error(`❌ Failed to create ${type} directory:`, error);
        throw error;
      }
    }

    // Ensure thumbnail directory exists
    try {
      await fs.mkdir(this.thumbnailPath, { recursive: true });
      console.log(`📁 Ensured directory: ${this.thumbnailPath}`);
    } catch (error) {
      console.error(`❌ Failed to create thumbnail directory:`, error);
      throw error;
    }
  }

  /**
   * Scan for existing media files
   */
  async scanMediaFiles() {
    const mediaList = {
      video: [],
      audio: []
    };
    
    for (const [type, dirPath] of Object.entries(this.mediaPaths)) {
      try {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.isFile() && this.isSupportedFormat(file, type)) {
            const fileInfo = {
              filename: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime,
              type: type,
              extension: path.extname(file).toLowerCase()
            };

            // Extract video metadata if it's a video file
            if (type === 'video') {
              const metadata = await this.extractVideoMetadata(filePath);
              Object.assign(fileInfo, metadata);
            }

            mediaList[type].push(fileInfo);
          }
        }
        
      } catch (error) {
        console.warn(`⚠️ Error scanning ${type} directory:`, error.message);
      }
    }
    
    return mediaList;
  }

  /**
   * Check if file format is supported
   */
  isSupportedFormat(filename, type) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedFormats[type].includes(ext);
  }

  /**
   * Get media file list
   */
  async getMediaList() {
    try {
      return await this.scanMediaFiles();
    } catch (error) {
      console.error('❌ Error getting media list:', error);
      return { video: [], audio: [] };
    }
  }

  /**
   * Save uploaded file
   */
  async saveFile(filename, data, type) {
    try {
      if (!this.mediaPaths[type]) {
        throw new Error(`Unsupported file type: ${type}`);
      }
      
      if (!this.isSupportedFormat(filename, type)) {
        throw new Error(`Unsupported file format: ${path.extname(filename)}`);
      }
      
      const filePath = path.join(this.mediaPaths[type], filename);
      
      // Convert base64 data to buffer if needed
      let fileData;
      if (typeof data === 'string' && data.startsWith('data:')) {
        // Data URL format
        const base64Data = data.split(',')[1];
        fileData = Buffer.from(base64Data, 'base64');
      } else if (typeof data === 'string') {
        // Assume base64 string
        fileData = Buffer.from(data, 'base64');
      } else {
        // Assume buffer or binary data
        fileData = data;
      }
      
      // Write file
      await fs.writeFile(filePath, fileData);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      
      console.log(`📁 Saved ${type} file: ${filename} (${stats.size} bytes)`);
      
      return {
        success: true,
        filename: filename,
        path: filePath,
        size: stats.size,
        type: type
      };
      
    } catch (error) {
      console.error('❌ File save error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filename) {
    try {
      let filePath = null;
      let fileType = null;
      
      // Find the file in video or audio directories
      for (const [type, dirPath] of Object.entries(this.mediaPaths)) {
        const testPath = path.join(dirPath, filename);
        try {
          await fs.access(testPath);
          filePath = testPath;
          fileType = type;
          break;
        } catch {
          // File not found in this directory
        }
      }
      
      if (!filePath) {
        throw new Error(`File not found: ${filename}`);
      }
      
      // Delete the file
      await fs.unlink(filePath);
      
      console.log(`🗑️ Deleted ${fileType} file: ${filename}`);
      
      return {
        success: true,
        filename: filename,
        type: fileType
      };
      
    } catch (error) {
      console.error('❌ File delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(filename) {
    try {
      let filePath = null;
      let fileType = null;
      
      // Find the file in video or audio directories
      for (const [type, dirPath] of Object.entries(this.mediaPaths)) {
        const testPath = path.join(dirPath, filename);
        try {
          await fs.access(testPath);
          filePath = testPath;
          fileType = type;
          break;
        } catch {
          // File not found in this directory
        }
      }
      
      if (!filePath) {
        throw new Error(`File not found: ${filename}`);
      }
      
      const stats = await fs.stat(filePath);
      
      return {
        success: true,
        filename: filename,
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        type: fileType,
        extension: path.extname(filename).toLowerCase()
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filename, type = null) {
    try {
      if (type) {
        const filePath = path.join(this.mediaPaths[type], filename);
        await fs.access(filePath);
        return true;
      } else {
        // Check all media directories
        for (const dirPath of Object.values(this.mediaPaths)) {
          try {
            const filePath = path.join(dirPath, filename);
            await fs.access(filePath);
            return true;
          } catch {
            // Continue checking other directories
          }
        }
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage() {
    const usage = {
      video: { count: 0, size: 0 },
      audio: { count: 0, size: 0 },
      total: { count: 0, size: 0 }
    };
    
    try {
      for (const [type, dirPath] of Object.entries(this.mediaPaths)) {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          try {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isFile()) {
              usage[type].count++;
              usage[type].size += stats.size;
              usage.total.count++;
              usage.total.size += stats.size;
            }
          } catch (error) {
            // Skip files we can't stat
          }
        }
      }
    } catch (error) {
      console.error('❌ Storage usage calculation error:', error);
    }
    
    return usage;
  }

  /**
   * Cleanup old or unused files
   */
  async cleanupFiles(options = {}) {
    const {
      maxAge = 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
      maxFiles = 100,
      dryRun = false
    } = options;
    
    const deletedFiles = [];
    const currentTime = Date.now();
    
    try {
      for (const [type, dirPath] of Object.entries(this.mediaPaths)) {
        const files = await fs.readdir(dirPath);
        const fileStats = [];
        
        // Get file stats
        for (const file of files) {
          try {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isFile()) {
              fileStats.push({
                filename: file,
                path: filePath,
                size: stats.size,
                modified: stats.mtime,
                age: currentTime - stats.mtime.getTime()
              });
            }
          } catch (error) {
            // Skip files we can't stat
          }
        }
        
        // Sort by modification time (oldest first)
        fileStats.sort((a, b) => a.modified - b.modified);
        
        // Delete old files
        for (const file of fileStats) {
          let shouldDelete = false;
          
          if (file.age > maxAge) {
            shouldDelete = true;
            console.log(`🗑️ File too old: ${file.filename} (${Math.round(file.age / (24 * 60 * 60 * 1000))} days)`);
          }
          
          if (fileStats.length > maxFiles && fileStats.indexOf(file) < (fileStats.length - maxFiles)) {
            shouldDelete = true;
            console.log(`🗑️ Too many files: ${file.filename}`);
          }
          
          if (shouldDelete && !dryRun) {
            try {
              await fs.unlink(file.path);
              deletedFiles.push(file.filename);
            } catch (error) {
              console.error(`❌ Failed to delete ${file.filename}:`, error);
            }
          }
        }
      }
      
      console.log(`🗑️ Cleanup complete: ${deletedFiles.length} files deleted`);
      
      return {
        success: true,
        deletedFiles: deletedFiles,
        dryRun: dryRun
      };
      
    } catch (error) {
      console.error('❌ Cleanup error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract video metadata using ffprobe
   */
  async extractVideoMetadata(filePath) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate,duration',
        '-show_entries', 'format=duration',
        '-of', 'json',
        filePath
      ]);

      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0 && output) {
          try {
            const data = JSON.parse(output);
            const videoStream = data.streams && data.streams[0];

            if (videoStream) {
              const width = videoStream.width || 0;
              const height = videoStream.height || 0;
              const resolution = width && height ? `${width}x${height}` : 'unknown';

              // Calculate FPS from r_frame_rate (e.g., "60/1" or "30000/1001")
              let fps = 0;
              if (videoStream.r_frame_rate) {
                const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
                fps = den ? Math.round(num / den) : 0;
              }

              const duration = parseFloat(videoStream.duration || data.format?.duration || 0);

              resolve({
                resolution,
                width,
                height,
                fps,
                duration
              });
              return;
            }
          } catch (parseError) {
            console.warn(`⚠️ Failed to parse ffprobe output for ${path.basename(filePath)}:`, parseError.message);
          }
        }

        // Fallback if ffprobe fails or no video stream
        resolve({
          resolution: 'unknown',
          width: 0,
          height: 0,
          fps: 0,
          duration: 0
        });
      });

      ffprobe.on('error', (err) => {
        console.warn(`⚠️ ffprobe error for ${path.basename(filePath)}:`, err.message);
        resolve({
          resolution: 'unknown',
          width: 0,
          height: 0,
          fps: 0,
          duration: 0
        });
      });
    });
  }

  /**
   * Generate thumbnail for a video file
   */
  async generateThumbnail(filename) {
    return new Promise((resolve) => {
      const videoPath = path.join(this.mediaPaths.video, filename);
      const thumbnailFilename = `${path.parse(filename).name}.jpg`;
      const thumbnailPath = path.join(this.thumbnailPath, thumbnailFilename);

      // Use ffmpeg to extract frame at 1 second
      const ffmpeg = spawn('ffmpeg', [
        '-i', videoPath,
        '-ss', '00:00:01.000',
        '-vframes', '1',
        '-q:v', '2',
        '-vf', 'scale=320:240:force_original_aspect_ratio=decrease',
        '-y',
        thumbnailPath
      ], { stdio: 'pipe' });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`📸 Generated thumbnail for ${filename}`);
          resolve({ success: true, thumbnailPath, thumbnailFilename });
        } else {
          console.warn(`⚠️ Thumbnail generation failed for ${filename}`);
          resolve({ success: false });
        }
      });

      ffmpeg.on('error', (error) => {
        console.warn(`⚠️ Thumbnail generation error for ${filename}:`, error.message);
        resolve({ success: false });
      });
    });
  }

  /**
   * Get thumbnail path for a video
   */
  getThumbnailPath(filename) {
    const thumbnailFilename = `${path.parse(filename).name}.jpg`;
    return path.join(this.thumbnailPath, thumbnailFilename);
  }
}

module.exports = FileManager;