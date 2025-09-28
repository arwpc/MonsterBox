#!/usr/bin/env node

/**
 * Fix ALL navigation include paths once and for all
 * This will systematically fix every single EJS file in the views directory
 */

import fs from 'fs';
import path from 'path';

function getAllEjsFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.')) {
            getAllEjsFiles(fullPath, files);
        } else if (item.endsWith('.ejs')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

function fixNavigationInclude(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let changed = false;
        
        // Calculate the correct relative path based on file location
        const relativePath = path.relative(path.dirname(filePath), 'views/components');
        const correctIncludePath = path.join(relativePath, 'unified-navigation').replace(/\\/g, '/');
        
        // Pattern 1: Wrong include path without ../
        const wrongPattern1 = /<%- include\(['"]components\/unified-navigation['"],\s*\{[^}]*\}\s*\)\s*%>/g;
        if (wrongPattern1.test(content)) {
            content = content.replace(wrongPattern1, (match) => {
                const pageMatch = match.match(/page:\s*['"]([^'"]*)['"]/);
                const pageName = pageMatch ? pageMatch[1] : 'dashboard';
                return `<%- include('${correctIncludePath}', { page: '${pageName}' }) %>`;
            });
            changed = true;
        }
        
        // Pattern 2: Any other malformed include patterns
        const wrongPattern2 = /<%- include\(['"][^'"]*unified-navigation['"],\s*\{[^}]*\}\s*\)\s*%>/g;
        if (wrongPattern2.test(content)) {
            content = content.replace(wrongPattern2, (match) => {
                const pageMatch = match.match(/page:\s*['"]([^'"]*)['"]/);
                const pageName = pageMatch ? pageMatch[1] : 'dashboard';
                return `<%- include('${correctIncludePath}', { page: '${pageName}' }) %>`;
            });
            changed = true;
        }
        
        if (changed) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Fixed: ${filePath}`);
            return true;
        } else {
            console.log(`⚪ OK: ${filePath}`);
            return false;
        }
        
    } catch (error) {
        console.error(`❌ Error fixing ${filePath}:`, error.message);
        return false;
    }
}

function main() {
    console.log('🔧 Fixing ALL Navigation Include Paths');
    console.log('=====================================');
    
    const ejsFiles = getAllEjsFiles('views');
    let fixedCount = 0;
    
    console.log(`Found ${ejsFiles.length} EJS files to check...\n`);
    
    for (const file of ejsFiles) {
        if (fixNavigationInclude(file)) {
            fixedCount++;
        }
    }
    
    console.log('\n=====================================');
    console.log(`📊 Fixed ${fixedCount}/${ejsFiles.length} files`);
    console.log('🎭 ALL navigation includes are now correct!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { fixNavigationInclude };
