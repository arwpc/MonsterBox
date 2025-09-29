/**
 * File Manager Service
 * Handles media file storage, upload, and management
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class FileManager {
  constructor(goblinServer) {
    this.goblin = goblinServer;
    this.mediaPaths = {
      video: '/app/media/video',
      audio: '/app/media/audio'
    };
    this.supportedFormats = {
      video: ['.mp4', '.avi', '.mkv', '.mov', '.webm', '.flv'],
      audio: ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a']
    };
    
    console.log(`📁 File manager initialized for Goblin ${this.goblin.goblinId}`);
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
}

module.exports = FileManager;