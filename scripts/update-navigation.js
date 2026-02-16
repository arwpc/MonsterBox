#!/usr/bin/env node

/**
 * Script to update all EJS files to use the unified navigation component
 * This ensures EVERY page uses the same navigation structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Files that need to be updated with their corresponding page names
const filesToUpdate = [
    // AI Settings pages
    { file: 'views/ai-settings/stt.ejs', page: 'ai-settings-stt' },
    { file: 'views/ai-settings/tts.ejs', page: 'ai-settings-tts' },
    { file: 'views/ai-settings/agents.ejs', page: 'ai-settings-agents' },
    { file: 'views/ai-settings/character-assignment.ejs', page: 'ai-settings-assignment' },
    
    // Setup pages
    { file: 'views/setup/calibration.ejs', page: 'setup-calibration' },
    { file: 'views/setup/poses.ejs', page: 'setup-poses' },
    { file: 'views/setup/super-powers.ejs', page: 'setup-super-powers' },
    { file: 'views/setup/system.ejs', page: 'setup-system' },
    { file: 'views/setup/characters.ejs', page: 'setup-characters' },
    { file: 'views/setup/audio.ejs', page: 'setup-audio' },
    { file: 'views/setup/calibration-continuous-servo.ejs', page: 'setup-calibration' },
    { file: 'views/setup/calibration-standard-servo.ejs', page: 'setup-calibration' },
    { file: 'views/setup/calibration-linear-actuator.ejs', page: 'setup-calibration' },
    
    // Error page
    { file: 'views/error.ejs', page: 'error' }
];

function updateNavigationInFile(filePath, pageName) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found: ${filePath}`);
            return false;
        }

        let content = fs.readFileSync(filePath, 'utf8');
        
        // Check if file already uses unified navigation
        if (content.includes('unified-navigation')) {
            console.log(`✅ Already updated: ${filePath}`);
            return true;
        }

        // Find and replace navigation sections
        const navPatterns = [
            // Pattern 1: Full navbar with container-fluid
            /<nav class="navbar[^>]*>[\s\S]*?<\/nav>/g,
            // Pattern 2: Navigation comments and includes
            /<!--[\s\S]*?Navigation[\s\S]*?-->[\s\S]*?<nav[\s\S]*?<\/nav>/g
        ];

        let updated = false;
        for (const pattern of navPatterns) {
            if (pattern.test(content)) {
                // Determine the correct include path based on file location
                const includeDepth = filePath.split('/').length - 2; // views is depth 1
                const includePath = '../'.repeat(includeDepth) + 'components/unified-navigation';
                
                const replacement = `    <!-- Unified Navigation - Same on ALL pages -->
    <%- include('${includePath}', { page: '${pageName}', currentCharacter: currentCharacter }) %>`;

                content = content.replace(pattern, replacement);
                updated = true;
                break;
            }
        }

        if (updated) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Updated: ${filePath}`);
            return true;
        } else {
            console.log(`⚠️  No navigation found in: ${filePath}`);
            return false;
        }

    } catch (error) {
        console.error(`❌ Error updating ${filePath}:`, error.message);
        return false;
    }
}

function main() {
    console.log('🎭 MonsterBox Navigation Unification Script');
    console.log('============================================');
    console.log('Updating all pages to use unified navigation...\n');

    let successCount = 0;
    let totalCount = filesToUpdate.length;

    for (const { file, page } of filesToUpdate) {
        if (updateNavigationInFile(file, page)) {
            successCount++;
        }
    }

    console.log('\n============================================');
    console.log(`📊 Results: ${successCount}/${totalCount} files updated successfully`);
    
    if (successCount === totalCount) {
        console.log('🎉 All files updated! Navigation is now unified across ALL pages.');
    } else {
        console.log('⚠️  Some files may need manual review.');
    }
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { updateNavigationInFile };
