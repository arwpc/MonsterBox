#!/usr/bin/env node

/**
 * Archive Audio Migration Script
 * Migrates all audio files from ARCHIVE directory to the consolidated audio library
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import audioLibraryService from '../services/audioLibraryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ArchiveAudioMigrator {
  constructor() {
    this.archiveDir = path.join(__dirname, '..', 'ARCHIVE');
    this.migratedCount = 0;
    this.skippedCount = 0;
    this.errorCount = 0;
  }

  /**
   * Find all audio files in ARCHIVE directory
   */
  async findArchiveAudioFiles() {
    console.log('🔍 Scanning ARCHIVE directory for audio files...');
    
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const audioFiles = [];

    const scanDirectory = async (dirPath) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const relativePath = path.relative(this.archiveDir, fullPath);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (audioExtensions.includes(ext)) {
              audioFiles.push({
                filename: entry.name,
                fullPath: fullPath,
                relativePath: relativePath,
                extension: ext,
                size: (await fs.stat(fullPath)).size
              });
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not scan directory ${dirPath}: ${error.message}`);
      }
    };

    await scanDirectory(this.archiveDir);
    return audioFiles;
  }

  /**
   * Check if audio file already exists in library
   */
  async isFileInLibrary(filename) {
    try {
      const library = await audioLibraryService.loadLibrary();
      return library.audio.some(audio => audio.originalFilename === filename);
    } catch (error) {
      console.error('Error checking library:', error.message);
      return false;
    }
  }

  /**
   * Categorize audio file based on filename and path
   */
  categorizeAudio(audioFile) {
    const filename = audioFile.filename.toLowerCase();
    const relativePath = audioFile.relativePath.toLowerCase();
    
    // Check for specific categories based on filename content
    if (filename.includes('monster') || filename.includes('snarl') || filename.includes('roar')) {
      return 'monster-sounds';
    }
    
    if (filename.includes('coffin') || filename.includes('stuck') || filename.includes('help')) {
      return 'scary';
    }
    
    if (filename.includes('test') || filename.includes('hello')) {
      return 'voice';
    }
    
    if (filename.includes('satanas') || filename.includes('lucifer') || filename.includes('spinning')) {
      return 'halloween';
    }
    
    // Default category
    return 'other';
  }

  /**
   * Extract tags from filename and path
   */
  extractTags(audioFile) {
    const tags = ['archive', 'migrated'];
    const filename = audioFile.filename.toLowerCase();
    
    // Add descriptive tags based on filename
    if (filename.includes('monster')) tags.push('monster');
    if (filename.includes('halloween')) tags.push('halloween');
    if (filename.includes('scary')) tags.push('scary');
    if (filename.includes('voice') || filename.includes('talk')) tags.push('voice');
    if (filename.includes('test')) tags.push('test');
    if (filename.includes('horror')) tags.push('horror');
    if (filename.includes('sound')) tags.push('sound-effect');
    
    return tags;
  }

  /**
   * Migrate a single audio file
   */
  async migrateAudioFile(audioFile) {
    try {
      console.log(`📥 Migrating: ${audioFile.filename}`);
      
      // Check if already in library
      if (await this.isFileInLibrary(audioFile.filename)) {
        console.log(`   ⏭️  Already in library, skipping`);
        this.skippedCount++;
        return;
      }
      
      // Read the file
      const fileBuffer = await fs.readFile(audioFile.fullPath);
      
      // Categorize and tag
      const category = this.categorizeAudio(audioFile);
      const tags = this.extractTags(audioFile);
      
      // Add to audio library
      const result = await audioLibraryService.addAudioFile(
        fileBuffer,
        audioFile.filename,
        {
          title: path.basename(audioFile.filename, audioFile.extension),
          category: category,
          tags: tags,
          description: `Migrated from ARCHIVE: ${audioFile.relativePath}`
        }
      );
      
      if (result && result.id) {
        console.log(`   ✅ Migrated as ${result.id} (${category})`);
        this.migratedCount++;
      } else {
        console.log(`   ❌ Failed to migrate`);
        this.errorCount++;
      }
      
    } catch (error) {
      console.log(`   ❌ Error migrating ${audioFile.filename}: ${error.message}`);
      this.errorCount++;
    }
  }

  /**
   * Run the migration process
   */
  async migrate() {
    console.log('🎵 Archive Audio Migration Starting...\n');
    
    try {
      // Find all audio files in ARCHIVE
      const audioFiles = await this.findArchiveAudioFiles();
      console.log(`📁 Found ${audioFiles.length} audio files in ARCHIVE\n`);
      
      if (audioFiles.length === 0) {
        console.log('ℹ️  No audio files found in ARCHIVE directory');
        return;
      }
      
      // Display files to be processed
      console.log('📋 Files to process:');
      audioFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file.filename} (${(file.size / 1024).toFixed(1)}KB)`);
      });
      console.log('');
      
      // Migrate each file
      for (const audioFile of audioFiles) {
        await this.migrateAudioFile(audioFile);
      }
      
      // Show final summary
      console.log('\n✅ Archive Audio Migration Complete!\n');
      console.log('📊 MIGRATION SUMMARY');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎵 Files processed: ${audioFiles.length}`);
      console.log(`✅ Successfully migrated: ${this.migratedCount}`);
      console.log(`⏭️  Already in library: ${this.skippedCount}`);
      console.log(`❌ Errors: ${this.errorCount}`);
      
      if (this.migratedCount > 0) {
        console.log('\n🌐 Access migrated files via:');
        console.log('   🎵 http://localhost:3000/audio-library');
        console.log('\n✨ All ARCHIVE audio files are now consolidated!');
      }
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const migrator = new ArchiveAudioMigrator();
  migrator.migrate().catch(console.error);
}

export default ArchiveAudioMigrator;