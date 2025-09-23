#!/usr/bin/env node

/**
 * Fix all navigation includes to use the simple Bootstrap methodology
 */

import fs from 'fs';
import path from 'path';

const filesToFix = [
    { file: 'views/setup/parts.ejs', page: 'setup-parts' },
    { file: 'views/setup/calibration.ejs', page: 'setup-calibration' },
    { file: 'views/setup/webcam.ejs', page: 'setup-webcam' },
    { file: 'views/setup/poses.ejs', page: 'setup-poses' },
    { file: 'views/setup/audio.ejs', page: 'setup-audio' },
    { file: 'views/setup/characters.ejs', page: 'setup-characters' },
    { file: 'views/setup/super-powers.ejs', page: 'setup-super-powers' },
    { file: 'views/setup/system.ejs', page: 'setup-system' },
    { file: 'views/setup/models.ejs', page: 'setup-models' },
    { file: 'views/ai-settings/stt.ejs', page: 'ai-settings-stt' },
    { file: 'views/ai-settings/tts.ejs', page: 'ai-settings-tts' },
    { file: 'views/ai-settings/agents.ejs', page: 'ai-settings-agents' },
    { file: 'views/ai-settings/character-assignment.ejs', page: 'ai-settings-assignment' },
    { file: 'views/live/dashboard.ejs', page: 'live' },
    { file: 'views/scenes/scenes.ejs', page: 'scenes' },
    { file: 'views/audio-library/index.ejs', page: 'audio-library' },
    { file: 'views/error.ejs', page: 'error' }
];

function fixNavigationInclude(filePath, pageName) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found: ${filePath}`);
            return false;
        }

        let content = fs.readFileSync(filePath, 'utf8');
        
        // Find the current include pattern and replace it
        const includePattern = /<%- include\(['"]\.\.\/components\/unified-navigation['"],\s*\{[^}]*\}\s*\)\s*%>/g;
        
        // Determine the correct relative path
        const depth = filePath.split('/').length - 2; // views is depth 1
        const relativePath = '../'.repeat(depth - 1) + 'components/unified-navigation';
        
        const newInclude = `<%- include('${relativePath}', { page: '${pageName}' }) %>`;
        
        if (includePattern.test(content)) {
            content = content.replace(includePattern, newInclude);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Fixed: ${filePath}`);
            return true;
        } else {
            console.log(`⚪ No include found in: ${filePath}`);
            return false;
        }

    } catch (error) {
        console.error(`❌ Error fixing ${filePath}:`, error.message);
        return false;
    }
}

function main() {
    console.log('🔧 Fixing Navigation Includes');
    console.log('=============================');
    
    let fixedCount = 0;
    
    for (const { file, page } of filesToFix) {
        if (fixNavigationInclude(file, page)) {
            fixedCount++;
        }
    }
    
    console.log('\n=============================');
    console.log(`📊 Fixed ${fixedCount}/${filesToFix.length} files`);
    console.log('🎭 Navigation includes updated to use simple Bootstrap methodology');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { fixNavigationInclude };
