#!/usr/bin/env node

/**
 * Fix Navigation Include Paths
 * Fixes all EJS files to use correct relative paths for unified navigation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🔧 MonsterBox Navigation Path Fix');
console.log('=================================');

// Find all EJS files with wrong include paths
function findEjsFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            findEjsFiles(fullPath, files);
        } else if (item.endsWith('.ejs')) {
            files.push(fullPath);
        }
    }
    
    return files;
}

// Fix include paths in a file
function fixIncludePaths(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check if file has wrong include path
        if (content.includes("include('components/unified-navigation'")) {
            const fixed = content.replace(
                /include\('components\/unified-navigation'/g,
                "include('../components/unified-navigation'"
            );
            
            fs.writeFileSync(filePath, fixed, 'utf8');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error(`❌ Error fixing ${filePath}:`, error.message);
        return false;
    }
}

// Main execution
const viewsDir = path.join(rootDir, 'views');
const ejsFiles = findEjsFiles(viewsDir);

let fixedCount = 0;
let totalCount = 0;

console.log(`Found ${ejsFiles.length} EJS files to check...`);
console.log('');

for (const filePath of ejsFiles) {
    const relativePath = path.relative(rootDir, filePath);
    
    // Skip the navigation component itself
    if (relativePath.includes('components/unified-navigation.ejs')) {
        continue;
    }
    
    totalCount++;
    
    if (fixIncludePaths(filePath)) {
        console.log(`✅ Fixed: ${relativePath}`);
        fixedCount++;
    }
}

console.log('');
console.log('=================================');
console.log(`📊 Results: ${fixedCount}/${totalCount} files fixed`);

if (fixedCount > 0) {
    console.log('🎉 Navigation include paths fixed!');
    console.log('🚀 Restart the server to apply changes.');
} else {
    console.log('✅ All navigation paths are already correct.');
}
