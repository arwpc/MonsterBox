#!/usr/bin/env node
/**
 * STT Audio Sample Saver
 * Temporarily patches the STT service to save audio samples to disk for debugging
 * This helps diagnose audio quality issues by allowing manual inspection of captured audio
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SAMPLE_DIR = path.join(projectRoot, 'tmp', 'stt-audio-samples');
const SERVICE_FILE = path.join(projectRoot, 'services', 'elevenLabsSTTService.js');
const BACKUP_FILE = SERVICE_FILE + '.backup-before-audio-save';

const PATCH_CODE = `
            // === TEMPORARY DEBUG CODE - Save audio sample to disk ===
            if (process.env.MB_SAVE_STT_SAMPLES === '1') {
                try {
                    const sampleDir = path.join(process.cwd(), 'tmp', 'stt-audio-samples');
                    await fs.mkdir(sampleDir, { recursive: true });
                    const timestamp = Date.now();
                    const sampleFile = path.join(sampleDir, \`stt-sample-\${timestamp}.\${filename.split('.').pop()}\`);
                    await fs.writeFile(sampleFile, audioBuffer);
                    console.log(\`💾 Saved STT audio sample to: \${sampleFile}\`);
                } catch (saveErr) {
                    console.warn('Failed to save STT audio sample:', saveErr.message);
                }
            }
            // === END TEMPORARY DEBUG CODE ===
`;

async function enableSampleSaving() {
    console.log('🔧 Enabling STT audio sample saving...\n');
    
    // Create sample directory
    await fs.mkdir(SAMPLE_DIR, { recursive: true });
    console.log(`✓ Created sample directory: ${SAMPLE_DIR}`);
    
    // Read current service file
    const content = await fs.readFile(SERVICE_FILE, 'utf8');
    
    // Check if already patched
    if (content.includes('MB_SAVE_STT_SAMPLES')) {
        console.log('⚠️  Service already patched for sample saving');
        return;
    }
    
    // Create backup
    await fs.writeFile(BACKUP_FILE, content);
    console.log(`✓ Created backup: ${BACKUP_FILE}`);
    
    // Find the location to insert the patch (after formData.append('file', ...))
    const insertMarker = "formData.append('file', audioStream, {";
    const insertIndex = content.indexOf(insertMarker);
    
    if (insertIndex === -1) {
        throw new Error('Could not find insertion point in service file');
    }
    
    // Find the end of the formData.append block
    let braceCount = 0;
    let insertPos = insertIndex;
    let foundStart = false;
    
    for (let i = insertIndex; i < content.length; i++) {
        if (content[i] === '{') {
            braceCount++;
            foundStart = true;
        } else if (content[i] === '}') {
            braceCount--;
            if (foundStart && braceCount === 0) {
                // Find the end of the statement (semicolon or newline)
                while (i < content.length && content[i] !== ';' && content[i] !== '\n') {
                    i++;
                }
                insertPos = i + 1;
                break;
            }
        }
    }
    
    // Insert the patch
    const patchedContent = content.slice(0, insertPos) + '\n' + PATCH_CODE + '\n' + content.slice(insertPos);
    
    // Add required imports at the top if not present
    let finalContent = patchedContent;
    if (!patchedContent.includes("import fs from 'fs/promises'")) {
        const importIndex = patchedContent.indexOf('import');
        if (importIndex !== -1) {
            finalContent = patchedContent.slice(0, importIndex) + 
                          "import fs from 'fs/promises';\nimport path from 'path';\n" +
                          patchedContent.slice(importIndex);
        }
    }
    
    // Write patched file
    await fs.writeFile(SERVICE_FILE, finalContent);
    console.log('✓ Patched service file to save audio samples');
    
    console.log('\n📋 Next steps:');
    console.log('1. Set environment variable: export MB_SAVE_STT_SAMPLES=1');
    console.log('2. Restart MonsterBox: sudo systemctl restart monsterbox');
    console.log('3. Use STT feature (speak into microphone)');
    console.log(`4. Check samples in: ${SAMPLE_DIR}`);
    console.log('5. When done, run: node scripts/save-stt-audio-samples.js --disable');
}

async function disableSampleSaving() {
    console.log('🔧 Disabling STT audio sample saving...\n');
    
    // Check if backup exists
    try {
        await fs.access(BACKUP_FILE);
    } catch {
        console.log('⚠️  No backup file found - service may not be patched');
        return;
    }
    
    // Restore from backup
    const backupContent = await fs.readFile(BACKUP_FILE, 'utf8');
    await fs.writeFile(SERVICE_FILE, backupContent);
    console.log('✓ Restored service file from backup');
    
    // Remove backup
    await fs.unlink(BACKUP_FILE);
    console.log('✓ Removed backup file');
    
    console.log('\n📋 Next steps:');
    console.log('1. Restart MonsterBox: sudo systemctl restart monsterbox');
    console.log('2. Audio samples are still available in: ' + SAMPLE_DIR);
}

async function listSamples() {
    console.log('📁 STT Audio Samples:\n');
    
    try {
        const files = await fs.readdir(SAMPLE_DIR);
        
        if (files.length === 0) {
            console.log('No samples found.');
            return;
        }
        
        const samples = [];
        for (const file of files) {
            const filePath = path.join(SAMPLE_DIR, file);
            const stats = await fs.stat(filePath);
            samples.push({
                name: file,
                size: stats.size,
                time: stats.mtime
            });
        }
        
        // Sort by time (newest first)
        samples.sort((a, b) => b.time - a.time);
        
        console.log(`Found ${samples.length} sample(s):\n`);
        for (const sample of samples) {
            const sizeKB = (sample.size / 1024).toFixed(2);
            const timeStr = sample.time.toLocaleString();
            console.log(`  ${sample.name}`);
            console.log(`    Size: ${sizeKB} KB`);
            console.log(`    Time: ${timeStr}`);
            console.log('');
        }
        
        console.log(`\nTo test a sample with ElevenLabs API:`);
        console.log(`  curl -X POST "https://api.elevenlabs.io/v1/speech-to-text" \\`);
        console.log(`    -H "xi-api-key: $(cat /etc/monsterbox/elevenlabs.key)" \\`);
        console.log(`    -F "model_id=scribe_v2" \\`);
        console.log(`    -F "language_code=en" \\`);
        console.log(`    -F "file=@${SAMPLE_DIR}/FILENAME.wav"`);
        
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('Sample directory does not exist yet.');
        } else {
            throw err;
        }
    }
}

async function cleanSamples() {
    console.log('🗑️  Cleaning STT audio samples...\n');
    
    try {
        const files = await fs.readdir(SAMPLE_DIR);
        
        if (files.length === 0) {
            console.log('No samples to clean.');
            return;
        }
        
        for (const file of files) {
            await fs.unlink(path.join(SAMPLE_DIR, file));
        }
        
        console.log(`✓ Removed ${files.length} sample(s)`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('Sample directory does not exist.');
        } else {
            throw err;
        }
    }
}

// Main
const args = process.argv.slice(2);
const command = args[0];

try {
    if (command === '--disable' || command === '-d') {
        await disableSampleSaving();
    } else if (command === '--list' || command === '-l') {
        await listSamples();
    } else if (command === '--clean' || command === '-c') {
        await cleanSamples();
    } else if (command === '--help' || command === '-h' || !command) {
        console.log('STT Audio Sample Saver\n');
        console.log('Usage:');
        console.log('  node scripts/save-stt-audio-samples.js [command]\n');
        console.log('Commands:');
        console.log('  (none)      Enable sample saving (default)');
        console.log('  --disable   Disable sample saving and restore original service');
        console.log('  --list      List saved samples');
        console.log('  --clean     Delete all saved samples');
        console.log('  --help      Show this help\n');
    } else {
        await enableSampleSaving();
    }
} catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
}

